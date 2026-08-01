/**
 * Organization module.
 *
 * Reads the seven-level hierarchy, the facility list and the consolidated inventory
 * through the item-28 repositories, and mutates through the item-30 actions. Every
 * number on the page — the facility emission column, the consolidation delta — is
 * produced by `rollUp`/`applyConsolidation`, not stored on a row.
 */

import { connection } from "next/server";
import { Building2, Factory, Globe2, Layers } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import {
  createBuildingAction,
  createBusinessUnitAction,
  createEmissionSourceAction,
  createEquipmentAction,
  createFacilityAction,
  createProductionLineAction,
  updateOrganizationAction,
} from "@/lib/actions/organization";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { GHG_SCOPES, ORGANIZATION_TIERS } from "@/lib/core/enums";
import { getInventory } from "@/lib/data/repositories/calculation";
import { listReportingYears } from "@/lib/data/repositories/activity-data";
import {
  getHierarchyTree,
  listEmissionSources,
  listFacilities,
  getOrganization,
  type HierarchyNode,
} from "@/lib/data/repositories/organization";
import { formatEmissions, formatNumber, humaniseEnum, scopeLabel } from "@/lib/format";
import { SCOPE3_CATEGORY_DEFINITIONS } from "@/lib/reference/scope3-categories";
import { getDictionary } from "@/lib/i18n/server";

import { EntityForms } from "./_components/entity-forms";
import { FacilityMap } from "./_components/facility-map";
import { HierarchyTree } from "./_components/hierarchy-tree";
import { OrganizationProfileForm } from "./_components/organization-profile-form";

/** Flattens the tree so the page can count nodes per tier without a second read. */
function collectByTier(node: HierarchyNode, into: Map<string, HierarchyNode[]>): void {
  const bucket = into.get(node.tier);
  if (bucket) bucket.push(node);
  else into.set(node.tier, [node]);
  for (const child of node.children) collectByTier(child, into);
}

export default async function OrganizationPage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();
  const years = await listReportingYears(organizationId);
  const reportingYear = years[0] ?? new Date().getUTCFullYear();

  const [organization, tree, facilities, sources, inventory] = await Promise.all([
    getOrganization(organizationId),
    getHierarchyTree(organizationId),
    listFacilities(organizationId),
    listEmissionSources(organizationId),
    getInventory(organizationId, reportingYear),
  ]);

  const byTier = new Map<string, HierarchyNode[]>();
  if (tree) collectByTier(tree, byTier);
  const totalEntities = [...byTier.values()].reduce((total, nodes) => total + nodes.length, 0);
  const regions = new Set(
    facilities.map((facility) => facility.country ?? "unassigned").filter(Boolean),
  );

  const emissionsByFacility = new Map(
    inventory.byFacility.map((node) => [node.key, node.totals.totalEmissions]),
  );

  const buildings = byTier.get("BUILDING") ?? [];
  const lines = byTier.get("PRODUCTION_LINE") ?? [];
  const equipment = byTier.get("EQUIPMENT") ?? [];
  const businessUnits = [...(byTier.get("BUSINESS_UNIT") ?? []), ...(byTier.get("DIVISION") ?? [])];

  const consolidationDelta =
    inventory.totals.totalEmissions - inventory.consolidated.totalEmissions;

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["org.title"]}
        description={dict["org.desc"]}
        meta={[
          { label: dict["org.meta.reportingYear"], value: String(reportingYear) },
          {
            label: dict["org.meta.consolidation"],
            value: humaniseEnum(inventory.consolidationApproach),
          },
          { label: dict["org.meta.gwp"], value: inventory.gwpVersion },
        ]}
        actions={
          <EntityForms
            organizationId={organizationId}
            businessUnits={businessUnits.map((node) => ({ value: node.id, label: node.name }))}
            facilities={facilities.map((facility) => ({
              value: facility.id,
              label: facility.name,
            }))}
            buildings={buildings.map((node) => ({ value: node.id, label: node.name }))}
            productionLines={lines.map((node) => ({ value: node.id, label: node.name }))}
            equipment={equipment.map((node) => ({ value: node.id, label: node.name }))}
            scopes={GHG_SCOPES.map((scope) => ({ value: scope, label: scopeLabel(scope) }))}
            scope3Categories={SCOPE3_CATEGORY_DEFINITIONS.map((definition) => ({
              value: definition.category,
              label: `${definition.number}. ${definition.nameEn} / ${definition.nameKo}`,
            }))}
            tiers={ORGANIZATION_TIERS.map((tier) => ({
              value: tier,
              label: humaniseEnum(tier),
            }))}
            createBusinessUnit={createBusinessUnitAction}
            createFacility={createFacilityAction}
            createBuilding={createBuildingAction}
            createProductionLine={createProductionLineAction}
            createEquipment={createEquipmentAction}
            createEmissionSource={createEmissionSourceAction}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title="Hierarchy entities"
          value={formatNumber(totalEntities)}
          icon={Layers}
          description={[...byTier.entries()]
            .map(([tier, nodes]) => `${nodes.length} ${humaniseEnum(tier).toLowerCase()}`)
            .join(", ")}
          source="getHierarchyTree()"
        />
        <KpiCard
          title="Facilities"
          value={formatNumber(facilities.length)}
          icon={Factory}
          description={`${facilities.filter((facility) => facility.operationalControl).length} under operational control`}
          source="listFacilities()"
        />
        <KpiCard
          title="Emission sources"
          value={formatNumber(sources.length)}
          icon={Building2}
          description={`${sources.filter((source) => source.isActive).length} active`}
          source="listEmissionSources()"
        />
        <KpiCard
          title="Countries covered"
          value={formatNumber(regions.size)}
          icon={Globe2}
          description={[...regions].join(", ")}
          source="listFacilities()"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Consolidated inventory</CardTitle>
          <CardDescription>
            {humaniseEnum(inventory.consolidationApproach)} applied by{" "}
            <code>applyConsolidation()</code> over {inventory.results.length} emission results.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Gross (100% of every facility)</p>
            <p className="text-xl font-semibold">
              {formatEmissions(inventory.totals.totalEmissions)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {inventory.totals.unit}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Consolidated</p>
            <p className="text-xl font-semibold">
              {formatEmissions(inventory.consolidated.totalEmissions)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {inventory.consolidated.unit}
              </span>
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Excluded by the approach</p>
            <p className="text-xl font-semibold">
              {formatEmissions(consolidationDelta)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                {inventory.totals.unit}
              </span>
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organization hierarchy</CardTitle>
            <CardDescription>
              Enterprise → business unit → facility → building → production line → equipment →
              emission source.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tree ? (
              <HierarchyTree root={tree} />
            ) : (
              <EmptyState
                title="No hierarchy yet"
                description="Create a business unit and a facility to start the tree."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Facilities</CardTitle>
            <CardDescription>
              Coordinates, control status and calculated emissions per site.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FacilityMap
              accessToken={process.env.MAPBOX_ACCESS_TOKEN ?? null}
              unit={inventory.totals.unit}
              facilities={facilities.map((facility) => ({
                id: facility.id,
                name: facility.name,
                city: facility.city,
                country: facility.country,
                latitude: facility.latitude,
                longitude: facility.longitude,
                operationalControl: facility.operationalControl,
                equityShare: facility.equityShare,
                emissions: emissionsByFacility.get(facility.id) ?? 0,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Emission sources by scope</CardTitle>
          <CardDescription>
            Every source the calculation engine can resolve a factor for.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {GHG_SCOPES.map((scope) => {
            const inScope = sources.filter((source) => source.scope === scope);
            if (inScope.length === 0) return null;
            return (
              <div key={scope} className="rounded-md border p-2.5">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{scopeLabel(scope)}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {inScope.length} source{inScope.length === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {inScope.map((source) => source.name).join(" · ")}
                </p>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization profile</CardTitle>
          <CardDescription>
            Fiscal year, base currency and reporting year drive period boundaries and
            intensity denominators across every module.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <OrganizationProfileForm
            organizationId={organizationId}
            organization={organization}
            updateOrganization={updateOrganizationAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}
