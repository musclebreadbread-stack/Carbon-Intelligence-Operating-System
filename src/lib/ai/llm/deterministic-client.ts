/**
 * Deterministic LLM client.
 *
 * Renders narrative from the structured facts already present in the prompt,
 * using templates rather than a model. It makes no network call, and the same
 * input always produces byte-identical output — which is why it is both the test
 * double and the production fallback whenever `OPENAI_API_KEY` is absent or a
 * placeholder. A CIOS deployment with no LLM key is fully functional; the prose
 * is just plainer.
 *
 * Prompts are recorded on `calls`, so a test can assert what the caller asked for
 * without a mocking framework.
 *
 * Facts are read from `label: value` lines in the prompt (bullet or plain), which
 * is the shape every CIOS prompt builder emits.
 *
 * No framework, network or third-party imports.
 */

import {
  LlmError,
  approximateTokens,
  estimateCost,
  messagesToText,
  toMessages,
  type JsonValidator,
  type LlmClient,
  type LlmCompletion,
  type LlmCompletionOptions,
  type LlmJsonCompletion,
  type LlmMessage,
} from "./types";

export const DETERMINISTIC_MODEL = "deterministic";

export type PromptFact = { readonly label: string; readonly value: string };

export type TemplateContext = {
  readonly messages: readonly LlmMessage[];
  /** All message content joined, as the templates see it. */
  readonly text: string;
  readonly userText: string;
  readonly systemText: string;
  readonly headline: string;
  readonly facts: readonly PromptFact[];
};

export type DeterministicTemplate = {
  readonly name: string;
  /** Tested against the joined prompt text. */
  readonly match: RegExp;
  readonly render: (context: TemplateContext) => string;
};

export type JsonResponder = {
  readonly name: string;
  readonly match: RegExp;
  readonly respond: (context: TemplateContext) => unknown;
};

export type DeterministicCall = {
  readonly index: number;
  readonly messages: readonly LlmMessage[];
  readonly options: LlmCompletionOptions;
  readonly mode: "text" | "json";
  readonly template: string;
  readonly response: string;
};

export type DeterministicClientConfig = {
  /** Prepended to the built-in templates, so a caller can override them. */
  readonly templates?: readonly DeterministicTemplate[];
  readonly jsonResponders?: readonly JsonResponder[];
  readonly model?: string;
};

const FACT_LINE = /^[\s]*(?:[-*•]\s*)?([^:\n]{1,80}?)\s*:\s*(.+?)\s*$/;

/** Reads `label: value` lines out of a prompt, in order, de-duplicated by label. */
export function extractFacts(text: string): readonly PromptFact[] {
  const facts: PromptFact[] = [];
  const seen = new Set<string>();
  for (const line of text.split("\n")) {
    const match = FACT_LINE.exec(line);
    if (!match) continue;
    const label = match[1].trim();
    const value = match[2].trim();
    if (label.length === 0 || value.length === 0) continue;
    // Skip the role prefixes `messagesToText` adds.
    if (label === "system" || label === "user" || label === "assistant") continue;
    if (seen.has(label)) continue;
    seen.add(label);
    facts.push({ label, value });
  }
  return facts;
}

function firstSentence(text: string): string {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (FACT_LINE.test(line)) continue;
    return trimmed.replace(/[:.]$/, "");
  }
  return "Summary";
}

function factList(facts: readonly PromptFact[]): string {
  return facts.map((fact) => `${fact.label} is ${fact.value}`).join("; ");
}

/**
 * Built-in templates, tried in order.
 *
 * Each one restates the supplied facts in a sentence appropriate to its subject.
 * They never invent a number: everything they print came from the prompt.
 */
export const BUILT_IN_TEMPLATES: readonly DeterministicTemplate[] = [
  {
    name: "emission-explanation",
    match: /\b(emission|tCO2e|calculation trace|배출)\b/i,
    render: (context) =>
      [
        `${context.headline}.`,
        context.facts.length === 0
          ? "No quantitative inputs were supplied with this request, so no figures can be restated."
          : `The reported result was produced from the following inputs: ${factList(context.facts)}.`,
        "Each figure above is reproduced verbatim from the deterministic calculation trace; no value has been inferred.",
      ].join(" "),
  },
  {
    name: "anomaly-summary",
    match: /\banomal(y|ies|ous)\b/i,
    render: (context) =>
      [
        `${context.headline}.`,
        context.facts.length === 0
          ? "No anomaly detail was supplied."
          : `The detection reports ${factList(context.facts)}.`,
        "Review the affected period against the source records before accepting or dismissing the flag.",
      ].join(" "),
  },
  {
    name: "scenario-narrative",
    match: /\bscenario|pathway|net[- ]zero|budget\b/i,
    render: (context) =>
      [
        `${context.headline}.`,
        context.facts.length === 0
          ? "No scenario levers were supplied."
          : `The projection assumes ${factList(context.facts)}.`,
        "Outcomes follow directly from these assumptions and change if any of them are revised.",
      ].join(" "),
  },
  {
    name: "recommendation",
    match: /\brecommend|action|roadmap|abatement\b/i,
    render: (context) =>
      [
        `${context.headline}.`,
        context.facts.length === 0
          ? "No candidate measures were supplied."
          : `The candidate measures carry ${factList(context.facts)}.`,
        "Prioritise by cost per tonne abated, then by implementation lead time.",
      ].join(" "),
  },
  {
    name: "fallback",
    match: /[\s\S]*/,
    render: (context) =>
      [
        `${context.headline}.`,
        context.facts.length === 0
          ? "No structured inputs were supplied with this request."
          : `Supplied inputs: ${factList(context.facts)}.`,
      ].join(" "),
  },
];

/**
 * Last balanced JSON object or array found in a string.
 *
 * The CIOS prompt builders embed the structured payload in the prompt, so echoing
 * it back is the honest deterministic answer to a `completeJson` request.
 */
export function findEmbeddedJson(text: string): unknown {
  let found: unknown;
  let any = false;

  for (let index = 0; index < text.length; index += 1) {
    const opener = text[index];
    if (opener !== "{" && opener !== "[") continue;

    // Walk forward tracking bracket depth, respecting string literals, so the
    // candidate is the *outermost* balanced value starting here.
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let cursor = index; cursor < text.length; cursor += 1) {
      const char = text[cursor];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === "{" || char === "[") depth += 1;
      else if (char === "}" || char === "]") {
        depth -= 1;
        if (depth === 0) {
          end = cursor + 1;
          break;
        }
      }
    }
    if (end === -1) continue;

    try {
      // The last balanced payload wins: prompt builders append the data block.
      found = JSON.parse(text.slice(index, end)) as unknown;
      any = true;
    } catch {
      // Not JSON; fall through and keep scanning.
    }
    index = end - 1;
  }

  if (any) return found;

  throw new LlmError(
    "LLM_INVALID_RESPONSE",
    "DeterministicLlmClient found no JSON payload in the prompt and no responder matched",
    { details: { text: text.slice(0, 300) } },
  );
}

export class DeterministicLlmClient implements LlmClient {
  readonly provider = "deterministic";
  readonly model: string;
  readonly isDeterministic = true;

  private readonly templates: readonly DeterministicTemplate[];
  private readonly jsonResponders: readonly JsonResponder[];
  private readonly recorded: DeterministicCall[] = [];

  constructor(config: DeterministicClientConfig = {}) {
    this.model = config.model ?? DETERMINISTIC_MODEL;
    this.templates = [...(config.templates ?? []), ...BUILT_IN_TEMPLATES];
    this.jsonResponders = config.jsonResponders ?? [];
  }

  /** Every prompt this client has been given, in order. */
  get calls(): readonly DeterministicCall[] {
    return this.recorded;
  }

  get lastCall(): DeterministicCall | undefined {
    return this.recorded[this.recorded.length - 1];
  }

  reset(): void {
    this.recorded.length = 0;
  }

  private contextFor(messages: readonly LlmMessage[]): TemplateContext {
    const userText = messages
      .filter((message) => message.role === "user")
      .map((message) => message.content)
      .join("\n");
    const systemText = messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n");
    const text = messagesToText(messages);
    return {
      messages,
      text,
      userText,
      systemText,
      headline: firstSentence(userText.length > 0 ? userText : text),
      facts: extractFacts(userText.length > 0 ? userText : text),
    };
  }

  private buildCompletion(
    messages: readonly LlmMessage[],
    options: LlmCompletionOptions,
    text: string,
  ): LlmCompletion {
    const promptTokens = approximateTokens(messagesToText(messages));
    const completionTokens = approximateTokens(text);
    const model = options.model ?? this.model;
    return {
      text,
      promptTokens,
      completionTokens,
      tokensUsed: promptTokens + completionTokens,
      model,
      costUsd: estimateCost(model, promptTokens, completionTokens),
      finishReason: "template",
      provider: this.provider,
      // Always 0: no work is done off-process, and a varying duration would make
      // the output non-reproducible.
      durationMs: 0,
    };
  }

  async complete(
    prompt: string | readonly LlmMessage[],
    options: LlmCompletionOptions = {},
  ): Promise<LlmCompletion> {
    const messages = toMessages(prompt, options.system);
    const context = this.contextFor(messages);
    const template =
      this.templates.find((candidate) => candidate.match.test(context.text)) ??
      BUILT_IN_TEMPLATES[BUILT_IN_TEMPLATES.length - 1];
    const text = template.render(context);

    this.recorded.push({
      index: this.recorded.length,
      messages,
      options,
      mode: "text",
      template: template.name,
      response: text,
    });

    return this.buildCompletion(messages, options, text);
  }

  async completeJson<T>(
    prompt: string | readonly LlmMessage[],
    validator: JsonValidator<T>,
    options: LlmCompletionOptions = {},
  ): Promise<LlmJsonCompletion<T>> {
    const messages = toMessages(prompt, options.system);
    const context = this.contextFor(messages);
    const responder = this.jsonResponders.find((candidate) =>
      candidate.match.test(context.text),
    );
    const payload = responder ? responder.respond(context) : findEmbeddedJson(context.text);

    let data: T;
    try {
      data = validator.parse(payload);
    } catch (error) {
      throw new LlmError(
        "LLM_INVALID_RESPONSE",
        "DeterministicLlmClient response did not match the expected schema",
        {
          details: {
            responder: responder?.name ?? "embedded-json",
            cause: error instanceof Error ? error.message : String(error),
          },
        },
      );
    }

    const text = JSON.stringify(data);
    this.recorded.push({
      index: this.recorded.length,
      messages,
      options,
      mode: "json",
      template: responder?.name ?? "embedded-json",
      response: text,
    });

    return { ...this.buildCompletion(messages, options, text), data };
  }
}
