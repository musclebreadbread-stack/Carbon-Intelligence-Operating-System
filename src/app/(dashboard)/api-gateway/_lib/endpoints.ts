/**
 * Endpoint catalogue, generated from the route handlers themselves.
 *
 * Each `/api/v1/**` route module is imported and inspected for its exported HTTP
 * methods, so the catalogue can never claim a verb the gateway does not implement
 * or miss one it does. The alternative — a hand-maintained list — drifts the first
 * time a handler gains a `POST`.
 *
 * Server-only: it pulls in the handler modules, which import Prisma.
 */

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

export type EndpointDescriptor = {
  readonly path: string;
  readonly methods: readonly string[];
  readonly authentication: "api-key" | "none";
  readonly description: string;
};

type RouteModule = Readonly<Record<string, unknown>>;

const ROUTES: readonly {
  readonly path: string;
  readonly load: () => Promise<RouteModule>;
  readonly authentication: "api-key" | "none";
  readonly description: string;
}[] = [
  {
    path: "/api/v1/health",
    load: () => import("@/app/api/v1/health/route"),
    authentication: "none",
    description:
      "Deployment health: whether the database, Supabase and the LLM are configured, and whether writes are accepted.",
  },
  {
    path: "/api/v1/organizations",
    load: () => import("@/app/api/v1/organizations/route"),
    authentication: "api-key",
    description: "Organisations the key's tenant can see, with fiscal year and base currency.",
  },
  {
    path: "/api/v1/facilities",
    load: () => import("@/app/api/v1/facilities/route"),
    authentication: "api-key",
    description: "Facility list and creation, including consolidation attributes.",
  },
  {
    path: "/api/v1/activity-data",
    load: () => import("@/app/api/v1/activity-data/route"),
    authentication: "api-key",
    description: "Activity entries: list with filters, and create through the same validation as the UI.",
  },
  {
    path: "/api/v1/emission-factors",
    load: () => import("@/app/api/v1/emission-factors/route"),
    authentication: "api-key",
    description: "Versioned emission factors with validity filtering, and factor creation.",
  },
  {
    path: "/api/v1/calculations",
    load: () => import("@/app/api/v1/calculations/route"),
    authentication: "api-key",
    description: "Calculation records, and running a calculation for a reporting year.",
  },
  {
    path: "/api/v1/inventories",
    load: () => import("@/app/api/v1/inventories/route"),
    authentication: "api-key",
    description: "Aggregated inventory totals, roll-ups and the publish endpoint.",
  },
  {
    path: "/api/v1/targets",
    load: () => import("@/app/api/v1/targets/route"),
    authentication: "api-key",
    description: "Science-based targets with their pathway and progress.",
  },
  {
    path: "/api/v1/scenarios",
    load: () => import("@/app/api/v1/scenarios/route"),
    authentication: "api-key",
    description: "Scenario list and simulation.",
  },
  {
    path: "/api/v1/disclosures",
    load: () => import("@/app/api/v1/disclosures/route"),
    authentication: "api-key",
    description: "Framework completeness and report generation.",
  },
  {
    path: "/api/v1/credits",
    load: () => import("@/app/api/v1/credits/route"),
    authentication: "api-key",
    description: "Carbon credit portfolio and retirement.",
  },
  {
    path: "/api/v1/lineage/[nodeId]",
    load: () => import("@/app/api/v1/lineage/[nodeId]/route"),
    authentication: "api-key",
    description: "Upstream and downstream provenance of one lineage node.",
  },
];

/** Reads the catalogue by inspecting the handler modules' method exports. */
export async function listEndpoints(): Promise<readonly EndpointDescriptor[]> {
  return Promise.all(
    ROUTES.map(async (route) => {
      const handlerModule = await route.load();
      return {
        path: route.path,
        methods: HTTP_METHODS.filter((method) => typeof handlerModule[method] === "function"),
        authentication: route.authentication,
        description: route.description,
      };
    }),
  );
}

/** Calls the health handler in-process, so no base URL has to be guessed. */
export async function readHealth(): Promise<Readonly<Record<string, unknown>> | null> {
  const { GET } = await import("@/app/api/v1/health/route");
  const response = await GET();
  const body = (await response.json()) as { readonly data?: Readonly<Record<string, unknown>> };
  return body.data ?? null;
}
