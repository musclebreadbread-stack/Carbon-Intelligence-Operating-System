import { describe, expect, it } from "vitest";

import {
  DeterministicEmbeddingsClient,
  seedFromText,
} from "./deterministic-embeddings-client";
import { DEFAULT_EMBEDDING_DIMENSIONS } from "./types";

describe("seedFromText", () => {
  it("is stable for the same text", () => {
    expect(seedFromText("diesel delivery truck")).toBe(seedFromText("diesel delivery truck"));
  });

  it("differs for different text", () => {
    expect(seedFromText("diesel delivery truck")).not.toBe(seedFromText("electric forklift"));
  });
});

describe("DeterministicEmbeddingsClient", () => {
  it("reports itself as deterministic with the documented default dimensions", () => {
    const client = new DeterministicEmbeddingsClient();
    expect(client.isDeterministic).toBe(true);
    expect(client.provider).toBe("deterministic");
    expect(client.dimensions).toBe(DEFAULT_EMBEDDING_DIMENSIONS);
  });

  it("produces byte-identical vectors for the same input, across separate instances", async () => {
    const a = await new DeterministicEmbeddingsClient().embed("diesel delivery truck");
    const b = await new DeterministicEmbeddingsClient().embed("diesel delivery truck");
    expect(a.vector).toEqual(b.vector);
  });

  it("produces a different vector for different input", async () => {
    const client = new DeterministicEmbeddingsClient();
    const a = await client.embed("diesel delivery truck");
    const b = await client.embed("electric forklift");
    expect(a.vector).not.toEqual(b.vector);
  });

  it("returns a unit-normalised vector", async () => {
    const { vector } = await new DeterministicEmbeddingsClient().embed("natural gas boiler");
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("honours a custom dimensions override", async () => {
    const client = new DeterministicEmbeddingsClient({ dimensions: 8 });
    const { vector, dimensions } = await client.embed("x");
    expect(vector.length).toBe(8);
    expect(dimensions).toBe(8);
  });
});
