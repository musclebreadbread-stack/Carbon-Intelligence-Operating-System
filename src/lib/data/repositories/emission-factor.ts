/**
 * Emission-factor repository.
 *
 * `listCandidateFactors` is what the calculation path uses: it returns the whole
 * eligible candidate set for an organisation and lets `resolveFactor` do the
 * ranking, rather than pre-filtering in SQL. That keeps the documented specificity
 * ranking in one place — the domain — and keeps the selection rationale complete.
 */

import type { EmissionFactorLike } from "@/lib/domain/factors/types";
import type { EmissionFactorQuery } from "@/lib/validation";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_EMISSION_FACTORS,
  DEMO_FACTOR_CATEGORIES,
  DEMO_FACTOR_SOURCES,
  DEMO_FACTOR_VERSIONS,
  type DemoFactorCategory,
  type DemoFactorSource,
  type DemoFactorVersion,
} from "../demo";

export type FactorRow = EmissionFactorLike & {
  readonly sourceName: string | null;
  readonly versionLabel: string | null;
  readonly categoryName: string | null;
};

const DEMO_SOURCE_NAMES = new Map(DEMO_FACTOR_SOURCES.map((row) => [row.id, row.name]));
const DEMO_VERSION_LABELS = new Map(DEMO_FACTOR_VERSIONS.map((row) => [row.id, row.version]));
const DEMO_CATEGORY_NAMES = new Map(DEMO_FACTOR_CATEGORIES.map((row) => [row.id, row.name]));

function decorate(factor: EmissionFactorLike): FactorRow {
  return {
    ...factor,
    sourceName: factor.sourceId ? (DEMO_SOURCE_NAMES.get(factor.sourceId) ?? null) : null,
    versionLabel: factor.versionId ? (DEMO_VERSION_LABELS.get(factor.versionId) ?? null) : null,
    categoryName: factor.categoryId ? (DEMO_CATEGORY_NAMES.get(factor.categoryId) ?? null) : null,
  };
}

function matchesQuery(factor: EmissionFactorLike, query: EmissionFactorQuery): boolean {
  if (query.organizationId && factor.organizationId && factor.organizationId !== query.organizationId) {
    return false;
  }
  if (query.scope && factor.scope !== query.scope) return false;
  if (query.scope3Category && factor.scope3Category !== query.scope3Category) return false;
  if (query.region && factor.region !== query.region) return false;
  if (query.country && factor.country !== query.country) return false;
  if (query.sector && factor.sector !== query.sector) return false;
  if (query.unit && factor.unit !== query.unit) return false;
  if (query.gasType && factor.gasType !== query.gasType) return false;
  if (!query.includeInactive && factor.isActive === false) return false;
  if (query.validOn) {
    const at = query.validOn.getTime();
    if (factor.validFrom && at < factor.validFrom.getTime()) return false;
    if (factor.validTo && at > factor.validTo.getTime()) return false;
  }
  return true;
}

export async function listEmissionFactors(
  query: EmissionFactorQuery,
): Promise<readonly FactorRow[]> {
  return withDb<readonly FactorRow[]>(
    async () => {
      const rows = await prisma.emissionFactor.findMany({
        where: {
          ...(query.organizationId
            ? { OR: [{ organizationId: query.organizationId }, { organizationId: null }] }
            : {}),
          ...(query.scope ? { scope: query.scope } : {}),
          ...(query.scope3Category ? { scope3Category: query.scope3Category } : {}),
          ...(query.region ? { region: query.region } : {}),
          ...(query.country ? { country: query.country } : {}),
          ...(query.sector ? { sector: query.sector } : {}),
          ...(query.unit ? { unit: query.unit } : {}),
          ...(query.gasType ? { gasType: query.gasType } : {}),
          ...(query.includeInactive ? {} : { isActive: true }),
          ...(query.validOn
            ? {
                AND: [
                  { OR: [{ validFrom: null }, { validFrom: { lte: query.validOn } }] },
                  { OR: [{ validTo: null }, { validTo: { gte: query.validOn } }] },
                ],
              }
            : {}),
        },
        orderBy: [{ name: "asc" }],
        include: {
          source: { select: { name: true } },
          version: { select: { version: true } },
          category: { select: { name: true } },
        },
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        value: row.value,
        unit: row.unit,
        gasType: row.gasType,
        scope: row.scope,
        scope3Category: row.scope3Category,
        region: row.region,
        country: row.country,
        sector: row.sector,
        validFrom: row.validFrom,
        validTo: row.validTo,
        isActive: row.isActive,
        uncertainty: row.uncertainty,
        dataQuality: row.dataQuality,
        organizationId: row.organizationId,
        sourceId: row.sourceId,
        categoryId: row.categoryId,
        versionId: row.versionId,
        sourceName: row.source?.name ?? null,
        versionLabel: row.version?.version ?? null,
        categoryName: row.category?.name ?? null,
      }));
    },
    () => DEMO_EMISSION_FACTORS.filter((factor) => matchesQuery(factor, query)).map(decorate),
  );
}

/**
 * The candidate set for `resolveFactor`: every active factor that is either global
 * or belongs to this organisation. `supplierId` is not a column on
 * `EmissionFactor`, so it is resolved from `SupplierEmissionData` when present and
 * attached denormalised.
 */
export async function listCandidateFactors(
  organizationId: string,
): Promise<readonly EmissionFactorLike[]> {
  return withDb<readonly EmissionFactorLike[]>(
    async () => {
      const rows = await prisma.emissionFactor.findMany({
        where: {
          isActive: true,
          OR: [{ organizationId }, { organizationId: null }],
        },
      });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        value: row.value,
        unit: row.unit,
        gasType: row.gasType,
        scope: row.scope,
        scope3Category: row.scope3Category,
        region: row.region,
        country: row.country,
        sector: row.sector,
        validFrom: row.validFrom,
        validTo: row.validTo,
        isActive: row.isActive,
        uncertainty: row.uncertainty,
        dataQuality: row.dataQuality,
        organizationId: row.organizationId,
        sourceId: row.sourceId,
        categoryId: row.categoryId,
        versionId: row.versionId,
      }));
    },
    () => DEMO_EMISSION_FACTORS,
  );
}

export async function listFactorSources(): Promise<readonly DemoFactorSource[]> {
  return withDb<readonly DemoFactorSource[]>(
    async () => {
      const rows = await prisma.emissionFactorSource.findMany({ orderBy: { name: "asc" } });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description ?? "",
        publisher: row.publisher ?? "",
        url: row.url ?? "",
        methodology: row.methodology ?? "",
        lastUpdated: row.lastUpdated ?? row.updatedAt,
      }));
    },
    () => DEMO_FACTOR_SOURCES,
  );
}

export async function listFactorVersions(): Promise<readonly DemoFactorVersion[]> {
  return withDb<readonly DemoFactorVersion[]>(
    async () => {
      const rows = await prisma.emissionFactorVersion.findMany({
        orderBy: [{ sourceId: "asc" }, { version: "desc" }],
      });
      return rows.map((row) => ({
        id: row.id,
        sourceId: row.sourceId,
        version: row.version,
        releaseDate: row.releaseDate ?? row.createdAt,
        description: row.description ?? "",
        isLatest: row.isLatest,
        changelog: row.changelog ?? "",
      }));
    },
    () => DEMO_FACTOR_VERSIONS,
  );
}

export async function listFactorCategories(): Promise<readonly DemoFactorCategory[]> {
  return withDb<readonly DemoFactorCategory[]>(
    async () => {
      const rows = await prisma.emissionFactorCategory.findMany({ orderBy: { name: "asc" } });
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        parentId: row.parentId,
        level: row.level,
        description: row.description ?? "",
      }));
    },
    () => DEMO_FACTOR_CATEGORIES,
  );
}
