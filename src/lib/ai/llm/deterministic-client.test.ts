import { describe, expect, it, vi } from "vitest";

import {
  BUILT_IN_TEMPLATES,
  DeterministicLlmClient,
  extractFacts,
  findEmbeddedJson,
} from "./deterministic-client";
import { LlmError } from "./types";

const emissionPrompt = [
  "Explain the Scope 1 emission result for the Ulsan boiler",
  "- Activity quantity: 12000 m3",
  "- Emission factor: 2.02 kg CO2e per m3",
  "- Total emissions: 24.24 tCO2e",
  "- GWP version: AR6",
].join("\n");

describe("extractFacts", () => {
  it("reads label/value lines in order", () => {
    expect(extractFacts(emissionPrompt)).toEqual([
      { label: "Activity quantity", value: "12000 m3" },
      { label: "Emission factor", value: "2.02 kg CO2e per m3" },
      { label: "Total emissions", value: "24.24 tCO2e" },
      { label: "GWP version", value: "AR6" },
    ]);
  });

  it("de-duplicates repeated labels and skips role prefixes", () => {
    expect(extractFacts("user: hi\n- a: 1\n- a: 2\n- b: 3")).toEqual([
      { label: "a", value: "1" },
      { label: "b", value: "3" },
    ]);
  });

  it("ignores lines with no value", () => {
    expect(extractFacts("heading:\njust text")).toEqual([]);
  });
});

describe("DeterministicLlmClient", () => {
  it("advertises itself as deterministic and free", async () => {
    const client = new DeterministicLlmClient();
    expect(client.provider).toBe("deterministic");
    expect(client.isDeterministic).toBe(true);
    const completion = await client.complete(emissionPrompt);
    expect(completion.costUsd).toBe(0);
    expect(completion.finishReason).toBe("template");
    expect(completion.durationMs).toBe(0);
    expect(completion.tokensUsed).toBe(
      completion.promptTokens + completion.completionTokens,
    );
  });

  it("returns byte-identical text for the same input", async () => {
    const a = await new DeterministicLlmClient().complete(emissionPrompt);
    const b = await new DeterministicLlmClient().complete(emissionPrompt);
    expect(a.text).toBe(b.text);
    expect(a).toEqual(b);
  });

  it("restates only the facts present in the prompt", async () => {
    const completion = await new DeterministicLlmClient().complete(emissionPrompt);
    expect(completion.text).toContain("24.24 tCO2e");
    expect(completion.text).toContain("GWP version is AR6");
    expect(completion.text).toContain("Explain the Scope 1 emission result");
    expect(completion.text).toContain("no value has been inferred");
  });

  it("selects a template by subject", async () => {
    const client = new DeterministicLlmClient();
    await client.complete("Anomaly detected in the Busan meter\n- Deviation: 3.4 sigma");
    expect(client.lastCall?.template).toBe("anomaly-summary");
    await client.complete("Scenario projection to 2050\n- Growth: 2 %");
    expect(client.lastCall?.template).toBe("scenario-narrative");
    await client.complete("Recommend next abatement steps\n- Cost per tonne: 42");
    expect(client.lastCall?.template).toBe("recommendation");
    await client.complete("Something entirely unrelated\n- Key: value");
    expect(client.lastCall?.template).toBe("fallback");
  });

  it("handles a prompt with no facts", async () => {
    const completion = await new DeterministicLlmClient().complete("Say something");
    expect(completion.text).toContain("No structured inputs were supplied");
  });

  it("records every prompt for assertion", async () => {
    const client = new DeterministicLlmClient();
    await client.complete("first prompt", { system: "be terse", temperature: 0 });
    await client.complete("second prompt");
    expect(client.calls).toHaveLength(2);
    expect(client.calls[0].messages).toEqual([
      { role: "system", content: "be terse" },
      { role: "user", content: "first prompt" },
    ]);
    expect(client.calls[0].options.temperature).toBe(0);
    expect(client.calls[0].mode).toBe("text");
    expect(client.calls[1].index).toBe(1);
    client.reset();
    expect(client.calls).toEqual([]);
  });

  it("lets a caller override the built-in templates", async () => {
    const client = new DeterministicLlmClient({
      templates: [
        {
          name: "korean-summary",
          match: /배출/,
          render: (context) => `총 배출량 요약: ${context.facts.length}개 항목`,
        },
      ],
    });
    const completion = await client.complete("배출량 설명\n- 총량: 100 tCO2e");
    expect(completion.text).toBe("총 배출량 요약: 1개 항목");
    expect(client.lastCall?.template).toBe("korean-summary");
  });

  it("makes no network call", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    try {
      await new DeterministicLlmClient().complete(emissionPrompt);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("declares a fallback template that matches anything", () => {
    const fallback = BUILT_IN_TEMPLATES[BUILT_IN_TEMPLATES.length - 1];
    expect(fallback.name).toBe("fallback");
    expect(fallback.match.test("")).toBe(true);
  });
});

describe("DeterministicLlmClient.completeJson", () => {
  const validator = {
    parse: (input: unknown) => {
      const record = input as { total?: unknown };
      if (typeof record.total !== "number") throw new Error("total must be a number");
      return { total: record.total };
    },
  };

  it("echoes the JSON payload embedded in the prompt", async () => {
    const client = new DeterministicLlmClient();
    const result = await client.completeJson(
      'Summarise this inventory: {"total": 1234, "unit": "tCO2e"}',
      validator,
    );
    expect(result.data).toEqual({ total: 1234 });
    expect(result.text).toBe('{"total":1234}');
    expect(client.lastCall?.mode).toBe("json");
    expect(client.lastCall?.template).toBe("embedded-json");
  });

  it("prefers a registered responder", async () => {
    const client = new DeterministicLlmClient({
      jsonResponders: [
        { name: "fixed", match: /inventory/, respond: () => ({ total: 42 }) },
      ],
    });
    const result = await client.completeJson("inventory please", validator);
    expect(result.data).toEqual({ total: 42 });
    expect(client.lastCall?.template).toBe("fixed");
  });

  it("throws a typed error when the payload fails validation", async () => {
    const client = new DeterministicLlmClient();
    await expect(
      client.completeJson('{"total": "not a number"}', validator),
    ).rejects.toThrow(LlmError);
  });

  it("throws when no JSON can be found", async () => {
    const client = new DeterministicLlmClient();
    await expect(client.completeJson("no payload here", validator)).rejects.toThrow(
      /no JSON payload/,
    );
  });
});

describe("findEmbeddedJson", () => {
  it("takes the last balanced payload when several are present", () => {
    expect(findEmbeddedJson('prefix {"a":1} middle {"b":2} suffix')).toEqual({ b: 2 });
  });

  it("takes the outermost value, not a nested one", () => {
    expect(findEmbeddedJson('{"outer":{"inner":1}}')).toEqual({ outer: { inner: 1 } });
  });

  it("finds an array", () => {
    expect(findEmbeddedJson("data: [1,2,3]")).toEqual([1, 2, 3]);
  });

  it("handles nested objects", () => {
    expect(findEmbeddedJson('x {"a":{"b":[1,2]}} y')).toEqual({ a: { b: [1, 2] } });
  });

  it("throws when there is nothing to find", () => {
    expect(() => findEmbeddedJson("plain text")).toThrow(LlmError);
  });
});
