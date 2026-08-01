/**
 * Model Context Protocol client abstraction.
 *
 * MCP is how CIOS reaches tools it does not own — a customer's ERP bridge, a
 * registry lookup service, an internal data gateway. The interface is deliberately
 * three methods wide (`listTools`, `callTool`, `ping`), which is all the platform
 * needs and all that can be supported uniformly across transports.
 *
 * Two implementations: `HttpMcpClient` speaks JSON-RPC 2.0 over HTTP against
 * `MCPServer.url`, and `InMemoryMcpClient` backs tests and local development with
 * no transport at all.
 *
 * `registerMcpTools` bridges a remote server's tools into the local
 * `ToolRegistry`, so an agent calls a remote tool through exactly the same path as
 * a built-in one.
 *
 * Uses bare `fetch`; no framework, database or SDK imports.
 */

import { z } from "zod";

import { AppError } from "@/lib/core/errors";

import type { AgentToolDefinition, ToolRegistry } from "../agents/tool-registry";

export const MCP_PROTOCOL_VERSION = "2024-11-05";
export const DEFAULT_MCP_TIMEOUT_MS = 30_000;

export class McpError extends AppError {
  readonly status?: number;

  constructor(
    message: string,
    options: { readonly status?: number; readonly details?: Record<string, unknown> } = {},
  ) {
    super("MCP_ERROR", message, options.details);
    this.status = options.status;
  }
}

export type McpToolDescriptor = {
  readonly name: string;
  readonly description?: string;
  /** JSON Schema of the tool's arguments, as the server reports it. */
  readonly inputSchema?: unknown;
};

export type McpCallResult = {
  readonly content: unknown;
  readonly isError: boolean;
  readonly durationMs: number;
};

export type McpPingResult = {
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly error: string | null;
};

export type McpClient = {
  readonly serverName: string;
  readonly url: string;
  listTools(): Promise<readonly McpToolDescriptor[]>;
  callTool(name: string, args: unknown): Promise<McpCallResult>;
  ping(): Promise<McpPingResult>;
};

/** Plain object shaped to the `MCPConnection` model. */
export type McpConnectionRecord = {
  readonly status: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly lastPingAt: Date | null;
  readonly errorCount: number;
};

// ---------------------------------------------------------------------------
// HTTP (JSON-RPC 2.0)
// ---------------------------------------------------------------------------

type JsonRpcResponse = {
  readonly jsonrpc?: string;
  readonly id?: number | string | null;
  readonly result?: unknown;
  readonly error?: { readonly code?: number; readonly message?: string };
};

export type HttpMcpClientConfig = {
  /** `MCPServer.url`. */
  readonly url: string;
  readonly serverName?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly now?: () => number;
};

export class HttpMcpClient implements McpClient {
  readonly serverName: string;
  readonly url: string;

  private readonly headers: Readonly<Record<string, string>>;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private requestId = 0;

  constructor(config: HttpMcpClientConfig) {
    if (!config.url || config.url.trim().length === 0) {
      throw new McpError("HttpMcpClient requires a server URL");
    }
    this.url = config.url;
    this.serverName = config.serverName ?? config.url;
    this.headers = config.headers ?? {};
    this.timeoutMs = config.timeoutMs ?? DEFAULT_MCP_TIMEOUT_MS;
    this.now = config.now ?? (() => Date.now());
  }

  async listTools(): Promise<readonly McpToolDescriptor[]> {
    const result = (await this.rpc("tools/list", {})) as {
      readonly tools?: readonly McpToolDescriptor[];
    };
    return result.tools ?? [];
  }

  async callTool(name: string, args: unknown): Promise<McpCallResult> {
    const startedAt = this.now();
    const result = (await this.rpc("tools/call", { name, arguments: args })) as {
      readonly content?: unknown;
      readonly isError?: boolean;
    };
    return {
      content: result.content ?? null,
      isError: result.isError ?? false,
      durationMs: this.now() - startedAt,
    };
  }

  async ping(): Promise<McpPingResult> {
    const startedAt = this.now();
    try {
      await this.rpc("ping", {});
      return { ok: true, latencyMs: this.now() - startedAt, error: null };
    } catch (error) {
      return {
        ok: false,
        latencyMs: this.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async rpc(method: string, params: unknown): Promise<unknown> {
    this.requestId += 1;
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const response = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
          ...this.headers,
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: this.requestId, method, params }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new McpError(
          `MCP server returned HTTP ${response.status} for ${method}`,
          { status: response.status, details: { method, body: body.slice(0, 500) } },
        );
      }

      const payload = (await response.json()) as JsonRpcResponse;
      if (payload.error) {
        throw new McpError(
          `MCP server error on ${method}: ${payload.error.message ?? "unknown"}`,
          { details: { method, code: payload.error.code ?? null } },
        );
      }
      return payload.result ?? null;
    } catch (error) {
      if (error instanceof McpError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new McpError(`MCP request ${method} timed out after ${this.timeoutMs} ms`, {
          details: { method },
        });
      }
      throw new McpError(`MCP request ${method} failed at the transport layer`, {
        details: { method, cause: error instanceof Error ? error.message : String(error) },
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}

// ---------------------------------------------------------------------------
// In-memory
// ---------------------------------------------------------------------------

export type InMemoryMcpTool = {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
  readonly handler: (args: unknown) => unknown | Promise<unknown>;
};

export type InMemoryMcpClientConfig = {
  readonly serverName?: string;
  readonly url?: string;
  readonly tools?: readonly InMemoryMcpTool[];
  /** Make `ping` report a failure, for testing degraded connections. */
  readonly unreachable?: boolean;
};

/**
 * In-memory MCP client.
 *
 * Records every call, so a test can assert what was sent without a mock
 * framework, and round-trips a tool call through the same interface the HTTP
 * client implements.
 */
export class InMemoryMcpClient implements McpClient {
  readonly serverName: string;
  readonly url: string;

  private readonly tools = new Map<string, InMemoryMcpTool>();
  private readonly unreachable: boolean;
  private readonly recorded: { readonly name: string; readonly args: unknown }[] = [];

  constructor(config: InMemoryMcpClientConfig = {}) {
    this.serverName = config.serverName ?? "in-memory";
    this.url = config.url ?? "memory://mcp";
    this.unreachable = config.unreachable ?? false;
    for (const tool of config.tools ?? []) this.tools.set(tool.name, tool);
  }

  get calls(): readonly { readonly name: string; readonly args: unknown }[] {
    return this.recorded;
  }

  addTool(tool: InMemoryMcpTool): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  listTools(): Promise<readonly McpToolDescriptor[]> {
    if (this.unreachable) {
      return Promise.reject(new McpError("In-memory MCP server is marked unreachable"));
    }
    return Promise.resolve(
      [...this.tools.values()].map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    );
  }

  async callTool(name: string, args: unknown): Promise<McpCallResult> {
    if (this.unreachable) {
      throw new McpError("In-memory MCP server is marked unreachable");
    }
    this.recorded.push({ name, args });
    const tool = this.tools.get(name);
    if (!tool) {
      return { content: `Unknown tool: ${name}`, isError: true, durationMs: 0 };
    }
    try {
      return { content: await tool.handler(args), isError: false, durationMs: 0 };
    } catch (error) {
      return {
        content: error instanceof Error ? error.message : String(error),
        isError: true,
        durationMs: 0,
      };
    }
  }

  ping(): Promise<McpPingResult> {
    return Promise.resolve(
      this.unreachable
        ? { ok: false, latencyMs: 0, error: "In-memory MCP server is marked unreachable" }
        : { ok: true, latencyMs: 0, error: null },
    );
  }
}

// ---------------------------------------------------------------------------
// Registry bridge
// ---------------------------------------------------------------------------

export type RegisterMcpToolsOptions = {
  /** Prefix for the local tool name, so remote tools cannot shadow built-ins. */
  readonly prefix?: string;
  /**
   * Validator applied to the arguments before they leave the process. Defaults to
   * a pass-through, because the remote server owns the real schema.
   */
  readonly schema?: z.ZodTypeAny;
  readonly type?: string;
};

/**
 * Registers a remote server's tools locally.
 *
 * Remote names are prefixed (`mcp.` by default) so a remote tool can never
 * shadow a built-in one, and a remote error is surfaced as a thrown error rather
 * than a successful result carrying an error payload — the runtime's retry logic
 * depends on failures actually failing.
 */
export async function registerMcpTools(
  registry: ToolRegistry,
  client: McpClient,
  options: RegisterMcpToolsOptions = {},
): Promise<readonly string[]> {
  const prefix = options.prefix ?? "mcp.";
  const schema = options.schema ?? z.unknown();
  const remote = await client.listTools();
  const registered: string[] = [];

  for (const tool of remote) {
    const name = `${prefix}${tool.name}`;
    if (registry.has(name)) continue;
    const definition: AgentToolDefinition<unknown, unknown> = {
      name,
      description:
        tool.description ?? `Remote MCP tool "${tool.name}" on ${client.serverName}`,
      type: options.type ?? "mcp",
      schema,
      execute: async (input) => {
        const result = await client.callTool(tool.name, input);
        if (result.isError) {
          throw new McpError(
            `Remote MCP tool "${tool.name}" reported an error`,
            { details: { server: client.serverName, content: result.content } },
          );
        }
        return result.content;
      },
    };
    registry.register(definition as unknown as AgentToolDefinition<never, unknown>);
    registered.push(name);
  }

  return registered;
}

/** Builds the `MCPConnection` record for a client's current state. */
export async function probeConnection(
  client: McpClient,
  previous: { readonly errorCount?: number } = {},
): Promise<McpConnectionRecord> {
  const ping = await client.ping();
  return {
    status: ping.ok ? "connected" : "error",
    config: { url: client.url, serverName: client.serverName },
    lastPingAt: ping.ok ? new Date(0) : null,
    errorCount: (previous.errorCount ?? 0) + (ping.ok ? 0 : 1),
  };
}
