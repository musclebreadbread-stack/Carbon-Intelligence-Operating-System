/**
 * Digital MRV repository.
 *
 * `MonitoringParameter.emissionSourceId` is a real, nullable foreign key, so this
 * repository projects it straight through. It used to be *guessed*: the persisted
 * model had no such column, so the association was recovered by testing whether the
 * parameter name contained the first word of a source name, first unclaimed source
 * winning. That could report a plan as monitoring a source it did not monitor, which
 * in an assurance context is a false coverage claim — and it disagreed with demo
 * mode, where the fixture carries the association explicitly. The column removes the
 * guess: an unassigned parameter yields `null`, which `monitoringPlanCoverage()`
 * correctly reports as a gap.
 *
 * The denormalisation itself (passing the id into the pure domain type rather than
 * letting the engine traverse a relation) is retained and is sound: it is the same
 * precedent as the hierarchy ids on `EmissionResultLike`, and it is what keeps
 * `src/lib/domain/mrv` free of Prisma.
 */

import type { MeasurementFrequency } from "@/lib/core/enums";
import {
  measurementCompleteness,
  monitoringPlanCoverage,
  type MeasurementLike,
  type MonitoringParameterLike,
} from "@/lib/domain/mrv/plan";
import { prisma } from "@/lib/prisma";

import { withDb } from "../db";
import {
  DEMO_CURRENT_YEAR,
  DEMO_MEASUREMENTS,
  DEMO_MONITORED_SOURCES,
  DEMO_MONITORING_PARAMETERS,
  DEMO_MONITORING_PLAN,
  DEMO_MRV_PLAN,
  type DemoMonitoringPlan,
  type DemoMrvPlan,
} from "../demo";

import { listEmissionSources } from "./organization";

export async function getMrvPlan(organizationId: string): Promise<DemoMrvPlan | null> {
  return withDb<DemoMrvPlan | null>(
    async () => {
      const row = await prisma.mRVPlan.findFirst({
        where: { organizationId },
        orderBy: { startDate: "desc" },
      });
      if (!row) return null;
      return {
        id: row.id,
        organizationId: row.organizationId,
        name: row.name,
        description: row.description ?? "",
        framework: row.framework ?? "",
        version: row.version ?? "",
        status: row.status,
        startDate: row.startDate ?? row.createdAt,
        endDate: row.endDate ?? row.createdAt,
        approvedAt: row.approvedAt ?? row.createdAt,
        approvedBy: row.approvedBy ?? "",
      };
    },
    () => (DEMO_MRV_PLAN.organizationId === organizationId ? DEMO_MRV_PLAN : null),
  );
}

export async function listMonitoringPlans(
  mrvPlanId: string,
): Promise<readonly DemoMonitoringPlan[]> {
  return withDb<readonly DemoMonitoringPlan[]>(
    async () => {
      const rows = await prisma.monitoringPlan.findMany({
        where: { mrvPlanId },
        orderBy: { name: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        mrvPlanId: row.mrvPlanId,
        name: row.name,
        description: row.description ?? "",
        frequency: row.frequency,
        startDate: row.startDate,
        endDate: row.endDate ?? row.startDate,
        status: row.status,
      }));
    },
    () => (DEMO_MONITORING_PLAN.mrvPlanId === mrvPlanId ? [DEMO_MONITORING_PLAN] : []),
  );
}

export type MonitoringParameterRow = MonitoringParameterLike & {
  readonly monitoringPlanId: string;
  readonly description: string;
};

/**
 * Monitoring parameters for a plan, with the emission-source association read from
 * the `emissionSourceId` column rather than inferred.
 *
 * `organizationId` is still required: it scopes the association to the caller's
 * tenant, so a parameter pointing at another organisation's source (which the
 * database permits, since the FK is not tenant-aware) is projected as `null` and
 * therefore reported as an uncovered source instead of silently crossing the tenant
 * boundary.
 */
export async function listMonitoringParameters(
  organizationId: string,
  monitoringPlanId: string,
): Promise<readonly MonitoringParameterRow[]> {
  return withDb<readonly MonitoringParameterRow[]>(
    async () => {
      const [parameters, sources] = await Promise.all([
        prisma.monitoringParameter.findMany({
          where: { monitoringPlanId },
          orderBy: { name: "asc" },
        }),
        listEmissionSources(organizationId),
      ]);

      const tenantSourceIds = new Set(sources.map((source) => source.id));
      return parameters.map((parameter) => ({
        id: parameter.id,
        monitoringPlanId: parameter.monitoringPlanId,
        name: parameter.name,
        description: parameter.description ?? "",
        unit: parameter.unit,
        frequency: parameter.frequency,
        methodology: parameter.methodology,
        threshold: parameter.threshold,
        alertOnBreach: parameter.alertOnBreach,
        emissionSourceId:
          parameter.emissionSourceId !== null &&
          tenantSourceIds.has(parameter.emissionSourceId)
            ? parameter.emissionSourceId
            : null,
      }));
    },
    () =>
      DEMO_MONITORING_PARAMETERS.filter(
        (parameter) => parameter.monitoringPlanId === monitoringPlanId,
      ),
  );
}

export async function listMeasurements(
  mrvPlanId: string,
  options: { readonly reportingYear?: number } = {},
): Promise<readonly MeasurementLike[]> {
  const reportingYear = options.reportingYear ?? DEMO_CURRENT_YEAR;
  return withDb<readonly MeasurementLike[]>(
    async () => {
      const rows = await prisma.measurement.findMany({
        where: {
          mrvPlanId,
          measuredAt: {
            gte: new Date(Date.UTC(reportingYear, 0, 1)),
            lte: new Date(Date.UTC(reportingYear, 11, 31, 23, 59, 59)),
          },
        },
        orderBy: { measuredAt: "asc" },
      });
      return rows.map((row) => ({
        id: row.id,
        parameter: row.parameter,
        value: row.value,
        unit: row.unit,
        uncertainty: row.uncertainty,
        frequency: row.frequency,
        measuredAt: row.measuredAt,
        verifiedAt: row.verifiedAt,
      }));
    },
    () =>
      DEMO_MEASUREMENTS.filter(
        (measurement) =>
          measurement.mrvPlanId === mrvPlanId &&
          measurement.measuredAt.getUTCFullYear() === reportingYear,
      ),
  );
}

/** Coverage gaps and measurement completeness for the digital-MRV page. */
export async function getMrvCoverage(
  organizationId: string,
  options: { readonly reportingYear?: number } = {},
) {
  const reportingYear = options.reportingYear ?? DEMO_CURRENT_YEAR;
  const plan = await getMrvPlan(organizationId);
  if (!plan) {
    // No plan means no coverage; the domain functions require a plan, so this is
    // reported as an explicit empty result instead of throwing at the page.
    return {
      plan: null,
      monitoringPlan: null,
      parameters: [] as readonly MonitoringParameterRow[],
      coverage: null,
      completeness: null,
    } as const;
  }

  const [monitoringPlans, sources] = await Promise.all([
    listMonitoringPlans(plan.id),
    listEmissionSources(organizationId),
  ]);
  const monitoringPlan = monitoringPlans[0] ?? DEMO_MONITORING_PLAN;
  const parameters = await listMonitoringParameters(organizationId, monitoringPlan.id);
  const measurements = await listMeasurements(plan.id, { reportingYear });

  const coverage = monitoringPlanCoverage(
    {
      id: monitoringPlan.id,
      name: monitoringPlan.name,
      frequency: monitoringPlan.frequency as MeasurementFrequency,
      startDate: monitoringPlan.startDate,
      endDate: monitoringPlan.endDate,
      status: monitoringPlan.status,
      parameters,
    },
    sources.length > 0 ? sources : DEMO_MONITORED_SOURCES,
  );

  const completeness = measurementCompleteness(
    parameters,
    measurements,
    monitoringPlan.frequency as MeasurementFrequency,
    {
      start: new Date(Date.UTC(reportingYear, 0, 1)),
      end: new Date(Date.UTC(reportingYear, 11, 31)),
    },
  );

  return { plan, monitoringPlan, parameters, coverage, completeness };
}
