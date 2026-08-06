/**
 * Envelope encryption for sensitive database columns (decision 13).
 *
 * AES-256-GCM via Node's built-in `crypto`, keyed from `FIELD_ENCRYPTION_KEY`.
 * Applies to `User.passwordHash`, `User.mfaSecret`, `DataSource.credentials` and
 * `MCPServer` configuration — values that must be unreadable to anyone with only
 * a database dump.
 *
 * Format of a ciphertext, as stored in the column:
 *
 *     v1.<base64url iv>.<base64url authTag>.<base64url ciphertext>
 *
 * The version prefix means a future key rotation or algorithm change can be
 * introduced without guessing at the encoding of existing rows. GCM's
 * authentication tag is stored separately and verified on decrypt, so a tampered
 * ciphertext throws rather than silently decrypting to garbage.
 *
 * Passwords themselves live in Supabase Auth. `User.passwordHash` is only
 * populated for the local/offline seed user, and even then it stores a scrypt
 * digest — `hashPassword` below — not a recoverable password.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";

import { AppError } from "@/lib/core/errors";

export const FIELD_CRYPTO_VERSION = "v1";
/**
 * Every version this module can decrypt. `v2` exists so a key rotation can begin
 * (set `FIELD_ENCRYPTION_KEY_V2`, run `rotateFieldEncryptionAction`) without
 * invalidating rows still tagged `v1` under the original key — both keys can be
 * live at once, which is what makes the rotation safe to run against a live table.
 */
export const FIELD_CRYPTO_VERSIONS = ["v1", "v2"] as const;
export type FieldCryptoVersion = (typeof FIELD_CRYPTO_VERSIONS)[number];

export function isFieldCryptoVersion(value: string): value is FieldCryptoVersion {
  return (FIELD_CRYPTO_VERSIONS as readonly string[]).includes(value);
}

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;

export class FieldCryptoError extends AppError {
  constructor(message: string, context: Record<string, unknown> = {}) {
    super("FIELD_CRYPTO_ERROR", message, context);
  }
}

export class MissingEncryptionKeyError extends AppError {
  constructor(envVar = "FIELD_ENCRYPTION_KEY") {
    super(
      "FIELD_ENCRYPTION_KEY_MISSING",
      `${envVar} is not configured. Generate one with ` +
        '`node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"` ' +
        "and set it in the environment before storing or reading encrypted fields.",
      {},
    );
  }
}

/**
 * Resolves the 32-byte key from `FIELD_ENCRYPTION_KEY`.
 *
 * Accepts base64, base64url or 64 hex characters. A key of the wrong length is an
 * error rather than something to pad or truncate — a silently weakened key is
 * worse than a failed start-up.
 */
/**
 * Not a default parameter for `raw`, deliberately: a default parameter applies
 * whenever the argument is `undefined`, including when the caller passes an
 * *explicitly* unset env var — which is exactly the case `resolveKeyForVersion`
 * needs to distinguish for `FIELD_ENCRYPTION_KEY_V2`. Using an explicit `raw ??
 * fallback` inside the body, instead, keeps "not configured" from silently
 * resolving to a different key.
 */
function resolveNamedKey(raw: string | undefined, envVarName: string): Buffer {
  if (!raw || raw.trim().length === 0) {
    throw new MissingEncryptionKeyError(envVarName);
  }
  const value = raw.trim();

  let key: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    key = Buffer.from(value, "hex");
  } else {
    key = Buffer.from(value, "base64");
  }

  if (key.length !== KEY_BYTES) {
    throw new FieldCryptoError(
      `${envVarName} must decode to ${KEY_BYTES} bytes; got ${key.length}. ` +
        "Use 32 random bytes encoded as base64 or 64 hex characters.",
      { decodedBytes: key.length },
    );
  }
  return key;
}

export function resolveKey(raw: string | undefined = process.env.FIELD_ENCRYPTION_KEY): Buffer {
  return resolveNamedKey(raw, "FIELD_ENCRYPTION_KEY");
}

/** Resolves the key for a specific ciphertext version: `v1` → `FIELD_ENCRYPTION_KEY`, `v2` → `FIELD_ENCRYPTION_KEY_V2`. */
export function resolveKeyForVersion(version: FieldCryptoVersion): Buffer {
  return version === "v2"
    ? resolveNamedKey(process.env.FIELD_ENCRYPTION_KEY_V2, "FIELD_ENCRYPTION_KEY_V2")
    : resolveKey();
}

/**
 * The version new writes should use. `v2` once `FIELD_ENCRYPTION_KEY_V2` is set —
 * that is the signal a rotation is in progress — otherwise `v1`, unchanged from
 * every deployment that has never rotated a key.
 */
export function currentFieldCryptoVersion(): FieldCryptoVersion {
  const v2 = process.env.FIELD_ENCRYPTION_KEY_V2;
  return v2 && v2.trim().length > 0 ? "v2" : "v1";
}

/** True when a usable key is configured; for the settings status panel. */
export function isFieldCryptoConfigured(
  raw: string | undefined = process.env.FIELD_ENCRYPTION_KEY,
): boolean {
  try {
    resolveKey(raw);
    return true;
  } catch {
    return false;
  }
}

function encodeSegment(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function decodeSegment(value: string, label: string, expectedBytes?: number): Buffer {
  const buffer = Buffer.from(value, "base64url");
  // The ciphertext segment is legitimately empty for an empty plaintext; the iv
  // and tag never are, and both declare an expected length below.
  if (buffer.length === 0 && expectedBytes !== undefined) {
    throw new FieldCryptoError(`Ciphertext ${label} segment is empty`, { label });
  }
  if (expectedBytes !== undefined && buffer.length !== expectedBytes) {
    throw new FieldCryptoError(
      `Ciphertext ${label} segment must be ${expectedBytes} bytes; got ${buffer.length}`,
      { label, bytes: buffer.length },
    );
  }
  return buffer;
}

/** True when a stored value looks like output of `encryptField`. */
export function isEncrypted(value: string): boolean {
  const [version, ...rest] = value.split(".");
  return isFieldCryptoVersion(version) && rest.length === 3;
}

/**
 * Encrypts a UTF-8 string.
 *
 * A fresh random IV is generated per call, so encrypting the same plaintext twice
 * yields different ciphertexts — required for GCM, and it also prevents an
 * attacker from spotting two users with the same secret.
 *
 * When `key` is omitted, both the key and the version tag are resolved from
 * `currentFieldCryptoVersion()` — `v2` once a rotation is under way, `v1`
 * otherwise. An explicitly supplied `key` keeps the historical default of tagging
 * the output `v1` unless the caller also names a `version` (`rotateFieldValue`
 * does, to write `v2` under the new key it was handed).
 */
export function encryptField(
  plaintext: string,
  key?: Buffer,
  version: FieldCryptoVersion = key ? FIELD_CRYPTO_VERSION : currentFieldCryptoVersion(),
): string {
  if (typeof plaintext !== "string") {
    throw new FieldCryptoError("encryptField expects a string", {
      received: typeof plaintext,
    });
  }
  const resolvedKey = key ?? resolveKeyForVersion(version);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, resolvedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [version, encodeSegment(iv), encodeSegment(authTag), encodeSegment(ciphertext)].join(".");
}

/**
 * Decrypts a value produced by `encryptField`.
 *
 * When `key` is omitted, it is resolved from the ciphertext's own version prefix
 * (`v1` → `FIELD_ENCRYPTION_KEY`, `v2` → `FIELD_ENCRYPTION_KEY_V2`), so `v1` rows
 * written before a rotation keep decrypting under the old key after
 * `FIELD_ENCRYPTION_KEY_V2` is introduced.
 * @throws FieldCryptoError when the format is wrong or the auth tag fails.
 */
export function decryptField(stored: string, key?: Buffer): string {
  if (typeof stored !== "string" || stored.length === 0) {
    throw new FieldCryptoError("decryptField expects a non-empty string", {});
  }
  const parts = stored.split(".");
  if (parts.length !== 4) {
    throw new FieldCryptoError(
      "Ciphertext must have the form v1.<iv>.<authTag>.<ciphertext>",
      { segments: parts.length },
    );
  }
  const [version, ivPart, tagPart, dataPart] = parts;
  if (!isFieldCryptoVersion(version)) {
    throw new FieldCryptoError(`Unsupported field-crypto version "${version}"`, { version });
  }
  const resolvedKey = key ?? resolveKeyForVersion(version);

  const iv = decodeSegment(ivPart, "iv", IV_BYTES);
  const authTag = decodeSegment(tagPart, "authTag", AUTH_TAG_BYTES);
  const ciphertext = decodeSegment(dataPart, "ciphertext");

  const decipher = createDecipheriv(ALGORITHM, resolvedKey, iv);
  decipher.setAuthTag(authTag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    // GCM raises on a tag mismatch. The message is deliberately generic so it
    // cannot be used as an oracle.
    throw new FieldCryptoError(
      "Failed to decrypt field: the ciphertext has been altered or the key is wrong",
      {},
    );
  }
}

/** Encrypts a JSON-serialisable value, e.g. `DataSource.credentials`. */
export function encryptJson(value: unknown, key?: Buffer): string {
  return encryptField(JSON.stringify(value), key);
}

/** Decrypts and parses a value written by `encryptJson`. */
export function decryptJson<T = unknown>(stored: string, key?: Buffer): T {
  const plaintext = decryptField(stored, key);
  try {
    return JSON.parse(plaintext) as T;
  } catch {
    throw new FieldCryptoError("Decrypted value is not valid JSON", {});
  }
}

/** Decrypts when the value is encrypted, and passes a plaintext value through. */
export function decryptFieldIfEncrypted(
  stored: string | null | undefined,
  key?: Buffer,
): string | null {
  if (stored === null || stored === undefined) return null;
  if (!isEncrypted(stored)) return stored;
  return decryptField(stored, key);
}

/**
 * Decrypts a stored value under `oldKey` and re-encrypts it under `newKey`,
 * tagged `newVersion`. Pure and synchronous — no env reads, no I/O — so the
 * caller (`rotateFieldEncryptionAction`) resolves both keys once from the
 * environment and this function does the actual per-row work.
 */
export function rotateFieldValue(
  stored: string,
  oldKey: Buffer,
  newKey: Buffer,
  newVersion: FieldCryptoVersion = "v2",
): string {
  const plaintext = decryptField(stored, oldKey);
  return encryptField(plaintext, newKey, newVersion);
}

// ---------------------------------------------------------------------------
// Password digest for the offline seed user
// ---------------------------------------------------------------------------

const SCRYPT_SALT_BYTES = 16;
const SCRYPT_KEY_BYTES = 64;
/** Deliberately expensive: 2^15 iterations, ~100 ms on a modern CPU. */
const SCRYPT_COST = 32_768;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISATION = 1;
/**
 * scrypt needs `128 * N * r` bytes (32 MiB at N=32768, r=8), which is exactly
 * Node's default `maxmem` ceiling and therefore rejected. The limit is raised
 * explicitly rather than weakening the cost parameter.
 */
const SCRYPT_MAXMEM = 96 * 1024 * 1024;
export const PASSWORD_HASH_PREFIX = "scrypt";

/**
 * scrypt digest for `User.passwordHash`.
 *
 * Node's `crypto` only — no bcrypt/argon2 native dependency, which keeps the seed
 * runnable with `tsx` and no build step. Format:
 *
 *     scrypt$<N>$<r>$<p>$<base64 salt>$<base64 digest>
 */
export function hashPassword(
  password: string,
  salt: Buffer = randomBytes(SCRYPT_SALT_BYTES),
): string {
  if (password.length < 8) {
    throw new FieldCryptoError("Password must be at least 8 characters", {
      length: password.length,
    });
  }
  const digest = scryptSync(password, salt, SCRYPT_KEY_BYTES, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK_SIZE,
    p: SCRYPT_PARALLELISATION,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    PASSWORD_HASH_PREFIX,
    SCRYPT_COST,
    SCRYPT_BLOCK_SIZE,
    SCRYPT_PARALLELISATION,
    salt.toString("base64"),
    digest.toString("base64"),
  ].join("$");
}

/** Constant-time verification of a `hashPassword` digest. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== PASSWORD_HASH_PREFIX) return false;

  const cost = Number(parts[1]);
  const blockSize = Number(parts[2]);
  const parallelisation = Number(parts[3]);
  if (!Number.isInteger(cost) || !Number.isInteger(blockSize) || !Number.isInteger(parallelisation)) {
    return false;
  }

  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");
  if (salt.length === 0 || expected.length === 0) return false;

  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length, {
      N: cost,
      r: blockSize,
      p: parallelisation,
      maxmem: SCRYPT_MAXMEM,
    });
  } catch {
    // Unusable parameters in the stored digest: treat as a failed verification
    // rather than crashing the sign-in path.
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

// ---------------------------------------------------------------------------
// API key material
// ---------------------------------------------------------------------------

export const API_KEY_PREFIX = "cios";
const API_KEY_SECRET_BYTES = 24;

export type GeneratedApiKey = {
  /** Shown to the user exactly once. */
  readonly token: string;
  /** Stored in `APIKey.prefix`, for identification in a list. */
  readonly prefix: string;
  /** Stored in `APIKey.keyHash`. */
  readonly keyHash: string;
};

/**
 * Mints an API key. The token is returned once; only its SHA-256 digest is
 * persisted, so a database dump cannot be replayed against the API.
 *
 * SHA-256 rather than scrypt is deliberate here: the token is 24 random bytes, so
 * there is nothing to brute-force, and every API request has to hash it.
 */
export function generateApiKey(environment = "live"): GeneratedApiKey {
  const secret = randomBytes(API_KEY_SECRET_BYTES).toString("base64url");
  const prefix = `${API_KEY_PREFIX}_${environment}_${secret.slice(0, 6)}`;
  const token = `${prefix}_${secret}`;
  return { token, prefix, keyHash: hashApiKey(token) };
}

/** SHA-256 digest of a presented API token, for the `APIKey.keyHash` lookup. */
export function hashApiKey(token: string): string {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
}
