/**
 * Deterministic embeddings client.
 *
 * The same input always produces the same vector — no network call, and the
 * seed is derived from the text itself (via `hashEvidence`, the same SHA-256
 * digest the audit-evidence trail uses) rather than `Math.random()`, per the
 * project's rule that domain randomness must be reproducible. It is not a real
 * embedding: two semantically similar strings do not land near each other in
 * the vector space. It exists so semantic search has *something* to query in
 * demo mode / with no `OPENAI_API_KEY`, and so tests never make a network call.
 */

import { hashEvidence } from "@/lib/domain/audit/hash";
import { mulberry32, normal } from "@/lib/domain/math/random";

import { DEFAULT_EMBEDDING_DIMENSIONS, type Embedding, type EmbeddingClient } from "./types";

export const DETERMINISTIC_EMBEDDING_MODEL = "deterministic";

/** Derives a 32-bit PRNG seed from text, so the same text always seeds the same way. */
export function seedFromText(text: string): number {
  const digest = hashEvidence(text);
  return Number.parseInt(digest.slice(0, 8), 16);
}

/** Unit-normalises a vector so cosine similarity behaves the way a real embedding's would. */
function normalise(vector: readonly number[]): readonly number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) return vector;
  return vector.map((value) => value / magnitude);
}

export class DeterministicEmbeddingsClient implements EmbeddingClient {
  readonly provider = "deterministic";
  readonly model: string;
  readonly dimensions: number;
  readonly isDeterministic = true;

  constructor(config: { readonly model?: string; readonly dimensions?: number } = {}) {
    this.model = config.model ?? DETERMINISTIC_EMBEDDING_MODEL;
    this.dimensions = config.dimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
  }

  async embed(text: string): Promise<Embedding> {
    const rng = mulberry32(seedFromText(text));
    const raw = Array.from({ length: this.dimensions }, () => normal(rng, 0, 1));
    return {
      vector: normalise(raw),
      dimensions: this.dimensions,
      model: this.model,
      provider: this.provider,
    };
  }
}
