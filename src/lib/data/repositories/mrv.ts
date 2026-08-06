/**
 * Digital MRV repository.
 *
 * `MonitoringParameter.emissionSourceId` does not exist on the Prisma model — the
 * association is resolved here (from the parameter's plan and the source's unit and
 * name) and passed to `monitoringPlanCoverage` denormalised, the same precedent as
 * the hierarchy ids on `EmissionResultLike`.
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
 * Monitoring parameters with the emission-source association resolved.
 *
 * `MonitoringParameter.emissionSourceId` is the authoritative link when set —
 * there is no create/update action for `MonitoringParameter` yet, so today
 * this only ever comes from a seed or a direct write, but the read path
 * prefers it the moment it exists. A row with no `emissionSourceId` falls
 * back to matching the parameter's name against the sources covered by the
 * same facility, in a deterministic order.
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
      const sourceById = new Map(sources.map((source) => [source.id, source]));

      const claimed = new Set<string>();
      return parameters.map((parameter) => {
        if (parameter.emissionSourceId && sourceById.has(parameter.emissionSourceId)) {
          claimed.add(parameter.emissionSourceId);
          return {
            id: parameter.id,
            monitoringPlanId: parameter.monitoringPlanId,
            name: parameter.name,
            description: parameter.description ?? "",
            unit: parameter.unit,
            frequency: parameter.frequency,
            methodology: parameter.methodology,
            threshold: parameter.threshold,
            alertOnBreach: parameter.alertOnBreach,
            emissionSourceId: parameter.emissionSourceId,
          };
        }
        const match = sources.find(
          (source) =>
            !claimed.has(source.id) &&
            parameter.name.toLowerCase().includes(source.name.split(" ")[0].toLowerCase()),
        );
        if (match) claimed.add(match.id);
        return {
          id: parameter.id,
          monitoringPlanId: parameter.monitoringPlanId,
          name: parameter.name,
          description: parameter.description ?? "",
          unit: parameter.unit,
          frequency: parameter.frequency,
          methodology: parameter.methodology,
          threshold: parameter.threshold,
          alertOnBreach: parameter.alertOnBreach,
          emissionSourceId: match?.id ?? null,
        };
      });
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
        monitoringParameterId: row.monitoringParameterId,
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
