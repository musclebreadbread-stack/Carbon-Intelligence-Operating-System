/**
 * Prisma seed. Run with `npm run db:seed` (which invokes `tsx prisma/seed.ts`).
 *
 * Two halves:
 *
 *   1. **Reference data** — rows that are the same for every tenant: unit
 *      conversions, the fifteen Scope 3 category configs, the calculation
 *      methodologies and formulas, the disclosure framework catalogues, target
 *      types, abatement technologies and the system Role/Permission matrix.
 *
 *   2. **The demo tenant** — the *same* organisation, hierarchy, factor library and
 *      24 months of activity data the item-28 fixtures carry, seeded with the
 *      fixtures' own stable ids. That is what makes demo mode and a seeded database
 *      show identical numbers: the seed and the fallback read the same arrays.
 *
 * Every write is an idempotent `upsert` keyed on a stable id or a natural unique
 * constraint, so running the seed twice is a no-op rather than a duplicate-key
 * error. Nothing is deleted — a seed that truncated tables would be a foot-gun
 * pointed at a production database.
 *
 * The seed is **not** executed in CI here: there is no PostgreSQL server in this
 * environment. Its data is verified instead by `prisma/seed-data/seed-data.test.ts`,
 * which asserts referential integrity and that the seeded activity totals equal the
 * fixture totals. Running it against a real database is documented in the Korean
 * setup guide.
 */

import { PrismaClient } from "@prisma/client";

import {
  CALCULATION_METHODOLOGY_SEEDS,
  DISCLOSURE_FRAMEWORK_SEEDS,
  SCOPE3_CONFIG_SEEDS,
  SEED_ADMIN_PASSWORD_ENV,
  SEED_COUNTS,
  SEED_TENANT,
  UNIT_CONVERSION_SEEDS,
  seedAdminPasswordHash,
  usingDefaultAdminPassword,
} from "./seed-data";

const prisma = new PrismaClient();

function log(section: string, detail: string): void {
  console.log(`  ${section.padEnd(26)} ${detail}`);
}

// ---------------------------------------------------------------------------
// 1. Reference data
// ---------------------------------------------------------------------------

async function seedUnitConversions(): Promise<void> {
  for (const row of UNIT_CONVERSION_SEEDS) {
    await prisma.unitConversion.upsert({
      where: { fromUnit_toUnit: { fromUnit: row.fromUnit, toUnit: row.toUnit } },
      create: row,
      update: { factor: row.factor, category: row.category, description: row.description },
    });
  }
  log("unit conversions", `${UNIT_CONVERSION_SEEDS.length} rows`);
}

async function seedScope3Configs(): Promise<void> {
  for (const row of SCOPE3_CONFIG_SEEDS) {
    await prisma.scope3CategoryConfig.upsert({
      where: { category: row.category },
      create: row,
      // `isRelevant` is deliberately not updated: a re-seed must not undo a
      // screening decision a user made in the UI.
      update: {
        name: row.name,
        description: row.description,
        methodology: row.methodology,
        dataSource: row.dataSource,
        notes: row.notes,
      },
    });
  }
  log("scope 3 configs", `${SCOPE3_CONFIG_SEEDS.length} categories`);
}

async function seedMethodologies(): Promise<void> {
  let formulaCount = 0;
  for (const methodology of CALCULATION_METHODOLOGY_SEEDS) {
    const row = await prisma.calculationMethodology.upsert({
      where: { name_version: { name: methodology.name, version: methodology.version } },
      create: {
        name: methodology.name,
        version: methodology.version,
        framework: methodology.framework,
        description: methodology.description,
        formula: methodology.formula,
        parameters: methodology.parameters,
        sourceUrl: methodology.sourceUrl,
        isDefault: methodology.isDefault,
      },
      update: {
        framework: methodology.framework,
        description: methodology.description,
        formula: methodology.formula,
        parameters: methodology.parameters,
        sourceUrl: methodology.sourceUrl,
        isDefault: methodology.isDefault,
      },
      select: { id: true },
    });

    // `CalculationFormula` has no natural unique key, so the methodology's formula
    // set is replaced wholesale. Safe: nothing references a formula row.
    await prisma.calculationFormula.deleteMany({ where: { methodologyId: row.id } });
    for (const formula of methodology.formulas) {
      await prisma.calculationFormula.create({
        data: {
          methodologyId: row.id,
          name: formula.name,
          expression: formula.expression,
          variables: formula.variables,
          description: formula.description,
          applicableScope: formula.applicableScope,
        },
      });
      formulaCount += 1;
    }
  }
  log(
    "methodologies",
    `${CALCULATION_METHODOLOGY_SEEDS.length} methodologies, ${formulaCount} formulas`,
  );
}

async function seedDisclosureFrameworks(): Promise<void> {
  let requirementCount = 0;
  for (const framework of DISCLOSURE_FRAMEWORK_SEEDS) {
    const row = await prisma.disclosureFramework.upsert({
      where: { code_version: { code: framework.code, version: framework.version } },
      create: {
        code: framework.code,
        name: framework.name,
        version: framework.version,
        description: framework.description,
        publisher: framework.publisher,
        url: framework.url,
        isActive: framework.isActive,
      },
      update: {
        name: framework.name,
        description: framework.description,
        publisher: framework.publisher,
        url: framework.url,
        isActive: framework.isActive,
      },
      select: { id: true },
    });

    for (const requirement of framework.requirements) {
      // `DisclosureRequirement` has no unique constraint on [frameworkId, code], so
      // the row is located by hand. Responses reference requirements, so these are
      // updated in place and never deleted.
      const existing = await prisma.disclosureRequirement.findFirst({
        where: { frameworkId: row.id, code: requirement.code },
        select: { id: true },
      });
      if (existing) {
        await prisma.disclosureRequirement.update({
          where: { id: existing.id },
          data: {
            name: requirement.name,
            description: requirement.description,
            category: requirement.category,
            isMandatory: requirement.isMandatory,
            dataType: requirement.dataType,
            guidance: requirement.guidance,
          },
        });
      } else {
        await prisma.disclosureRequirement.create({
          data: { frameworkId: row.id, ...requirement },
        });
      }
      requirementCount += 1;
    }
  }
  log(
    "disclosure frameworks",
    `${DISCLOSURE_FRAMEWORK_SEEDS.length} frameworks, ${requirementCount} requirements`,
  );
}

async function seedTargetTypes(): Promise<void> {
  for (const type of SEED_TENANT.targetTypes) {
    await prisma.targetType.upsert({
      where: { code: type.code },
      create: {
        id: type.id,
        name: type.name,
        code: type.code,
        description: type.description,
        methodology: type.methodology,
        pathway: type.pathway,
      },
      update: {
        name: type.name,
        description: type.description,
        methodology: type.methodology,
        pathway: type.pathway,
      },
    });
  }
  log("target types", `${SEED_TENANT.targetTypes.length} rows`);
}

async function seedAbatementTechnologies(): Promise<void> {
  for (const technology of SEED_TENANT.abatementTechnologies) {
    const data = {
      name: technology.name,
      category: technology.category,
      description: technology.description,
      technologyReadiness: technology.technologyReadiness,
      abatementPotential: technology.abatementPotential,
      costPerTonne: technology.costPerTonne,
      implementationTime: technology.implementationTime,
      scalability: technology.scalability,
      applicableSectors: [...technology.applicableSectors],
    };
    await prisma.abatementTechnology.upsert({
      where: { id: technology.id },
      create: { id: technology.id, ...data },
      update: data,
    });
  }
  log("abatement technologies", `${SEED_TENANT.abatementTechnologies.length} rows`);
}

async function seedPermissions(): Promise<void> {
  for (const permission of SEED_TENANT.permissions) {
    await prisma.permission.upsert({
      where: {
        resource_action: { resource: permission.resource, action: permission.action },
      },
      create: {
        id: permission.id,
        resource: permission.resource,
        action: permission.action,
        description: permission.description,
      },
      update: { description: permission.description },
    });
  }
  log("permissions", `${SEED_TENANT.permissions.length} rows`);
}

// ---------------------------------------------------------------------------
// 2. Demo tenant
// ---------------------------------------------------------------------------

async function seedOrganization(): Promise<void> {
  const organization = SEED_TENANT.organization;
  const data = {
    name: organization.name,
    legalName: organization.legalName,
    industry: organization.industry,
    sector: organization.sector,
    country: organization.country,
    region: organization.region,
    address: organization.address,
    website: organization.website,
    fiscalYearStart: organization.fiscalYearStart,
    baseCurrency: organization.baseCurrency,
    reportingYear: organization.reportingYear,
    isActive: organization.isActive,
  };
  await prisma.organization.upsert({
    where: { id: organization.id },
    create: { id: organization.id, ...data },
    update: data,
  });
  log("organization", organization.name);
}

async function seedHierarchy(): Promise<void> {
  for (const unit of SEED_TENANT.businessUnits) {
    const data = {
      organizationId: unit.organizationId,
      name: unit.name,
      code: unit.code,
      description: unit.description,
      tier: unit.tier,
      isActive: unit.isActive,
    };
    await prisma.businessUnit.upsert({
      where: { id: unit.id },
      create: { id: unit.id, ...data },
      update: data,
    });
  }

  for (const facility of SEED_TENANT.facilities) {
    const data = {
      organizationId: facility.organizationId,
      businessUnitId: facility.businessUnitId,
      name: facility.name,
      code: facility.code,
      type: facility.type,
      city: facility.city,
      country: facility.country,
      latitude: facility.latitude,
      longitude: facility.longitude,
      area: facility.area,
      areaUnit: facility.areaUnit,
      operationalControl: facility.operationalControl,
      equityShare: facility.equityShare,
      isActive: facility.isActive,
    };
    await prisma.facility.upsert({
      where: { id: facility.id },
      create: { id: facility.id, ...data },
      update: data,
    });
  }

  for (const building of SEED_TENANT.buildings) {
    const data = {
      facilityId: building.facilityId,
      name: building.name,
      code: building.code,
      type: building.type,
      floors: building.floors,
      area: building.area,
      areaUnit: building.areaUnit,
      yearBuilt: building.yearBuilt,
      energyRating: building.energyRating,
      isActive: building.isActive,
    };
    await prisma.building.upsert({
      where: { id: building.id },
      create: { id: building.id, ...data },
      update: data,
    });
  }

  for (const line of SEED_TENANT.productionLines) {
    const data = {
      buildingId: line.buildingId,
      name: line.name,
      code: line.code,
      type: line.type,
      capacity: line.capacity,
      capacityUnit: line.capacityUnit,
      isActive: line.isActive,
    };
    await prisma.productionLine.upsert({
      where: { id: line.id },
      create: { id: line.id, ...data },
      update: data,
    });
  }

  log(
    "hierarchy",
    `${SEED_TENANT.businessUnits.length} units, ${SEED_TENANT.facilities.length} facilities, ` +
      `${SEED_TENANT.buildings.length} buildings, ${SEED_TENANT.productionLines.length} lines`,
  );
}

async function seedMasterData(): Promise<void> {
  const master = SEED_TENANT.masterData;

  for (const type of master.fuelTypes) {
    const data = { name: type.name, category: type.category, description: type.description };
    await prisma.fuelType.upsert({
      where: { id: type.id },
      create: { id: type.id, ...data },
      update: data,
    });
  }
  for (const fuel of master.fuels) {
    const data = {
      name: fuel.name,
      fuelTypeId: fuel.fuelTypeId,
      unit: fuel.unit,
      netCalorific: fuel.netCalorific,
      grossCalorific: fuel.grossCalorific,
      density: fuel.density,
      carbonContent: fuel.carbonContent,
      isRenewable: fuel.isRenewable,
    };
    await prisma.fuel.upsert({
      where: { id: fuel.id },
      create: { id: fuel.id, ...data },
      update: data,
    });
  }
  for (const refrigerant of master.refrigerants) {
    const data = {
      name: refrigerant.name,
      chemicalFormula: refrigerant.chemicalFormula,
      gwp100: refrigerant.gwp100,
      ozoneDepletionPotential: refrigerant.ozoneDepletionPotential,
      category: refrigerant.category,
    };
    await prisma.refrigerant.upsert({
      where: { id: refrigerant.id },
      create: { id: refrigerant.id, ...data },
      update: data,
    });
  }
  for (const vehicle of master.vehicles) {
    const data = {
      name: vehicle.name,
      type: vehicle.type,
      fuelType: vehicle.fuelType,
      make: vehicle.make,
      model: vehicle.model,
      year: vehicle.year,
      efficiency: vehicle.efficiency,
      efficiencyUnit: vehicle.efficiencyUnit,
      isOwned: vehicle.isOwned,
    };
    await prisma.vehicle.upsert({
      where: { id: vehicle.id },
      create: { id: vehicle.id, ...data },
      update: data,
    });
  }
  for (const supplier of master.suppliers) {
    const data = {
      organizationId: supplier.organizationId,
      name: supplier.name,
      code: supplier.code,
      category: supplier.category,
      country: supplier.country,
      contactEmail: supplier.contactEmail,
      tier: supplier.tier,
      sustainabilityRating: supplier.sustainabilityRating,
      isActive: supplier.isActive,
    };
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      create: { id: supplier.id, ...data },
      update: data,
    });
  }
  for (const product of master.products) {
    const data = {
      organizationId: product.organizationId,
      name: product.name,
      sku: product.sku,
      category: product.category,
      unit: product.unit,
      weight: product.weight,
      weightUnit: product.weightUnit,
      lifecycleStage: product.lifecycleStage,
      isActive: product.isActive,
    };
    await prisma.product.upsert({
      where: { id: product.id },
      create: { id: product.id, ...data },
      update: data,
    });
  }
  for (const material of master.rawMaterials) {
    const data = {
      name: material.name,
      category: material.category,
      unit: material.unit,
      emissionIntensity: material.emissionIntensity,
      sourceRegion: material.sourceRegion,
      isRecycled: material.isRecycled,
      recycledContent: material.recycledContent,
    };
    await prisma.rawMaterial.upsert({
      where: { id: material.id },
      create: { id: material.id, ...data },
      update: data,
    });
  }
  for (const route of master.logisticsRoutes) {
    const data = {
      name: route.name,
      origin: route.origin,
      destination: route.destination,
      distance: route.distance,
      distanceUnit: route.distanceUnit,
      transportMode: route.transportMode,
      isReturn: route.isReturn,
    };
    await prisma.logisticsRoute.upsert({
      where: { id: route.id },
      create: { id: route.id, ...data },
      update: data,
    });
  }
  for (const source of master.energySources) {
    const data = {
      name: source.name,
      type: source.type,
      provider: source.provider,
      gridRegion: source.gridRegion,
      renewablePercent: source.renewablePercent,
      contractType: source.contractType,
    };
    await prisma.energySource.upsert({
      where: { id: source.id },
      create: { id: source.id, ...data },
      update: data,
    });
  }
  for (const waste of master.wasteTypes) {
    const data = {
      name: waste.name,
      category: waste.category,
      disposalMethod: waste.disposalMethod,
      isHazardous: waste.isHazardous,
      recyclingRate: waste.recyclingRate,
    };
    await prisma.wasteType.upsert({
      where: { id: waste.id },
      create: { id: waste.id, ...data },
      update: data,
    });
  }
  for (const water of master.waterSources) {
    const data = {
      name: water.name,
      type: water.type,
      source: water.source,
      treatment: water.treatment,
      isRecycled: water.isRecycled,
    };
    await prisma.waterSource.upsert({
      where: { id: water.id },
      create: { id: water.id, ...data },
      update: data,
    });
  }

  log(
    "master data",
    `${master.fuels.length} fuels, ${master.suppliers.length} suppliers, ` +
      `${master.products.length} products, ${master.refrigerants.length} refrigerants`,
  );
}

/** Equipment and emission sources come after both master data and the hierarchy. */
async function seedEquipmentAndSources(): Promise<void> {
  for (const item of SEED_TENANT.equipment) {
    const data = {
      productionLineId: item.productionLineId,
      name: item.name,
      code: item.code,
      type: item.type,
      manufacturer: item.manufacturer,
      model: item.model,
      installDate: item.installDate,
      efficiency: item.efficiency,
      fuelTypeId: item.fuelTypeId,
      refrigerantId: item.refrigerantId,
      isActive: item.isActive,
    };
    await prisma.equipment.upsert({
      where: { id: item.id },
      create: { id: item.id, ...data },
      update: data,
    });
  }

  for (const source of SEED_TENANT.emissionSources) {
    const data = {
      name: source.name,
      code: source.code,
      scope: source.scope,
      scope3Category: source.scope3Category,
      sourceType: source.sourceType,
      calculationApproach: source.calculationApproach,
      facilityId: source.facilityId,
      buildingId: source.buildingId,
      productionLineId: source.productionLineId,
      equipmentId: source.equipmentId,
      isActive: source.isActive,
    };
    await prisma.emissionSource.upsert({
      where: { id: source.id },
      create: { id: source.id, ...data },
      update: data,
    });
  }

  log(
    "equipment and sources",
    `${SEED_TENANT.equipment.length} equipment, ${SEED_TENANT.emissionSources.length} emission sources`,
  );
}

async function seedFactorLibrary(): Promise<void> {
  for (const source of SEED_TENANT.factorSources) {
    const data = {
      name: source.name,
      description: source.description,
      publisher: source.publisher,
      url: source.url,
      methodology: source.methodology,
      lastUpdated: source.lastUpdated,
    };
    await prisma.emissionFactorSource.upsert({
      where: { id: source.id },
      create: { id: source.id, ...data },
      update: data,
    });
  }

  for (const category of SEED_TENANT.factorCategories) {
    const data = {
      name: category.name,
      parentId: category.parentId,
      level: category.level,
      description: category.description,
    };
    await prisma.emissionFactorCategory.upsert({
      where: { id: category.id },
      create: { id: category.id, ...data },
      update: data,
    });
  }

  for (const version of SEED_TENANT.factorVersions) {
    const data = {
      sourceId: version.sourceId,
      version: version.version,
      releaseDate: version.releaseDate,
      description: version.description,
      isLatest: version.isLatest,
      changelog: version.changelog,
    };
    await prisma.emissionFactorVersion.upsert({
      where: { id: version.id },
      create: { id: version.id, ...data },
      update: data,
    });
  }

  for (const factor of SEED_TENANT.emissionFactors) {
    const data = {
      name: factor.name,
      value: factor.value,
      unit: factor.unit,
      gasType: factor.gasType,
      scope: factor.scope ?? null,
      scope3Category: factor.scope3Category ?? null,
      region: factor.region ?? null,
      country: factor.country ?? null,
      sector: factor.sector ?? null,
      validFrom: factor.validFrom ?? null,
      validTo: factor.validTo ?? null,
      isActive: factor.isActive ?? true,
      uncertainty: factor.uncertainty ?? null,
      dataQuality: factor.dataQuality ?? null,
      organizationId: factor.organizationId ?? null,
      sourceId: factor.sourceId ?? null,
      categoryId: factor.categoryId ?? null,
      versionId: factor.versionId ?? null,
    };
    await prisma.emissionFactor.upsert({
      where: { id: factor.id },
      create: { id: factor.id, ...data },
      update: data,
    });
  }

  log(
    "factor library",
    `${SEED_TENANT.factorSources.length} sources, ${SEED_TENANT.factorVersions.length} versions, ` +
      `${SEED_TENANT.emissionFactors.length} factors — every one carrying its citation`,
  );
}

async function seedActivityData(): Promise<void> {
  for (const header of SEED_TENANT.activityData) {
    const data = {
      organizationId: header.organizationId,
      facilityId: header.facilityId,
      businessUnitId: header.businessUnitId,
      name: header.name,
      description: header.description,
      scope: header.scope,
      scope3Category: header.scope3Category,
      reportingYear: header.reportingYear,
      reportingMonth: header.reportingMonth,
      dataSource: header.dataSource,
      dataQuality: header.dataQuality,
      isVerified: header.isVerified,
    };
    await prisma.activityData.upsert({
      where: { id: header.id },
      create: { id: header.id, ...data },
      update: data,
    });
  }

  for (const entry of SEED_TENANT.activityEntries) {
    const data = {
      activityDataId: entry.activityDataId,
      emissionSourceId: entry.emissionSourceId,
      quantity: entry.quantity,
      unit: entry.unit,
      startDate: entry.startDate,
      endDate: entry.endDate,
      notes: entry.notes,
      evidenceUrl: entry.evidenceUrl,
      isEstimated: entry.isEstimated,
      uncertainty: entry.uncertainty,
      productId: entry.productId,
      supplierId: entry.supplierId,
      vehicleId: entry.vehicleId,
      fuelId: entry.fuelId,
      refrigerantId: entry.refrigerantId,
      rawMaterialId: entry.rawMaterialId,
      logisticsRouteId: entry.logisticsRouteId,
      energySourceId: entry.energySourceId,
      wasteTypeId: entry.wasteTypeId,
      waterSourceId: entry.waterSourceId,
    };
    await prisma.activityDataEntry.upsert({
      where: { id: entry.id },
      create: { id: entry.id, ...data },
      update: data,
    });
  }

  log(
    "activity data",
    `${SEED_TENANT.activityData.length} data sets, ${SEED_TENANT.activityEntries.length} entries ` +
      `across ${SEED_TENANT.meta.reportingYears.join(" and ")}`,
  );
}

async function seedRules(): Promise<void> {
  for (const ruleSet of SEED_TENANT.ruleSets) {
    const data = {
      organizationId: ruleSet.organizationId,
      name: ruleSet.name,
      description: ruleSet.description,
      category: ruleSet.category ?? null,
      priority: ruleSet.priority ?? 0,
      isActive: ruleSet.isActive ?? true,
    };
    await prisma.ruleSet.upsert({
      where: { id: ruleSet.id },
      create: { id: ruleSet.id, ...data },
      update: data,
    });

    for (const rule of ruleSet.rules) {
      const ruleData = {
        ruleSetId: ruleSet.id,
        name: rule.name,
        type: rule.type ?? null,
        priority: rule.priority ?? 0,
        isActive: rule.isActive ?? true,
      };
      await prisma.rule.upsert({
        where: { id: rule.id },
        create: { id: rule.id, ...ruleData },
        update: ruleData,
      });

      // Conditions and actions cascade on delete and are referenced by nothing, so
      // replacing them keeps a re-seed exactly aligned with the fixture.
      await prisma.ruleCondition.deleteMany({ where: { ruleId: rule.id } });
      await prisma.ruleAction.deleteMany({ where: { ruleId: rule.id } });
      for (const condition of rule.conditions) {
        await prisma.ruleCondition.create({
          data: {
            ruleId: rule.id,
            field: condition.field,
            operator: condition.operator,
            value: condition.value,
            logicGroup: condition.logicGroup ?? "AND",
            orderIndex: condition.orderIndex ?? 0,
          },
        });
      }
      for (const action of rule.actions ?? []) {
        await prisma.ruleAction.create({
          data: {
            ruleId: rule.id,
            type: action.type,
            target: action.target ?? null,
            value: action.value ?? null,
            orderIndex: action.orderIndex ?? 0,
          },
        });
      }
    }
  }
  log(
    "validation rules",
    `${SEED_TENANT.ruleSets.length} rule sets, ` +
      `${SEED_TENANT.ruleSets.reduce((total, set) => total + set.rules.length, 0)} rules`,
  );
}

async function seedStrategy(): Promise<void> {
  for (const target of SEED_TENANT.targets) {
    const data = {
      organizationId: target.organizationId,
      targetTypeId: target.targetTypeId,
      name: target.name,
      boundary: target.boundary,
      baselineYear: target.baselineYear,
      targetYear: target.targetYear,
      targetReduction: target.targetReduction,
      methodology: target.methodology,
      status: target.status,
      submittedAt: target.submittedAt,
      approvedAt: target.approvedAt,
      validatedBy: target.validatedBy,
    };
    await prisma.scienceBasedTarget.upsert({
      where: { id: target.id },
      create: { id: target.id, ...data },
      update: data,
    });
  }

  const netZero = SEED_TENANT.netZeroCommitment;
  const netZeroData = {
    targetId: netZero.targetId,
    pledgeYear: SEED_TENANT.meta.currentYear,
    netZeroYear: netZero.netZeroYear,
    neutralizationStrategy: netZero.neutralisationApproach,
    status: netZero.status,
  };
  await prisma.netZeroCommitment.upsert({
    where: { id: netZero.id },
    create: { id: netZero.id, ...netZeroData },
    update: netZeroData,
  });

  const budget = SEED_TENANT.carbonBudget;
  const budgetData = {
    organizationId: budget.organizationId,
    name: budget.name,
    totalBudget: budget.totalBudget,
    unit: budget.unit,
    startYear: budget.startYear,
    endYear: budget.endYear,
    temperature: budget.temperature,
    methodology: budget.methodology,
    status: budget.status,
  };
  await prisma.carbonBudget.upsert({
    where: { id: budget.id },
    create: { id: budget.id, ...budgetData },
    update: budgetData,
  });

  const roadmap = SEED_TENANT.roadmap;
  const roadmapData = {
    organizationId: roadmap.organizationId,
    name: roadmap.name,
    description: roadmap.description,
    baselineYear: roadmap.baselineYear,
    targetYear: roadmap.targetYear,
    reductionTarget: roadmap.reductionTarget,
    targetType: roadmap.targetType,
    status: roadmap.status,
    publishedAt: roadmap.publishedAt,
  };
  await prisma.decarbonizationRoadmap.upsert({
    where: { id: roadmap.id },
    create: { id: roadmap.id, ...roadmapData },
    update: roadmapData,
  });

  for (const action of SEED_TENANT.roadmapActions) {
    const data = {
      roadmapId: action.roadmapId,
      technologyId: action.technologyId,
      name: action.name,
      category: action.category,
      scope: action.scope,
      priority: action.priority,
      expectedReduction: action.expectedReduction,
      unit: action.unit,
      startDate: new Date(Date.UTC(action.startYear, 0, 1)),
      endDate: new Date(Date.UTC(action.endYear, 11, 31)),
      status: action.status,
      owner: action.owner,
      costEstimate: action.costEstimate,
      currency: action.currency,
    };
    await prisma.roadmapAction.upsert({
      where: { id: action.id },
      create: { id: action.id, ...data },
      update: data,
    });
  }

  for (const scenario of SEED_TENANT.scenarios) {
    const data = {
      organizationId: scenario.organizationId,
      name: scenario.name,
      description: scenario.description,
      type: scenario.type,
      baselineYear: scenario.baselineYear,
      targetYear: scenario.targetYear,
      status: scenario.status,
      isPublished: scenario.isPublished,
    };
    await prisma.scenario.upsert({
      where: { id: scenario.id },
      create: { id: scenario.id, ...data },
      update: data,
    });
  }
  for (const assumption of SEED_TENANT.scenarioAssumptions) {
    const data = {
      scenarioId: assumption.scenarioId,
      parameter: assumption.parameter,
      value: assumption.value,
      unit: assumption.unit,
      category: assumption.category,
      description: assumption.description,
      source: assumption.source,
      confidence: assumption.confidence,
    };
    await prisma.scenarioAssumption.upsert({
      where: { id: assumption.id },
      create: { id: assumption.id, ...data },
      update: data,
    });
  }

  log(
    "strategy",
    `${SEED_TENANT.targets.length} targets, ${SEED_TENANT.scenarios.length} scenarios, ` +
      `${SEED_TENANT.roadmapActions.length} roadmap actions`,
  );
}

async function seedCarbonFinance(): Promise<void> {
  for (const credit of SEED_TENANT.carbonCredits) {
    const data = {
      organizationId: credit.organizationId,
      serialNumber: credit.serialNumber ?? null,
      registry: credit.registry ?? null,
      projectName: credit.projectName ?? null,
      projectType: credit.projectType ?? null,
      vintage: credit.vintage ?? null,
      quantity: credit.quantity,
      unit: credit.unit ?? "tCO2e",
      status: credit.status,
      verificationStandard: credit.verificationStandard ?? null,
      country: credit.country ?? null,
      methodology: credit.methodology ?? null,
      issuedAt: credit.issuedAt ?? null,
      retiredAt: credit.retiredAt ?? null,
      expiresAt: credit.expiresAt ?? null,
      price: credit.price ?? null,
      currency: credit.currency ?? null,
    };
    await prisma.carbonCredit.upsert({
      where: { id: credit.id },
      create: { id: credit.id, ...data },
      update: data,
    });
  }

  for (const offset of SEED_TENANT.carbonOffsets) {
    const data = {
      creditId: offset.creditId,
      quantity: offset.quantity,
      unit: offset.unit ?? "tCO2e",
      offsetDate: offset.offsetDate,
      purpose: offset.purpose ?? null,
      reportingYear: offset.reportingYear ?? null,
      notes: offset.notes ?? null,
    };
    // The fixtures carry ids; the type allows them to be absent, so a fixture
    // without one falls back to "one retirement per credit per date".
    const existing =
      offset.id === undefined
        ? await prisma.carbonOffset.findFirst({
            where: { creditId: offset.creditId, offsetDate: offset.offsetDate },
            select: { id: true },
          })
        : await prisma.carbonOffset.findUnique({
            where: { id: offset.id },
            select: { id: true },
          });
    if (existing) {
      await prisma.carbonOffset.update({ where: { id: existing.id }, data });
    } else {
      await prisma.carbonOffset.create({
        data: { ...(offset.id !== undefined ? { id: offset.id } : {}), ...data },
      });
    }
  }

  for (const price of SEED_TENANT.carbonPrices) {
    const data = {
      market: price.market,
      region: price.region ?? null,
      price: price.price,
      currency: price.currency ?? "USD",
      unit: price.unit,
      priceDate: price.priceDate,
      source: price.source ?? null,
    };
    // `CarbonPrice` is a time series with no id in the fixture and no natural
    // unique key, so one quote per market per date is the idempotency key.
    const existing = await prisma.carbonPrice.findFirst({
      where: { market: price.market, priceDate: price.priceDate },
      select: { id: true },
    });
    if (existing) {
      await prisma.carbonPrice.update({ where: { id: existing.id }, data });
    } else {
      await prisma.carbonPrice.create({ data });
    }
  }

  const internal = SEED_TENANT.internalCarbonPrice;
  const internalData = {
    organizationId: internal.organizationId,
    price: internal.price,
    currency: internal.currency,
    unit: internal.unit,
    purpose: internal.purpose,
    effectiveFrom: internal.effectiveFrom,
    effectiveTo: internal.effectiveTo,
    methodology: internal.methodology,
    approvedBy: internal.approvedBy,
  };
  await prisma.internalCarbonPrice.upsert({
    where: { id: internal.id },
    create: { id: internal.id, ...internalData },
    update: internalData,
  });

  log(
    "carbon finance",
    `${SEED_TENANT.carbonCredits.length} credits, ${SEED_TENANT.carbonOffsets.length} retirements, ` +
      `${SEED_TENANT.carbonPrices.length} market prices`,
  );
}

async function seedSecurity(): Promise<void> {
  // Roles reference the organisation; permissions are already seeded globally.
  const permissionIdByKey = new Map(
    (
      await prisma.permission.findMany({ select: { id: true, resource: true, action: true } })
    ).map((row) => [`${row.resource}:${row.action}`, row.id]),
  );
  const fixturePermissionKey = new Map(
    SEED_TENANT.permissions.map((permission) => [
      permission.id,
      `${permission.resource}:${permission.action}`,
    ]),
  );

  for (const role of SEED_TENANT.roles) {
    const data = {
      organizationId: role.organizationId,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
    };
    await prisma.role.upsert({
      where: { id: role.id },
      create: { id: role.id, ...data },
      update: data,
    });

    for (const fixtureId of role.permissionIds) {
      const key = fixturePermissionKey.get(fixtureId);
      const permissionId = key === undefined ? undefined : permissionIdByKey.get(key);
      // A role referencing a permission that is not in the matrix is a fixture bug,
      // caught by the integrity test; skipping it here keeps the seed from failing
      // the whole run on one bad reference.
      if (permissionId === undefined) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        create: { roleId: role.id, permissionId },
        update: {},
      });
    }
  }

  const adminPasswordHash = seedAdminPasswordHash();
  for (const user of SEED_TENANT.users) {
    const isAdmin = user.id === SEED_TENANT.users[0]?.id;
    const data = {
      organizationId: user.organizationId,
      email: user.email,
      name: user.name,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      lastLoginAt: user.lastLoginAt,
      // Only the offline admin carries a local digest (decision 13). Everyone else
      // authenticates through Supabase Auth and has no local credential at all.
      ...(isAdmin ? { passwordHash: adminPasswordHash } : {}),
    };
    await prisma.user.upsert({
      where: { email: user.email },
      create: { id: user.id, ...data },
      update: data,
    });

    for (const roleId of user.roleIds) {
      const existing = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId },
        select: { id: true },
      });
      if (!existing) {
        await prisma.userRole.create({ data: { userId: user.id, roleId } });
      }
    }
  }

  for (const policy of SEED_TENANT.accessPolicies) {
    const data = {
      organizationId: policy.organizationId,
      name: policy.name,
      description: policy.description,
      resource: policy.resource,
      conditions: policy.conditions,
      effect: policy.effect,
      priority: policy.priority,
      isActive: policy.isActive,
    };
    await prisma.accessPolicy.upsert({
      where: { id: policy.id },
      create: { id: policy.id, ...data },
      update: data,
    });
  }

  log(
    "security",
    `${SEED_TENANT.roles.length} roles, ${SEED_TENANT.users.length} users, ` +
      `${SEED_TENANT.accessPolicies.length} access policies`,
  );
  // API keys are deliberately *not* seeded: the fixture hashes are placeholders
  // that cannot authenticate, and seeding a working key would be a backdoor.
  log("api keys", "not seeded — mint one in Settings › API keys");
}

async function main(): Promise<void> {
  console.log("\nCIOS seed\n");

  console.log("Reference data");
  await seedUnitConversions();
  await seedScope3Configs();
  await seedMethodologies();
  await seedDisclosureFrameworks();
  await seedTargetTypes();
  await seedAbatementTechnologies();
  await seedPermissions();

  console.log("\nDemo tenant");
  await seedOrganization();
  await seedHierarchy();
  await seedMasterData();
  await seedEquipmentAndSources();
  await seedFactorLibrary();
  await seedActivityData();
  await seedRules();
  await seedStrategy();
  await seedCarbonFinance();
  await seedSecurity();

  console.log(
    `\nDone. ${SEED_COUNTS.tenant.activityEntries} activity entries seeded; the figures the ` +
      `application shows are identical to demo mode because both read the same dataset.`,
  );
  if (usingDefaultAdminPassword()) {
    console.warn(
      `\n  WARNING: the admin user was seeded with the default password. Set ` +
        `${SEED_ADMIN_PASSWORD_ENV} before seeding, or change the password immediately.\n`,
    );
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error("\nSeed failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
