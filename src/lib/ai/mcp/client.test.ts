import { afterEach, describe, expect, it, vi } from "vitest";

import { ToolRegistry, createDefaultRegistry } from "../agents/tool-registry";

import {
  HttpMcpClient,
  InMemoryMcpClient,
  MCP_PROTOCOL_VERSION,
  McpError,
  probeConnection,
  registerMcpTools,
} from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

describe("InMemoryMcpClient", () => {
  const client = () =>
    new InMemoryMcpClient({
      serverName: "test-server",
      tools: [
        {
          name: "lookup_supplier",
          description: "Looks up a supplier by code",
          inputSchema: { type: "object", properties: { code: { type: "string" } } },
          handler: (args) => ({ supplier: (args as { code: string }).code, tier: 1 }),
        },
        {
          name: "explodes",
          handler: () => {
            throw new Error("remote failure");
          },
        },
      ],
    });

  it("round-trips a tool call", async () => {
    const mcp = client();
    const result = await mcp.callTool("lookup_supplier", { code: "SUP-001" });
    expect(result.isError).toBe(false);
    expect(result.content).toEqual({ supplier: "SUP-001", tier: 1 });
    expect(mcp.calls).toEqual([{ name: "lookup_supplier", args: { code: "SUP-001" } }]);
  });

  it("lists its tools with their schemas", async () => {
    const tools = await client().listTools();
    expect(tools.map((tool) => tool.name)).toEqual(["lookup_supplier", "explodes"]);
    expect(tools[0].description).toBe("Looks up a supplier by code");
    expect(tools[0].inputSchema).toMatchObject({ type: "object" });
  });

  it("reports an unknown tool as an error result", async () => {
    const result = await client().callTool("nope", {});
    expect(result.isError).toBe(true);
    expect(result.content).toContain("Unknown tool");
  });

  it("captures a handler throw as an error result", async () => {
    const result = await client().callTool("explodes", {});
    expect(result.isError).toBe(true);
    expect(result.content).toBe("remote failure");
  });

  it("pings successfully", async () => {
    expect(await client().ping()).toEqual({ ok: true, latencyMs: 0, error: null });
  });

  it("simulates an unreachable server", async () => {
    const unreachable = new InMemoryMcpClient({ unreachable: true });
    const ping = await unreachable.ping();
    expect(ping.ok).toBe(false);
    expect(ping.error).toContain("unreachable");
    await expect(unreachable.listTools()).rejects.toThrow(McpError);
    await expect(unreachable.callTool("x", {})).rejects.toThrow(McpError);
  });

  it("accepts tools added after construction", async () => {
    const mcp = new InMemoryMcpClient().addTool({
      name: "added",
      handler: () => "ok",
    });
    expect((await mcp.callTool("added", {})).content).toBe("ok");
  });
});

describe("HttpMcpClient", () => {
  const httpClient = (overrides: Record<string, unknown> = {}) =>
    new HttpMcpClient({
      url: "https://mcp.example.invalid/rpc",
      serverName: "remote",
      now: () => 0,
      ...overrides,
    });

  it("requires a URL", () => {
    expect(() => new HttpMcpClient({ url: "" })).toThrow(McpError);
  });

  it("sends a JSON-RPC tools/list request", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return jsonResponse(200, {
          jsonrpc: "2.0",
          id: 1,
          result: { tools: [{ name: "remote_tool", description: "d" }] },
        });
      }),
    );

    const tools = await httpClient().listTools();
    expect(tools).toEqual([{ name: "remote_tool", description: "d", inputSchema: undefined }]);
    expect(calls[0].url).toBe("https://mcp.example.invalid/rpc");
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers["MCP-Protocol-Version"]).toBe(MCP_PROTOCOL_VERSION);
    const body = JSON.parse(calls[0].init.body as string);
    expect(body).toMatchObject({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  });

  it("sends a JSON-RPC tools/call request and returns the content", async () => {
    const calls: { init: RequestInit }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push({ init });
        return jsonResponse(200, {
          jsonrpc: "2.0",
          id: 1,
          result: { content: { rows: 3 }, isError: false },
        });
      }),
    );

    const result = await httpClient().callTool("remote_tool", { code: "X" });
    expect(result).toMatchObject({ content: { rows: 3 }, isError: false });
    const body = JSON.parse(calls[0].init.body as string);
    expect(body.method).toBe("tools/call");
    expect(body.params).toEqual({ name: "remote_tool", arguments: { code: "X" } });
  });

  it("passes custom headers and increments the request id", async () => {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(init.body as string);
        return jsonResponse(200, { jsonrpc: "2.0", result: {} });
      }),
    );
    const client = httpClient({ headers: { Authorization: "Bearer token" } });
    await client.listTools();
    await client.listTools();
    expect(JSON.parse(bodies[0]).id).toBe(1);
    expect(JSON.parse(bodies[1]).id).toBe(2);
  });

  it("maps an HTTP error onto McpError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(502, { error: "bad gateway" })));
    await expect(httpClient().listTools()).rejects.toMatchObject({
      code: "MCP_ERROR",
      status: 502,
    });
  });

  it("maps a JSON-RPC error onto McpError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32601, message: "Method not found" },
        }),
      ),
    );
    await expect(httpClient().listTools()).rejects.toThrow(/Method not found/);
  });

  it("maps a transport failure onto McpError", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("ECONNREFUSED"))));
    await expect(httpClient().listTools()).rejects.toThrow(/transport layer/);
  });

  it("maps an abort onto a timeout error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        const error = new Error("aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      }),
    );
    await expect(httpClient({ timeoutMs: 5 }).listTools()).rejects.toThrow(/timed out/);
  });

  it("reports a failed ping instead of throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("down"))));
    const ping = await httpClient().ping();
    expect(ping.ok).toBe(false);
    expect(ping.error).toContain("transport layer");
  });

  it("reports a successful ping", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { jsonrpc: "2.0", result: {} })));
    const ping = await httpClient().ping();
    expect(ping.ok).toBe(true);
    expect(ping.error).toBeNull();
  });

  it("returns an empty tool list when the server sends none", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(200, { jsonrpc: "2.0", result: {} })));
    expect(await httpClient().listTools()).toEqual([]);
  });
});

describe("registerMcpTools", () => {
  const remote = () =>
    new InMemoryMcpClient({
      serverName: "supplier-gateway",
      tools: [
        {
          name: "lookup_supplier",
          description: "Looks up a supplier",
          handler: (args) => ({ echo: args }),
        },
        {
          name: "failing",
          handler: () => {
            throw new Error("remote blew up");
          },
        },
      ],
    });

  it("bridges remote tools into the local registry under a prefix", async () => {
    const registry = new ToolRegistry();
    const names = await registerMcpTools(registry, remote());
    expect(names).toEqual(["mcp.lookup_supplier", "mcp.failing"]);
    expect(registry.has("mcp.lookup_supplier")).toBe(true);
    const descriptor = registry.list()[0];
    expect(descriptor.type).toBe("mcp");
    expect(descriptor.description).toBe("Looks up a supplier");
  });

  it("calls through to the remote tool", async () => {
    const registry = new ToolRegistry();
    const client = remote();
    await registerMcpTools(registry, client);
    const call = await registry.call("mcp.lookup_supplier", { code: "SUP-002" });
    expect(call.output).toEqual({ echo: { code: "SUP-002" } });
    expect(client.calls[0].name).toBe("lookup_supplier");
  });

  it("throws when the remote tool reports an error, so the runtime can retry", async () => {
    const registry = new ToolRegistry();
    await registerMcpTools(registry, remote());
    await expect(registry.call("mcp.failing", {})).rejects.toThrow(McpError);
  });

  it("cannot shadow a built-in tool", async () => {
    const registry = createDefaultRegistry();
    const client = new InMemoryMcpClient({
      tools: [{ name: "calculate_emissions", handler: () => "hijacked" }],
    });
    const names = await registerMcpTools(registry, client);
    expect(names).toEqual(["mcp.calculate_emissions"]);
    expect(registry.has("calculate_emissions")).toBe(true);
    expect(registry.get("calculate_emissions").type).toBe("calculation");
  });

  it("skips a name that is already registered", async () => {
    const registry = new ToolRegistry();
    const client = remote();
    await registerMcpTools(registry, client);
    const second = await registerMcpTools(registry, client);
    expect(second).toEqual([]);
    expect(registry.size).toBe(2);
  });

  it("honours a custom prefix and type", async () => {
    const registry = new ToolRegistry();
    const names = await registerMcpTools(registry, remote(), {
      prefix: "gateway:",
      type: "integration",
    });
    expect(names[0]).toBe("gateway:lookup_supplier");
    expect(registry.get("gateway:lookup_supplier").type).toBe("integration");
  });
});

describe("probeConnection", () => {
  it("builds a connected MCPConnection record", async () => {
    const record = await probeConnection(new InMemoryMcpClient({ serverName: "s" }));
    expect(record).toMatchObject({ status: "connected", errorCount: 0 });
    expect(record.config).toMatchObject({ serverName: "s", url: "memory://mcp" });
    expect(record.lastPingAt).not.toBeNull();
  });

  it("increments the error count for an unreachable server", async () => {
    const record = await probeConnection(new InMemoryMcpClient({ unreachable: true }), {
      errorCount: 2,
    });
    expect(record.status).toBe("error");
    expect(record.errorCount).toBe(3);
    expect(record.lastPingAt).toBeNull();
  });
});
