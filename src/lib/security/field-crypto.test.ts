import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FIELD_CRYPTO_VERSION,
  FieldCryptoError,
  MissingEncryptionKeyError,
  currentFieldCryptoVersion,
  decryptField,
  decryptFieldIfEncrypted,
  decryptJson,
  encryptField,
  encryptJson,
  generateApiKey,
  hashApiKey,
  hashPassword,
  isEncrypted,
  isFieldCryptoConfigured,
  resolveKey,
  resolveKeyForVersion,
  rotateFieldValue,
  verifyPassword,
} from "./field-crypto";

const KEY = randomBytes(32);
const KEY_BASE64 = KEY.toString("base64");
const KEY_V2 = randomBytes(32);
const KEY_V2_BASE64 = KEY_V2.toString("base64");
const ORIGINAL_KEY = process.env.FIELD_ENCRYPTION_KEY;
const ORIGINAL_KEY_V2 = process.env.FIELD_ENCRYPTION_KEY_V2;

beforeEach(() => {
  process.env.FIELD_ENCRYPTION_KEY = KEY_BASE64;
  delete process.env.FIELD_ENCRYPTION_KEY_V2;
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.FIELD_ENCRYPTION_KEY;
  else process.env.FIELD_ENCRYPTION_KEY = ORIGINAL_KEY;
  if (ORIGINAL_KEY_V2 === undefined) delete process.env.FIELD_ENCRYPTION_KEY_V2;
  else process.env.FIELD_ENCRYPTION_KEY_V2 = ORIGINAL_KEY_V2;
});

describe("resolveKey", () => {
  it("accepts a 32-byte base64 key", () => {
    expect(resolveKey(KEY_BASE64).equals(KEY)).toBe(true);
  });

  it("accepts a 64-character hex key", () => {
    expect(resolveKey(KEY.toString("hex")).equals(KEY)).toBe(true);
  });

  it("accepts base64url, which is what a URL-safe secret store returns", () => {
    expect(resolveKey(KEY.toString("base64url")).equals(KEY)).toBe(true);
  });

  it("throws a clear, actionable error when the key is missing", () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => resolveKey()).toThrow(MissingEncryptionKeyError);
    expect(() => resolveKey("")).toThrow(MissingEncryptionKeyError);
    expect(() => resolveKey("   ")).toThrow(MissingEncryptionKeyError);
    try {
      resolveKey();
    } catch (error) {
      expect((error as MissingEncryptionKeyError).code).toBe("FIELD_ENCRYPTION_KEY_MISSING");
      expect((error as Error).message).toMatch(/randomBytes\(32\)/);
    }
  });

  it("refuses a key of the wrong length instead of padding it", () => {
    expect(() => resolveKey(randomBytes(16).toString("base64"))).toThrow(FieldCryptoError);
    expect(() => resolveKey(randomBytes(64).toString("base64"))).toThrow(/must decode to 32/);
  });
});

describe("isFieldCryptoConfigured", () => {
  it("reports the configuration status without throwing", () => {
    expect(isFieldCryptoConfigured(KEY_BASE64)).toBe(true);
    expect(isFieldCryptoConfigured("too-short")).toBe(false);
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(isFieldCryptoConfigured()).toBe(false);
  });
});

describe("encryptField / decryptField", () => {
  it("round-trips a value", () => {
    const secret = "TOTP-SEED-JBSWY3DPEHPK3PXP";
    const stored = encryptField(secret);
    expect(decryptField(stored)).toBe(secret);
  });

  it("round-trips Korean text and emoji-free unicode", () => {
    const secret = "비밀번호 해시 · 한빛소재";
    expect(decryptField(encryptField(secret))).toBe(secret);
  });

  it("round-trips an empty string", () => {
    expect(decryptField(encryptField(""))).toBe("");
  });

  it("emits the documented v1.iv.tag.ciphertext envelope", () => {
    const stored = encryptField("value");
    const parts = stored.split(".");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe(FIELD_CRYPTO_VERSION);
    expect(Buffer.from(parts[1], "base64url")).toHaveLength(12);
    expect(Buffer.from(parts[2], "base64url")).toHaveLength(16);
    expect(isEncrypted(stored)).toBe(true);
  });

  it("produces a different ciphertext each time for the same plaintext", () => {
    const a = encryptField("same-secret");
    const b = encryptField("same-secret");
    expect(a).not.toBe(b);
    expect(decryptField(a)).toBe(decryptField(b));
  });

  it("never leaks the plaintext into the stored value", () => {
    const stored = encryptField("super-secret-credential");
    expect(stored).not.toContain("super-secret");
  });

  it("throws when the ciphertext has been tampered with", () => {
    const stored = encryptField("value");
    const parts = stored.split(".");
    const data = Buffer.from(parts[3], "base64url");
    data[0] = data[0] ^ 0xff;
    const tampered = [parts[0], parts[1], parts[2], data.toString("base64url")].join(".");
    expect(() => decryptField(tampered)).toThrow(FieldCryptoError);
    expect(() => decryptField(tampered)).toThrow(/altered or the key is wrong/);
  });

  it("throws when the authentication tag has been tampered with", () => {
    const stored = encryptField("value");
    const parts = stored.split(".");
    const tag = Buffer.from(parts[2], "base64url");
    tag[0] = tag[0] ^ 0xff;
    const tampered = [parts[0], parts[1], tag.toString("base64url"), parts[3]].join(".");
    expect(() => decryptField(tampered)).toThrow(FieldCryptoError);
  });

  it("throws when decrypted with a different key", () => {
    const stored = encryptField("value", resolveKey(KEY_BASE64));
    expect(() => decryptField(stored, randomBytes(32))).toThrow(FieldCryptoError);
  });

  it("rejects a malformed envelope", () => {
    expect(() => decryptField("not-encrypted")).toThrow(/must have the form/);
    expect(() => decryptField("v1.a.b")).toThrow(/must have the form/);
    expect(() => decryptField("v3.a.b.c")).toThrow(/Unsupported field-crypto version/);
    expect(() => decryptField("")).toThrow(/non-empty string/);
  });

  it("rejects an iv or tag of the wrong length", () => {
    const stored = encryptField("value");
    const parts = stored.split(".");
    const shortIv = randomBytes(8).toString("base64url");
    expect(() => decryptField([parts[0], shortIv, parts[2], parts[3]].join("."))).toThrow(
      /iv segment must be 12 bytes/,
    );
    const shortTag = randomBytes(8).toString("base64url");
    expect(() => decryptField([parts[0], parts[1], shortTag, parts[3]].join("."))).toThrow(
      /authTag segment must be 16 bytes/,
    );
  });

  it("throws the missing-key error when no key is configured", () => {
    delete process.env.FIELD_ENCRYPTION_KEY;
    expect(() => encryptField("value")).toThrow(MissingEncryptionKeyError);
    expect(() => decryptField("v1.a.b.c")).toThrow(MissingEncryptionKeyError);
  });
});

describe("key rotation (v1 -> v2)", () => {
  it("defaults to v1 when no rotation key is configured", () => {
    expect(currentFieldCryptoVersion()).toBe("v1");
    expect(encryptField("value").startsWith("v1.")).toBe(true);
  });

  it("switches new writes to v2 once FIELD_ENCRYPTION_KEY_V2 is set", () => {
    process.env.FIELD_ENCRYPTION_KEY_V2 = KEY_V2_BASE64;
    expect(currentFieldCryptoVersion()).toBe("v2");

    const stored = encryptField("value");
    expect(stored.startsWith("v2.")).toBe(true);
    // Decrypts under FIELD_ENCRYPTION_KEY_V2 automatically, from the prefix.
    expect(decryptField(stored)).toBe("value");
  });

  it("still decrypts v1 rows after FIELD_ENCRYPTION_KEY_V2 is introduced", () => {
    const v1Stored = encryptField("old secret");
    process.env.FIELD_ENCRYPTION_KEY_V2 = KEY_V2_BASE64;

    expect(decryptField(v1Stored)).toBe("old secret");
  });

  it("resolveKeyForVersion resolves the matching env var for each version", () => {
    process.env.FIELD_ENCRYPTION_KEY_V2 = KEY_V2_BASE64;
    expect(resolveKeyForVersion("v1").equals(KEY)).toBe(true);
    expect(resolveKeyForVersion("v2").equals(KEY_V2)).toBe(true);
  });

  it("resolveKeyForVersion('v2') throws a v2-specific missing-key error", () => {
    expect(() => resolveKeyForVersion("v2")).toThrow(MissingEncryptionKeyError);
    try {
      resolveKeyForVersion("v2");
    } catch (error) {
      expect((error as Error).message).toContain("FIELD_ENCRYPTION_KEY_V2");
    }
  });

  it("rotateFieldValue re-encrypts under the new key and tags v2", () => {
    const stored = encryptField("rotate-me", KEY);
    expect(stored.startsWith("v1.")).toBe(true);

    const rotated = rotateFieldValue(stored, KEY, KEY_V2);
    expect(rotated.startsWith("v2.")).toBe(true);
    expect(decryptField(rotated, KEY_V2)).toBe("rotate-me");
    // The old key can no longer decrypt the rotated ciphertext.
    expect(() => decryptField(rotated, KEY)).toThrow(FieldCryptoError);
  });

  it("rotateFieldValue round-trips through the env-resolved decrypt path", () => {
    const stored = encryptField("value");
    process.env.FIELD_ENCRYPTION_KEY_V2 = KEY_V2_BASE64;

    const rotated = rotateFieldValue(stored, KEY, KEY_V2);
    expect(decryptField(rotated)).toBe("value");
  });
});

describe("encryptJson / decryptJson", () => {
  it("round-trips a credentials object", () => {
    const credentials = { host: "erp.internal", user: "svc_cios", token: "abc123" };
    const stored = encryptJson(credentials);
    expect(decryptJson<typeof credentials>(stored)).toEqual(credentials);
    expect(stored).not.toContain("abc123");
  });

  it("throws when the decrypted value is not JSON", () => {
    const stored = encryptField("plain text, not json");
    expect(() => decryptJson(stored)).toThrow(/not valid JSON/);
  });
});

describe("decryptFieldIfEncrypted", () => {
  it("decrypts an encrypted value and passes plaintext through untouched", () => {
    expect(decryptFieldIfEncrypted(encryptField("secret"))).toBe("secret");
    expect(decryptFieldIfEncrypted("legacy-plaintext")).toBe("legacy-plaintext");
    expect(decryptFieldIfEncrypted(null)).toBeNull();
    expect(decryptFieldIfEncrypted(undefined)).toBeNull();
  });
});

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password and rejects a wrong one", () => {
    const stored = hashPassword("correct-horse-battery");
    expect(verifyPassword("correct-horse-battery", stored)).toBe(true);
    expect(verifyPassword("Correct-horse-battery", stored)).toBe(false);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("salts each digest, so two identical passwords hash differently", () => {
    const a = hashPassword("same-password-value");
    const b = hashPassword("same-password-value");
    expect(a).not.toBe(b);
    expect(verifyPassword("same-password-value", a)).toBe(true);
    expect(verifyPassword("same-password-value", b)).toBe(true);
  });

  it("emits the documented scrypt envelope and never the password", () => {
    const stored = hashPassword("a-long-enough-password");
    const parts = stored.split("$");
    expect(parts[0]).toBe("scrypt");
    expect(Number(parts[1])).toBe(32_768);
    expect(parts).toHaveLength(6);
    expect(stored).not.toContain("a-long-enough-password");
  });

  it("is deterministic for a fixed salt", () => {
    const salt = randomBytes(16);
    expect(hashPassword("fixed-salt-password", salt)).toBe(
      hashPassword("fixed-salt-password", salt),
    );
  });

  it("refuses a password shorter than eight characters", () => {
    expect(() => hashPassword("short")).toThrow(/at least 8 characters/);
  });

  it("rejects a malformed stored digest instead of throwing", () => {
    expect(verifyPassword("anything", "not-a-digest")).toBe(false);
    expect(verifyPassword("anything", "bcrypt$1$2$3$4$5")).toBe(false);
    expect(verifyPassword("anything", "scrypt$x$8$1$c2FsdA==$ZGlnZXN0")).toBe(false);
    expect(verifyPassword("anything", "scrypt$32768$8$1$$")).toBe(false);
  });
});

describe("generateApiKey / hashApiKey", () => {
  it("returns a token whose digest is what gets persisted", () => {
    const key = generateApiKey();
    expect(key.token.startsWith(key.prefix)).toBe(true);
    expect(key.keyHash).toBe(hashApiKey(key.token));
    expect(key.keyHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("never puts the secret in the prefix that gets displayed in a list", () => {
    const key = generateApiKey();
    const secret = key.token.slice(key.prefix.length + 1);
    expect(key.prefix).not.toContain(secret);
    expect(secret.length).toBeGreaterThan(20);
  });

  it("labels the environment in the prefix", () => {
    expect(generateApiKey("test").prefix.startsWith("cios_test_")).toBe(true);
    expect(generateApiKey().prefix.startsWith("cios_live_")).toBe(true);
  });

  it("mints a unique token every time", () => {
    const tokens = new Set(Array.from({ length: 20 }, () => generateApiKey().token));
    expect(tokens.size).toBe(20);
  });

  it("hashes a presented token stably and ignores surrounding whitespace", () => {
    const key = generateApiKey();
    expect(hashApiKey(` ${key.token} `)).toBe(key.keyHash);
    expect(hashApiKey("other-token")).not.toBe(key.keyHash);
  });
});
