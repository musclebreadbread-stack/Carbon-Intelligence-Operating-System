-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "GHGScope" AS ENUM ('SCOPE_1', 'SCOPE_2_LOCATION', 'SCOPE_2_MARKET', 'SCOPE_3');

-- CreateEnum
CREATE TYPE "Scope3Category" AS ENUM ('CAT_1_PURCHASED_GOODS', 'CAT_2_CAPITAL_GOODS', 'CAT_3_FUEL_ENERGY', 'CAT_4_UPSTREAM_TRANSPORT', 'CAT_5_WASTE', 'CAT_6_BUSINESS_TRAVEL', 'CAT_7_EMPLOYEE_COMMUTING', 'CAT_8_UPSTREAM_LEASED', 'CAT_9_DOWNSTREAM_TRANSPORT', 'CAT_10_PROCESSING', 'CAT_11_USE_OF_SOLD', 'CAT_12_END_OF_LIFE', 'CAT_13_DOWNSTREAM_LEASED', 'CAT_14_FRANCHISES', 'CAT_15_INVESTMENTS');

-- CreateEnum
CREATE TYPE "OrganizationTier" AS ENUM ('ENTERPRISE', 'BUSINESS_UNIT', 'FACILITY', 'BUILDING', 'PRODUCTION_LINE', 'EQUIPMENT', 'SOURCE');

-- CreateEnum
CREATE TYPE "DataQualityLevel" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'ESTIMATED', 'DEFAULT');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('TRIAL', 'STARTER', 'GROWTH', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "CalculationApproach" AS ENUM ('SPEND_BASED', 'ACTIVITY_BASED', 'HYBRID', 'DIRECT_MEASUREMENT', 'SUPPLIER_SPECIFIC', 'AVERAGE_DATA');

-- CreateEnum
CREATE TYPE "CalculationRunStatus" AS ENUM ('DRAFT', 'RUNNING', 'COMPLETED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReportingFramework" AS ENUM ('GHG_PROTOCOL', 'ISO_14064', 'ISSB_S1', 'ISSB_S2', 'CDP', 'CSRD', 'ESRS', 'TCFD', 'GRI', 'SASB', 'TNFD');

-- CreateEnum
CREATE TYPE "EmissionFactorUnit" AS ENUM ('KG_CO2E_PER_KWH', 'KG_CO2E_PER_LITER', 'KG_CO2E_PER_KG', 'KG_CO2E_PER_TONNE', 'KG_CO2E_PER_M3', 'KG_CO2E_PER_TKM', 'KG_CO2E_PER_PKM', 'KG_CO2E_PER_UNIT', 'KG_CO2E_PER_USD', 'KG_CO2E_PER_MJ');

-- CreateEnum
CREATE TYPE "TargetStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'COMMITTED', 'ON_TRACK', 'OFF_TRACK', 'ACHIEVED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('IDLE', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'ESCALATED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('INFO', 'WARNING', 'ERROR', 'SUCCESS', 'ACTION_REQUIRED');

-- CreateEnum
CREATE TYPE "CreditStatus" AS ENUM ('ISSUED', 'ACTIVE', 'RETIRED', 'CANCELLED', 'PENDING_VERIFICATION', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RuleOperator" AS ENUM ('EQUALS', 'NOT_EQUALS', 'GREATER_THAN', 'LESS_THAN', 'GREATER_THAN_OR_EQUAL', 'LESS_THAN_OR_EQUAL', 'CONTAINS', 'NOT_CONTAINS', 'IN', 'NOT_IN', 'BETWEEN', 'IS_NULL', 'IS_NOT_NULL');

-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('MANUAL_ENTRY', 'IOT_SENSOR', 'API_INTEGRATION', 'FILE_IMPORT', 'ERP_SYSTEM', 'METER_READING', 'INVOICE', 'CALCULATED', 'ESTIMATED');

-- CreateEnum
CREATE TYPE "FuelCategory" AS ENUM ('SOLID', 'LIQUID', 'GASEOUS', 'BIOMASS', 'WASTE');

-- CreateEnum
CREATE TYPE "VehicleType" AS ENUM ('CAR', 'VAN', 'TRUCK', 'BUS', 'RAIL', 'SHIP', 'AIRCRAFT', 'MOTORCYCLE');

-- CreateEnum
CREATE TYPE "EnergyType" AS ENUM ('ELECTRICITY', 'NATURAL_GAS', 'STEAM', 'HEATING', 'COOLING', 'SOLAR', 'WIND', 'HYDRO', 'NUCLEAR', 'BIOMASS_ENERGY');

-- CreateEnum
CREATE TYPE "ScenarioType" AS ENUM ('BASELINE', 'BAU', 'OPTIMISTIC', 'PESSIMISTIC', 'NET_ZERO', 'CUSTOM', 'IEA_NZE', 'IEA_APS', 'IEA_STEPS');

-- CreateEnum
CREATE TYPE "DisclosureStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DRAFT', 'REVIEW', 'SUBMITTED', 'PUBLISHED');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('PENDING', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIALLY_COMPLETED');

-- CreateEnum
CREATE TYPE "MeasurementFrequency" AS ENUM ('REAL_TIME', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY');

-- CreateEnum
CREATE TYPE "AIModelType" AS ENUM ('REGRESSION', 'CLASSIFICATION', 'CLUSTERING', 'TIME_SERIES', 'NLP', 'COMPUTER_VISION', 'RECOMMENDATION', 'ANOMALY_DETECTION', 'LLM', 'EMBEDDING');

-- CreateEnum
CREATE TYPE "TargetBoundary" AS ENUM ('SCOPE_1_2', 'SCOPE_1_2_3', 'SCOPE_3_ONLY', 'FLAG', 'FULL_VALUE_CHAIN');

-- CreateEnum
CREATE TYPE "TrialRequestStatus" AS ENUM ('PENDING', 'CONTACTED', 'CONVERTED', 'DECLINED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "passwordHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMembership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedAt" TIMESTAMP(3),
    "invitedBy" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "oldValue" JSONB,
    "newValue" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "APIKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "rateLimitPerMinute" INTEGER,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "APIKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessPolicy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "resource" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "effect" TEXT NOT NULL DEFAULT 'allow',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "AccessPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EncryptionKey" (
    "id" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "keyMaterial" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "rotatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "EncryptionKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "industry" TEXT,
    "sector" TEXT,
    "country" TEXT,
    "region" TEXT,
    "address" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "registrationNum" TEXT,
    "fiscalYearStart" INTEGER NOT NULL DEFAULT 1,
    "baseCurrency" TEXT NOT NULL DEFAULT 'USD',
    "reportingYear" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "plan" "PlanTier" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3),
    "planExpiresAt" TIMESTAMP(3),

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessUnit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "tier" "OrganizationTier" NOT NULL DEFAULT 'BUSINESS_UNIT',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "BusinessUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Facility" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "area" DOUBLE PRECISION,
    "areaUnit" TEXT DEFAULT 'sqm',
    "operationalControl" BOOLEAN NOT NULL DEFAULT true,
    "equityShare" DOUBLE PRECISION DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "businessUnitId" TEXT,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT,
    "floors" INTEGER,
    "area" DOUBLE PRECISION,
    "areaUnit" TEXT DEFAULT 'sqm',
    "yearBuilt" INTEGER,
    "energyRating" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "facilityId" TEXT NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionLine" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT,
    "capacity" DOUBLE PRECISION,
    "capacityUnit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "buildingId" TEXT NOT NULL,

    CONSTRAINT "ProductionLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "installDate" TIMESTAMP(3),
    "efficiency" DOUBLE PRECISION,
    "fuelTypeId" TEXT,
    "refrigerantId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "productionLineId" TEXT NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "scope" "GHGScope" NOT NULL,
    "scope3Category" "Scope3Category",
    "sourceType" TEXT,
    "description" TEXT,
    "calculationApproach" "CalculationApproach" NOT NULL DEFAULT 'ACTIVITY_BASED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "facilityId" TEXT,
    "buildingId" TEXT,
    "productionLineId" TEXT,
    "equipmentId" TEXT,

    CONSTRAINT "EmissionSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "category" TEXT,
    "description" TEXT,
    "unit" TEXT,
    "weight" DOUBLE PRECISION,
    "weightUnit" TEXT,
    "lifecycleStage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawMaterial" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT,
    "emissionIntensity" DOUBLE PRECISION,
    "sourceRegion" TEXT,
    "isRecycled" BOOLEAN NOT NULL DEFAULT false,
    "recycledContent" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fuel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fuelTypeId" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "netCalorific" DOUBLE PRECISION,
    "grossCalorific" DOUBLE PRECISION,
    "density" DOUBLE PRECISION,
    "carbonContent" DOUBLE PRECISION,
    "isRenewable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fuel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FuelType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FuelCategory" NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuelType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "VehicleType" NOT NULL,
    "fuelType" TEXT,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "efficiency" DOUBLE PRECISION,
    "efficiencyUnit" TEXT,
    "isOwned" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refrigerant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chemicalFormula" TEXT,
    "gwp100" DOUBLE PRECISION NOT NULL,
    "gwp20" DOUBLE PRECISION,
    "ozoneDepletionPotential" DOUBLE PRECISION,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Refrigerant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "category" TEXT,
    "country" TEXT,
    "contactEmail" TEXT,
    "tier" INTEGER NOT NULL DEFAULT 1,
    "sustainabilityRating" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LogisticsRoute" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "distance" DOUBLE PRECISION NOT NULL,
    "distanceUnit" TEXT NOT NULL DEFAULT 'km',
    "transportMode" TEXT NOT NULL,
    "isReturn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogisticsRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnergySource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "EnergyType" NOT NULL,
    "provider" TEXT,
    "gridRegion" TEXT,
    "renewablePercent" DOUBLE PRECISION DEFAULT 0,
    "contractType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnergySource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WasteType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "disposalMethod" TEXT,
    "isHazardous" BOOLEAN NOT NULL DEFAULT false,
    "recyclingRate" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WasteType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WaterSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "source" TEXT,
    "treatment" TEXT,
    "isRecycled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WaterSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityData" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "GHGScope" NOT NULL,
    "scope3Category" "Scope3Category",
    "reportingYear" INTEGER NOT NULL,
    "reportingMonth" INTEGER,
    "dataSource" "DataSourceType" NOT NULL DEFAULT 'MANUAL_ENTRY',
    "dataQuality" "DataQualityLevel" NOT NULL DEFAULT 'MEDIUM',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "facilityId" TEXT,
    "businessUnitId" TEXT,

    CONSTRAINT "ActivityData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityDataEntry" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "evidenceUrl" TEXT,
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "uncertainty" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activityDataId" TEXT NOT NULL,
    "emissionSourceId" TEXT,
    "productId" TEXT,
    "supplierId" TEXT,
    "vehicleId" TEXT,
    "fuelId" TEXT,
    "refrigerantId" TEXT,
    "rawMaterialId" TEXT,
    "logisticsRouteId" TEXT,
    "energySourceId" TEXT,
    "wasteTypeId" TEXT,
    "waterSourceId" TEXT,

    CONSTRAINT "ActivityDataEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImportJob" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT,
    "fileUrl" TEXT,
    "fileType" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'PENDING',
    "totalRows" INTEGER,
    "processedRows" INTEGER DEFAULT 0,
    "errorRows" INTEGER DEFAULT 0,
    "errorLog" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "DataImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataImportMapping" (
    "id" TEXT NOT NULL,
    "sourceColumn" TEXT NOT NULL,
    "targetField" TEXT NOT NULL,
    "transformation" TEXT,
    "defaultValue" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importJobId" TEXT NOT NULL,

    CONSTRAINT "DataImportMapping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataValidationRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "ruleType" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'error',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataValidationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataQualityScore" (
    "id" TEXT NOT NULL,
    "overallScore" DOUBLE PRECISION NOT NULL,
    "completeness" DOUBLE PRECISION,
    "accuracy" DOUBLE PRECISION,
    "timeliness" DOUBLE PRECISION,
    "consistency" DOUBLE PRECISION,
    "reliability" DOUBLE PRECISION,
    "methodology" TEXT,
    "notes" TEXT,
    "assessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activityDataEntryId" TEXT NOT NULL,

    CONSTRAINT "DataQualityScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IoTDevice" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "protocol" TEXT,
    "frequency" "MeasurementFrequency" NOT NULL DEFAULT 'HOURLY',
    "unit" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastReadingAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "facilityId" TEXT NOT NULL,

    CONSTRAINT "IoTDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IoTReading" (
    "id" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "quality" DOUBLE PRECISION DEFAULT 1,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceId" TEXT NOT NULL,

    CONSTRAINT "IoTReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeterReading" (
    "id" TEXT NOT NULL,
    "meterNumber" TEXT NOT NULL,
    "readingValue" DOUBLE PRECISION NOT NULL,
    "previousValue" DOUBLE PRECISION,
    "consumption" DOUBLE PRECISION,
    "unit" TEXT NOT NULL,
    "readingDate" TIMESTAMP(3) NOT NULL,
    "readingType" TEXT,
    "isEstimated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "facilityId" TEXT NOT NULL,

    CONSTRAINT "MeterReading_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionCalculation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportingYear" INTEGER NOT NULL,
    "reportingPeriodStart" TIMESTAMP(3) NOT NULL,
    "reportingPeriodEnd" TIMESTAMP(3) NOT NULL,
    "scope" "GHGScope" NOT NULL,
    "scope3Category" "Scope3Category",
    "approach" "CalculationApproach" NOT NULL,
    "status" "CalculationRunStatus" NOT NULL DEFAULT 'COMPLETED',
    "totalEmissions" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "calculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "runId" TEXT NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "gwpVersion" TEXT NOT NULL,
    "scope2Basis" TEXT NOT NULL,
    "consolidationApproach" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "methodologyId" TEXT,

    CONSTRAINT "EmissionCalculation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionResult" (
    "id" TEXT NOT NULL,
    "co2Emissions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ch4Emissions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "n2oEmissions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hfcEmissions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pfcEmissions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sf6Emissions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nf3Emissions" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalCO2e" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "biogenicCO2" DOUBLE PRECISION DEFAULT 0,
    "scope" "GHGScope" NOT NULL,
    "scope3Category" "Scope3Category",
    "dataQuality" "DataQualityLevel",
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "calculationId" TEXT NOT NULL,
    "emissionSourceId" TEXT,
    "facilityId" TEXT,
    "businessUnitId" TEXT,
    "emissionFactorId" TEXT,
    "activityDataEntryId" TEXT,

    CONSTRAINT "EmissionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionAllocation" (
    "id" TEXT NOT NULL,
    "allocationMethod" TEXT NOT NULL,
    "allocationFactor" DOUBLE PRECISION NOT NULL,
    "allocatedAmount" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "targetEntity" TEXT NOT NULL,
    "targetEntityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "calculationId" TEXT NOT NULL,
    "resultId" TEXT,

    CONSTRAINT "EmissionAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculationMethodology" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "framework" TEXT NOT NULL,
    "description" TEXT,
    "formula" TEXT,
    "parameters" JSONB,
    "sourceUrl" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalculationMethodology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculationFormula" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "expression" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "description" TEXT,
    "applicableScope" "GHGScope",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "methodologyId" TEXT NOT NULL,

    CONSTRAINT "CalculationFormula_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UncertaintyAnalysis" (
    "id" TEXT NOT NULL,
    "overallUncertainty" DOUBLE PRECISION NOT NULL,
    "activityDataUncertainty" DOUBLE PRECISION,
    "emissionFactorUncertainty" DOUBLE PRECISION,
    "methodologyUncertainty" DOUBLE PRECISION,
    "confidenceLevel" DOUBLE PRECISION DEFAULT 95,
    "monteCarloIterations" INTEGER,
    "lowerBound" DOUBLE PRECISION,
    "upperBound" DOUBLE PRECISION,
    "methodology" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "calculationId" TEXT NOT NULL,

    CONSTRAINT "UncertaintyAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scope3CategoryConfig" (
    "id" TEXT NOT NULL,
    "category" "Scope3Category" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isRelevant" BOOLEAN NOT NULL DEFAULT true,
    "methodology" TEXT,
    "dataSource" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Scope3CategoryConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionInventory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "reportingYear" INTEGER NOT NULL,
    "baselineYear" INTEGER,
    "scope1Total" DOUBLE PRECISION DEFAULT 0,
    "scope2Location" DOUBLE PRECISION DEFAULT 0,
    "scope2Market" DOUBLE PRECISION DEFAULT 0,
    "scope3Total" DOUBLE PRECISION DEFAULT 0,
    "totalEmissions" DOUBLE PRECISION DEFAULT 0,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "verifiedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "EmissionInventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionFactor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" "EmissionFactorUnit" NOT NULL,
    "gasType" TEXT NOT NULL DEFAULT 'CO2e',
    "scope" "GHGScope",
    "scope3Category" "Scope3Category",
    "region" TEXT,
    "country" TEXT,
    "sector" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "uncertainty" DOUBLE PRECISION,
    "dataQuality" "DataQualityLevel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,
    "sourceId" TEXT,
    "categoryId" TEXT,
    "versionId" TEXT,

    CONSTRAINT "EmissionFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionFactorEmbedding" (
    "emissionFactorId" TEXT NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "model" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmissionFactorEmbedding_pkey" PRIMARY KEY ("emissionFactorId")
);

-- CreateTable
CREATE TABLE "EmissionFactorSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "publisher" TEXT,
    "url" TEXT,
    "methodology" TEXT,
    "lastUpdated" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmissionFactorSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionFactorVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "releaseDate" TIMESTAMP(3),
    "description" TEXT,
    "isLatest" BOOLEAN NOT NULL DEFAULT false,
    "changelog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "EmissionFactorVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionFactorCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "description" TEXT,
    "level" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmissionFactorCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitConversion" (
    "id" TEXT NOT NULL,
    "fromUnit" TEXT NOT NULL,
    "toUnit" TEXT NOT NULL,
    "factor" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmissionFactorUpdate" (
    "id" TEXT NOT NULL,
    "factorName" TEXT NOT NULL,
    "oldValue" DOUBLE PRECISION NOT NULL,
    "newValue" DOUBLE PRECISION NOT NULL,
    "changeReason" TEXT,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmissionFactorUpdate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIAnalysis" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'IDLE',
    "inputData" JSONB,
    "outputData" JSONB,
    "summary" TEXT,
    "confidence" DOUBLE PRECISION,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "modelId" TEXT,

    CONSTRAINT "AIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRecommendation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "impact" TEXT,
    "impactValue" DOUBLE PRECISION,
    "effort" TEXT,
    "confidence" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "implementedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "AIRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIPrediction" (
    "id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "predictedValue" DOUBLE PRECISION NOT NULL,
    "actualValue" DOUBLE PRECISION,
    "confidence" DOUBLE PRECISION,
    "lowerBound" DOUBLE PRECISION,
    "upperBound" DOUBLE PRECISION,
    "horizon" TEXT,
    "targetDate" TIMESTAMP(3),
    "methodology" TEXT,
    "features" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "AIPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIModel" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AIModelType" NOT NULL,
    "version" TEXT NOT NULL,
    "description" TEXT,
    "provider" TEXT,
    "endpoint" TEXT,
    "parameters" JSONB,
    "metrics" JSONB,
    "accuracy" DOUBLE PRECISION,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trainedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "AIModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AITrainingData" (
    "id" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "dataSource" TEXT,
    "features" JSONB,
    "labels" JSONB,
    "sampleCount" INTEGER,
    "quality" DOUBLE PRECISION,
    "version" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "modelId" TEXT NOT NULL,

    CONSTRAINT "AITrainingData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnomalyDetection" (
    "id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "detectedValue" DOUBLE PRECISION NOT NULL,
    "expectedValue" DOUBLE PRECISION NOT NULL,
    "deviation" DOUBLE PRECISION NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "resolution" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "AnomalyDetection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataGapAnalysis" (
    "id" TEXT NOT NULL,
    "dataCategory" TEXT NOT NULL,
    "gapType" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL,
    "affectedPeriodStart" TIMESTAMP(3),
    "affectedPeriodEnd" TIMESTAMP(3),
    "estimationMethod" TEXT,
    "estimatedValue" DOUBLE PRECISION,
    "confidenceLevel" DOUBLE PRECISION,
    "recommendation" TEXT,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "DataGapAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConfidenceScore" (
    "id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "methodology" TEXT,
    "factors" JSONB,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "AIConfidenceScore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecarbonizationRoadmap" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "baselineYear" INTEGER NOT NULL,
    "targetYear" INTEGER NOT NULL,
    "baselineEmissions" DOUBLE PRECISION,
    "targetEmissions" DOUBLE PRECISION,
    "reductionTarget" DOUBLE PRECISION,
    "targetType" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "DecarbonizationRoadmap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapMilestone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetYear" INTEGER NOT NULL,
    "targetReduction" DOUBLE PRECISION,
    "currentProgress" DOUBLE PRECISION DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roadmapId" TEXT NOT NULL,

    CONSTRAINT "RoadmapMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoadmapAction" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "scope" "GHGScope",
    "priority" INTEGER NOT NULL DEFAULT 0,
    "expectedReduction" DOUBLE PRECISION,
    "actualReduction" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'planned',
    "owner" TEXT,
    "costEstimate" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roadmapId" TEXT NOT NULL,
    "milestoneId" TEXT,
    "technologyId" TEXT,

    CONSTRAINT "RoadmapAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbatementTechnology" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "technologyReadiness" INTEGER,
    "abatementPotential" DOUBLE PRECISION,
    "costPerTonne" DOUBLE PRECISION,
    "implementationTime" TEXT,
    "scalability" TEXT,
    "applicableSectors" TEXT[],
    "cobenefits" TEXT[],
    "risks" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbatementTechnology_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MACCCurve" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abatementPotential" DOUBLE PRECISION NOT NULL,
    "marginalCost" DOUBLE PRECISION NOT NULL,
    "cumulativeAbatement" DOUBLE PRECISION,
    "year" INTEGER NOT NULL,
    "region" TEXT,
    "sector" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "technologyId" TEXT NOT NULL,

    CONSTRAINT "MACCCurve_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvestmentAnalysis" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capex" DOUBLE PRECISION,
    "opex" DOUBLE PRECISION,
    "annualSavings" DOUBLE PRECISION,
    "roi" DOUBLE PRECISION,
    "irr" DOUBLE PRECISION,
    "npv" DOUBLE PRECISION,
    "paybackPeriod" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "discountRate" DOUBLE PRECISION DEFAULT 0.08,
    "projectLifeYears" INTEGER,
    "riskLevel" TEXT,
    "assumptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "roadmapId" TEXT NOT NULL,

    CONSTRAINT "InvestmentAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ScenarioType" NOT NULL DEFAULT 'CUSTOM',
    "baselineYear" INTEGER NOT NULL,
    "targetYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioAssumption" (
    "id" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT,
    "category" TEXT,
    "description" TEXT,
    "source" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scenarioId" TEXT NOT NULL,

    CONSTRAINT "ScenarioAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioResult" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "scope1Emissions" DOUBLE PRECISION,
    "scope2Emissions" DOUBLE PRECISION,
    "scope3Emissions" DOUBLE PRECISION,
    "totalEmissions" DOUBLE PRECISION,
    "reductionFromBaseline" DOUBLE PRECISION,
    "energyConsumption" DOUBLE PRECISION,
    "renewableShare" DOUBLE PRECISION,
    "costImplication" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scenarioId" TEXT NOT NULL,

    CONSTRAINT "ScenarioResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioComparison" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "metric" TEXT NOT NULL,
    "scenarioAValue" DOUBLE PRECISION,
    "scenarioBValue" DOUBLE PRECISION,
    "difference" DOUBLE PRECISION,
    "percentChange" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scenarioAId" TEXT NOT NULL,
    "scenarioBId" TEXT NOT NULL,

    CONSTRAINT "ScenarioComparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarbonBudget" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalBudget" DOUBLE PRECISION NOT NULL,
    "usedBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remainingBudget" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "startYear" INTEGER NOT NULL,
    "endYear" INTEGER NOT NULL,
    "temperature" DOUBLE PRECISION DEFAULT 1.5,
    "methodology" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "CarbonBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetPathway" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "targetEmissions" DOUBLE PRECISION NOT NULL,
    "actualEmissions" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "isInterim" BOOLEAN NOT NULL DEFAULT false,
    "methodology" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "scenarioId" TEXT NOT NULL,

    CONSTRAINT "TargetPathway_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MRVPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "framework" TEXT,
    "version" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "MRVPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Measurement" (
    "id" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL,
    "uncertainty" DOUBLE PRECISION,
    "methodology" TEXT,
    "frequency" "MeasurementFrequency",
    "measuredAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "dataSource" "DataSourceType",
    "evidenceUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mrvPlanId" TEXT NOT NULL,
    "monitoringParameterId" TEXT,
    "meterReadingId" TEXT,

    CONSTRAINT "Measurement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Report" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "framework" "ReportingFramework",
    "reportingYear" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "DisclosureStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "content" JSONB,
    "generatedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT,

    CONSTRAINT "Report_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "framework" "ReportingFramework",
    "version" TEXT,
    "description" TEXT,
    "structure" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportSection" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "content" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" "DisclosureStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportId" TEXT,
    "templateId" TEXT,

    CONSTRAINT "ReportSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportDataPoint" (
    "id" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "value" TEXT,
    "numericValue" DOUBLE PRECISION,
    "unit" TEXT,
    "year" INTEGER,
    "source" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportId" TEXT,
    "sectionId" TEXT,

    CONSTRAINT "ReportDataPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringPlan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "frequency" "MeasurementFrequency" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastExecuted" TIMESTAMP(3),
    "nextExecution" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "mrvPlanId" TEXT NOT NULL,

    CONSTRAINT "MonitoringPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringParameter" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL,
    "frequency" "MeasurementFrequency",
    "methodology" TEXT,
    "threshold" DOUBLE PRECISION,
    "alertOnBreach" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "monitoringPlanId" TEXT NOT NULL,
    "emissionSourceId" TEXT,

    CONSTRAINT "MonitoringParameter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationEngagement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "verifierName" TEXT,
    "verifierOrg" TEXT,
    "framework" "ReportingFramework",
    "scope" TEXT,
    "level" TEXT,
    "status" "VerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "opinionType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "VerificationEngagement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationScope" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "boundaries" TEXT,
    "materialityThreshold" DOUBLE PRECISION,
    "status" "VerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "engagementId" TEXT NOT NULL,

    CONSTRAINT "VerificationScope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditTrail" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "reason" TEXT,
    "performedBy" TEXT,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT,

    CONSTRAINT "AuditTrail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArchivedAuditTrail" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "changes" JSONB,
    "reason" TEXT,
    "performedBy" TEXT,
    "ipAddress" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ArchivedAuditTrail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvidence" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fileUrl" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "hash" TEXT,
    "storageKey" TEXT,
    "storageProvider" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "auditTrailId" TEXT,

    CONSTRAINT "AuditEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationFinding" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "recommendation" TEXT,
    "response" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "dueDate" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "misstatementAmount" DOUBLE PRECISION,
    "estimatedFinancialImpact" DOUBLE PRECISION,
    "impactCurrency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "engagementId" TEXT NOT NULL,
    "assignedToId" TEXT,

    CONSTRAINT "VerificationFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationStatement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "opinionType" TEXT,
    "statement" TEXT,
    "scope" TEXT,
    "limitations" TEXT,
    "conclusion" TEXT,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "signedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "engagementId" TEXT NOT NULL,

    CONSTRAINT "VerificationStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalSignature" (
    "id" TEXT NOT NULL,
    "signerName" TEXT NOT NULL,
    "signerEmail" TEXT,
    "signerOrg" TEXT,
    "signatureHash" TEXT NOT NULL,
    "algorithm" TEXT,
    "certificate" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statementId" TEXT NOT NULL,

    CONSTRAINT "DigitalSignature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidencePackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "fileCount" INTEGER NOT NULL DEFAULT 0,
    "totalSize" INTEGER,
    "hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "engagementId" TEXT NOT NULL,

    CONSTRAINT "EvidencePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VersionHistory" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "changes" JSONB,
    "changeReason" TEXT,
    "changedBy" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VersionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarbonCredit" (
    "id" TEXT NOT NULL,
    "serialNumber" TEXT,
    "registry" TEXT,
    "projectName" TEXT,
    "projectType" TEXT,
    "vintage" INTEGER,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "status" "CreditStatus" NOT NULL DEFAULT 'ACTIVE',
    "verificationStandard" TEXT,
    "country" TEXT,
    "methodology" TEXT,
    "issuedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "price" DOUBLE PRECISION,
    "currency" TEXT DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "CarbonCredit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarbonOffset" (
    "id" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "offsetDate" TIMESTAMP(3) NOT NULL,
    "purpose" TEXT,
    "reportingYear" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creditId" TEXT NOT NULL,

    CONSTRAINT "CarbonOffset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarbonPrice" (
    "id" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "region" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unit" TEXT NOT NULL DEFAULT 'per tCO2e',
    "priceDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CarbonPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InternalCarbonPrice" (
    "id" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "unit" TEXT NOT NULL DEFAULT 'per tCO2e',
    "purpose" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "methodology" TEXT,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "InternalCarbonPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ETSPosition" (
    "id" TEXT NOT NULL,
    "scheme" TEXT NOT NULL,
    "allowances" DOUBLE PRECISION NOT NULL,
    "surrendered" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining" DOUBLE PRECISION,
    "vintage" INTEGER,
    "complianceYear" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ETSPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RECertificate" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT,
    "registry" TEXT,
    "energySource" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'MWh',
    "generationStart" TIMESTAMP(3),
    "generationEnd" TIMESTAMP(3),
    "facilityName" TEXT,
    "facilityLocation" TEXT,
    "isRetired" BOOLEAN NOT NULL DEFAULT false,
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RECertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PPA" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "energySource" TEXT NOT NULL,
    "contractType" TEXT NOT NULL,
    "capacity" DOUBLE PRECISION,
    "capacityUnit" TEXT DEFAULT 'MW',
    "pricePerUnit" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "annualVolume" DOUBLE PRECISION,
    "volumeUnit" TEXT DEFAULT 'MWh',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PPA_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VoluntaryMarket" (
    "id" TEXT NOT NULL,
    "programName" TEXT NOT NULL,
    "standard" TEXT NOT NULL,
    "projectType" TEXT,
    "region" TEXT,
    "priceRange" TEXT,
    "volume" DOUBLE PRECISION,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "vintage" INTEGER,
    "rating" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VoluntaryMarket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CarbonTrade" (
    "id" TEXT NOT NULL,
    "tradeType" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'tCO2e',
    "pricePerUnit" DOUBLE PRECISION NOT NULL,
    "totalValue" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "counterparty" TEXT,
    "tradeDate" TIMESTAMP(3) NOT NULL,
    "settlementDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "creditId" TEXT,

    CONSTRAINT "CarbonTrade_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisclosureFramework" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" "ReportingFramework" NOT NULL,
    "version" TEXT,
    "description" TEXT,
    "publisher" TEXT,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisclosureFramework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisclosureRequirement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "dataType" TEXT,
    "guidance" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "frameworkId" TEXT NOT NULL,

    CONSTRAINT "DisclosureRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisclosureResponse" (
    "id" TEXT NOT NULL,
    "value" TEXT,
    "numericValue" DOUBLE PRECISION,
    "status" "DisclosureStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "notes" TEXT,
    "evidenceUrl" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "requirementId" TEXT NOT NULL,
    "reportId" TEXT,

    CONSTRAINT "DisclosureResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisclosureReport" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "framework" "ReportingFramework" NOT NULL,
    "reportingYear" INTEGER NOT NULL,
    "status" "DisclosureStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "submittedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "DisclosureReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CDPResponse" (
    "id" TEXT NOT NULL,
    "questionNumber" TEXT NOT NULL,
    "questionText" TEXT,
    "responseText" TEXT,
    "score" TEXT,
    "category" TEXT,
    "year" INTEGER NOT NULL,
    "status" "DisclosureStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportId" TEXT NOT NULL,

    CONSTRAINT "CDPResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ISSBReport" (
    "id" TEXT NOT NULL,
    "standard" TEXT NOT NULL DEFAULT 'IFRS S2',
    "governanceDisclosure" TEXT,
    "strategyDisclosure" TEXT,
    "riskManagement" TEXT,
    "metricsAndTargets" TEXT,
    "transitionPlan" TEXT,
    "scenarioAnalysis" TEXT,
    "status" "DisclosureStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportId" TEXT NOT NULL,

    CONSTRAINT "ISSBReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CSRDReport" (
    "id" TEXT NOT NULL,
    "standard" TEXT NOT NULL DEFAULT 'ESRS',
    "materialityAssessment" JSONB,
    "doubleMateriality" JSONB,
    "esrsE1Climate" TEXT,
    "esrsE2Pollution" TEXT,
    "esrsE3Water" TEXT,
    "esrsE4Biodiversity" TEXT,
    "esrsE5Resources" TEXT,
    "esrsS1Workforce" TEXT,
    "esrsG1Governance" TEXT,
    "status" "DisclosureStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportId" TEXT NOT NULL,

    CONSTRAINT "CSRDReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TCFDReport" (
    "id" TEXT NOT NULL,
    "governance" TEXT,
    "strategy" TEXT,
    "riskManagement" TEXT,
    "metricsTargets" TEXT,
    "physicalRisks" JSONB,
    "transitionRisks" JSONB,
    "opportunities" JSONB,
    "scenarioAnalysis" TEXT,
    "status" "DisclosureStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportId" TEXT NOT NULL,

    CONSTRAINT "TCFDReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportGeneration" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "format" TEXT NOT NULL DEFAULT 'pdf',
    "templateUsed" TEXT,
    "generatedUrl" TEXT,
    "generatedAt" TIMESTAMP(3),
    "fileSize" INTEGER,
    "pageCount" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reportId" TEXT NOT NULL,

    CONSTRAINT "ReportGeneration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSet" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "RuleSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ruleSetId" TEXT NOT NULL,

    CONSTRAINT "Rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleCondition" (
    "id" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "operator" "RuleOperator" NOT NULL,
    "value" TEXT NOT NULL,
    "logicGroup" TEXT DEFAULT 'AND',
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "RuleCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleAction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" TEXT,
    "value" TEXT,
    "parameters" JSONB,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "RuleAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleExecution" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "triggerType" TEXT,
    "triggeredBy" TEXT,
    "inputData" JSONB,
    "outputData" JSONB,
    "duration" INTEGER,
    "errorMessage" TEXT,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "RuleExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "changeNotes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ruleId" TEXT NOT NULL,

    CONSTRAINT "RuleVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryRegulation" (
    "id" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "complianceDeadline" TIMESTAMP(3),
    "penalties" TEXT,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CountryRegulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndustryStandard" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "version" TEXT,
    "publisher" TEXT,
    "description" TEXT,
    "sector" TEXT,
    "url" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IndustryStandard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataLineageNode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "graphId" TEXT,

    CONSTRAINT "DataLineageNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataLineageEdge" (
    "id" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "transformationType" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceNodeId" TEXT NOT NULL,
    "targetNodeId" TEXT NOT NULL,

    CONSTRAINT "DataLineageEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataTransformation" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "logic" TEXT,
    "parameters" JSONB,
    "version" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "edgeId" TEXT NOT NULL,

    CONSTRAINT "DataTransformation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DataSourceType" NOT NULL,
    "description" TEXT,
    "connectionString" TEXT,
    "credentials" JSONB,
    "schema" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" TIMESTAMP(3),
    "syncFrequency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT,

    CONSTRAINT "DataSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataVersion" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "hash" TEXT,
    "size" INTEGER,
    "recordCount" INTEGER,
    "changes" JSONB,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dataSourceId" TEXT NOT NULL,

    CONSTRAINT "DataVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineageGraph" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LineageGraph_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIExplanation" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "summary" TEXT,
    "methodology" TEXT,
    "confidence" DOUBLE PRECISION,
    "humanReadable" TEXT,
    "technicalDetail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "analysisId" TEXT,

    CONSTRAINT "AIExplanation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExplanationStep" (
    "id" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "inputData" JSONB,
    "outputData" JSONB,
    "methodology" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "explanationId" TEXT NOT NULL,

    CONSTRAINT "ExplanationStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssumptionLog" (
    "id" TEXT NOT NULL,
    "assumption" TEXT NOT NULL,
    "category" TEXT,
    "justification" TEXT,
    "source" TEXT,
    "impact" TEXT,
    "sensitivity" DOUBLE PRECISION,
    "isValidated" BOOLEAN NOT NULL DEFAULT false,
    "validatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "explanationId" TEXT NOT NULL,

    CONSTRAINT "AssumptionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalculationTrace" (
    "id" TEXT NOT NULL,
    "stepName" TEXT NOT NULL,
    "formula" TEXT,
    "inputs" JSONB,
    "output" DOUBLE PRECISION,
    "unit" TEXT,
    "notes" TEXT,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "explanationId" TEXT NOT NULL,

    CONSTRAINT "CalculationTrace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfidenceBreakdown" (
    "id" TEXT NOT NULL,
    "factor" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "weight" DOUBLE PRECISION,
    "description" TEXT,
    "methodology" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "explanationId" TEXT NOT NULL,

    CONSTRAINT "ConfidenceBreakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceLink" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "url" TEXT,
    "description" TEXT,
    "relevance" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "explanationId" TEXT NOT NULL,

    CONSTRAINT "EvidenceLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "capabilities" TEXT[],
    "config" JSONB,
    "status" "AgentStatus" NOT NULL DEFAULT 'IDLE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastActiveAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTask" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" "AgentStatus" NOT NULL DEFAULT 'IDLE',
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "timeout" INTEGER,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxRetries" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "agentId" TEXT NOT NULL,

    CONSTRAINT "AgentTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentExecution" (
    "id" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB,
    "output" JSONB,
    "logs" JSONB,
    "tokensUsed" INTEGER,
    "costUsd" DOUBLE PRECISION,
    "duration" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentId" TEXT NOT NULL,
    "taskId" TEXT,

    CONSTRAINT "AgentExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentTool" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "schema" JSONB,
    "config" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "agentId" TEXT NOT NULL,

    CONSTRAINT "AgentTool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MCPServer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "version" TEXT,
    "protocol" TEXT NOT NULL DEFAULT 'stdio',
    "capabilities" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "healthCheckUrl" TEXT,
    "lastHealthCheck" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MCPServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MCPConnection" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "config" JSONB,
    "lastPingAt" TIMESTAMP(3),
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "agentId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,

    CONSTRAINT "MCPConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentConversation" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "context" JSONB,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "agentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "AgentConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "tokensUsed" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversationId" TEXT NOT NULL,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScienceBasedTarget" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "boundary" "TargetBoundary" NOT NULL,
    "baselineYear" INTEGER NOT NULL,
    "baselineEmissions" DOUBLE PRECISION,
    "targetYear" INTEGER NOT NULL,
    "targetReduction" DOUBLE PRECISION NOT NULL,
    "targetAbsolute" DOUBLE PRECISION,
    "currentEmissions" DOUBLE PRECISION,
    "currentProgress" DOUBLE PRECISION DEFAULT 0,
    "methodology" TEXT,
    "status" "TargetStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "validatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,
    "targetTypeId" TEXT,

    CONSTRAINT "ScienceBasedTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "methodology" TEXT,
    "pathway" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TargetType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TargetProgress" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "emissions" DOUBLE PRECISION NOT NULL,
    "reductionFromBaseline" DOUBLE PRECISION,
    "reductionPercent" DOUBLE PRECISION,
    "isOnTrack" BOOLEAN,
    "notes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "TargetProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetZeroCommitment" (
    "id" TEXT NOT NULL,
    "pledgeYear" INTEGER NOT NULL,
    "netZeroYear" INTEGER NOT NULL,
    "interimTarget" DOUBLE PRECISION,
    "interimYear" INTEGER,
    "residualEmissions" DOUBLE PRECISION,
    "neutralizationStrategy" TEXT,
    "status" "TargetStatus" NOT NULL DEFAULT 'DRAFT',
    "declaredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "NetZeroCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FLAGTarget" (
    "id" TEXT NOT NULL,
    "sector" TEXT NOT NULL,
    "commodity" TEXT,
    "baselineEmissions" DOUBLE PRECISION,
    "targetReduction" DOUBLE PRECISION,
    "landUseChange" DOUBLE PRECISION,
    "methodology" TEXT,
    "status" "TargetStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "FLAGTarget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaselineYear" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "scope1Emissions" DOUBLE PRECISION,
    "scope2Emissions" DOUBLE PRECISION,
    "scope3Emissions" DOUBLE PRECISION,
    "totalEmissions" DOUBLE PRECISION,
    "methodology" TEXT,
    "isRecalculated" BOOLEAN NOT NULL DEFAULT false,
    "recalculationReason" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "targetId" TEXT NOT NULL,

    CONSTRAINT "BaselineYear_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'in_app',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "actionUrl" TEXT,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "frequency" TEXT DEFAULT 'immediate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "triggerType" TEXT,
    "triggerConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowStep" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB,
    "orderIndex" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "timeout" INTEGER,
    "retryConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workflowId" TEXT NOT NULL,

    CONSTRAINT "WorkflowStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowExecution" (
    "id" TEXT NOT NULL,
    "status" "WorkflowStatus" NOT NULL DEFAULT 'ACTIVE',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "workflowId" TEXT NOT NULL,

    CONSTRAINT "WorkflowExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "comments" TEXT,
    "decidedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "reminderSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "approverId" TEXT NOT NULL,
    "stepId" TEXT,
    "executionId" TEXT,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialRequest" (
    "id" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "facilityCount" INTEGER,
    "message" TEXT,
    "status" "TrialRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "OrganizationMembership_organizationId_status_idx" ON "OrganizationMembership"("organizationId", "status");

-- CreateIndex
CREATE INDEX "OrganizationMembership_userId_status_idx" ON "OrganizationMembership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMembership_userId_organizationId_key" ON "OrganizationMembership"("userId", "organizationId");

-- CreateIndex
CREATE INDEX "Role_organizationId_idx" ON "Role"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_organizationId_name_key" ON "Role"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_resource_action_key" ON "Permission"("resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserRole_userId_roleId_key" ON "UserRole"("userId", "roleId");

-- CreateIndex
CREATE INDEX "Team_organizationId_idx" ON "Team"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_idx" ON "AuditLog"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "APIKey_keyHash_key" ON "APIKey"("keyHash");

-- CreateIndex
CREATE INDEX "APIKey_userId_idx" ON "APIKey"("userId");

-- CreateIndex
CREATE INDEX "APIKey_organizationId_idx" ON "APIKey"("organizationId");

-- CreateIndex
CREATE INDEX "AccessPolicy_organizationId_idx" ON "AccessPolicy"("organizationId");

-- CreateIndex
CREATE INDEX "AccessPolicy_resource_idx" ON "AccessPolicy"("resource");

-- CreateIndex
CREATE UNIQUE INDEX "EncryptionKey_organizationId_alias_key" ON "EncryptionKey"("organizationId", "alias");

-- CreateIndex
CREATE INDEX "Organization_industry_idx" ON "Organization"("industry");

-- CreateIndex
CREATE INDEX "Organization_country_idx" ON "Organization"("country");

-- CreateIndex
CREATE INDEX "BusinessUnit_organizationId_idx" ON "BusinessUnit"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessUnit_organizationId_code_key" ON "BusinessUnit"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Facility_organizationId_idx" ON "Facility"("organizationId");

-- CreateIndex
CREATE INDEX "Facility_businessUnitId_idx" ON "Facility"("businessUnitId");

-- CreateIndex
CREATE INDEX "Facility_country_idx" ON "Facility"("country");

-- CreateIndex
CREATE UNIQUE INDEX "Facility_organizationId_code_key" ON "Facility"("organizationId", "code");

-- CreateIndex
CREATE INDEX "Building_facilityId_idx" ON "Building"("facilityId");

-- CreateIndex
CREATE INDEX "ProductionLine_buildingId_idx" ON "ProductionLine"("buildingId");

-- CreateIndex
CREATE INDEX "Equipment_productionLineId_idx" ON "Equipment"("productionLineId");

-- CreateIndex
CREATE INDEX "Equipment_fuelTypeId_idx" ON "Equipment"("fuelTypeId");

-- CreateIndex
CREATE INDEX "EmissionSource_facilityId_idx" ON "EmissionSource"("facilityId");

-- CreateIndex
CREATE INDEX "EmissionSource_scope_idx" ON "EmissionSource"("scope");

-- CreateIndex
CREATE INDEX "EmissionSource_scope3Category_idx" ON "EmissionSource"("scope3Category");

-- CreateIndex
CREATE INDEX "Product_organizationId_idx" ON "Product"("organizationId");

-- CreateIndex
CREATE INDEX "Product_category_idx" ON "Product"("category");

-- CreateIndex
CREATE INDEX "RawMaterial_category_idx" ON "RawMaterial"("category");

-- CreateIndex
CREATE INDEX "Fuel_fuelTypeId_idx" ON "Fuel"("fuelTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "FuelType_name_key" ON "FuelType"("name");

-- CreateIndex
CREATE INDEX "Vehicle_type_idx" ON "Vehicle"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Refrigerant_name_key" ON "Refrigerant"("name");

-- CreateIndex
CREATE INDEX "Supplier_organizationId_idx" ON "Supplier"("organizationId");

-- CreateIndex
CREATE INDEX "Supplier_category_idx" ON "Supplier"("category");

-- CreateIndex
CREATE INDEX "LogisticsRoute_transportMode_idx" ON "LogisticsRoute"("transportMode");

-- CreateIndex
CREATE INDEX "EnergySource_type_idx" ON "EnergySource"("type");

-- CreateIndex
CREATE INDEX "ActivityData_organizationId_idx" ON "ActivityData"("organizationId");

-- CreateIndex
CREATE INDEX "ActivityData_scope_idx" ON "ActivityData"("scope");

-- CreateIndex
CREATE INDEX "ActivityData_reportingYear_idx" ON "ActivityData"("reportingYear");

-- CreateIndex
CREATE INDEX "ActivityData_facilityId_idx" ON "ActivityData"("facilityId");

-- CreateIndex
CREATE INDEX "ActivityDataEntry_activityDataId_idx" ON "ActivityDataEntry"("activityDataId");

-- CreateIndex
CREATE INDEX "ActivityDataEntry_emissionSourceId_idx" ON "ActivityDataEntry"("emissionSourceId");

-- CreateIndex
CREATE INDEX "ActivityDataEntry_startDate_endDate_idx" ON "ActivityDataEntry"("startDate", "endDate");

-- CreateIndex
CREATE INDEX "DataImportJob_organizationId_idx" ON "DataImportJob"("organizationId");

-- CreateIndex
CREATE INDEX "DataImportJob_status_idx" ON "DataImportJob"("status");

-- CreateIndex
CREATE INDEX "DataImportMapping_importJobId_idx" ON "DataImportMapping"("importJobId");

-- CreateIndex
CREATE INDEX "DataValidationRule_field_idx" ON "DataValidationRule"("field");

-- CreateIndex
CREATE UNIQUE INDEX "DataQualityScore_activityDataEntryId_key" ON "DataQualityScore"("activityDataEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "IoTDevice_deviceId_key" ON "IoTDevice"("deviceId");

-- CreateIndex
CREATE INDEX "IoTDevice_facilityId_idx" ON "IoTDevice"("facilityId");

-- CreateIndex
CREATE INDEX "IoTDevice_type_idx" ON "IoTDevice"("type");

-- CreateIndex
CREATE INDEX "IoTReading_deviceId_idx" ON "IoTReading"("deviceId");

-- CreateIndex
CREATE INDEX "IoTReading_timestamp_idx" ON "IoTReading"("timestamp");

-- CreateIndex
CREATE INDEX "MeterReading_facilityId_idx" ON "MeterReading"("facilityId");

-- CreateIndex
CREATE INDEX "MeterReading_meterNumber_idx" ON "MeterReading"("meterNumber");

-- CreateIndex
CREATE INDEX "MeterReading_readingDate_idx" ON "MeterReading"("readingDate");

-- CreateIndex
CREATE INDEX "EmissionCalculation_organizationId_idx" ON "EmissionCalculation"("organizationId");

-- CreateIndex
CREATE INDEX "EmissionCalculation_reportingYear_idx" ON "EmissionCalculation"("reportingYear");

-- CreateIndex
CREATE INDEX "EmissionCalculation_scope_idx" ON "EmissionCalculation"("scope");

-- CreateIndex
CREATE INDEX "EmissionCalculation_organizationId_reportingYear_status_idx" ON "EmissionCalculation"("organizationId", "reportingYear", "status");

-- CreateIndex
CREATE INDEX "EmissionCalculation_runId_idx" ON "EmissionCalculation"("runId");

-- CreateIndex
CREATE INDEX "EmissionResult_calculationId_idx" ON "EmissionResult"("calculationId");

-- CreateIndex
CREATE INDEX "EmissionResult_scope_idx" ON "EmissionResult"("scope");

-- CreateIndex
CREATE INDEX "EmissionResult_facilityId_idx" ON "EmissionResult"("facilityId");

-- CreateIndex
CREATE INDEX "EmissionResult_calculatedAt_idx" ON "EmissionResult"("calculatedAt");

-- CreateIndex
CREATE INDEX "EmissionAllocation_calculationId_idx" ON "EmissionAllocation"("calculationId");

-- CreateIndex
CREATE INDEX "EmissionAllocation_targetEntity_targetEntityId_idx" ON "EmissionAllocation"("targetEntity", "targetEntityId");

-- CreateIndex
CREATE UNIQUE INDEX "CalculationMethodology_name_version_key" ON "CalculationMethodology"("name", "version");

-- CreateIndex
CREATE INDEX "CalculationFormula_methodologyId_idx" ON "CalculationFormula"("methodologyId");

-- CreateIndex
CREATE UNIQUE INDEX "UncertaintyAnalysis_calculationId_key" ON "UncertaintyAnalysis"("calculationId");

-- CreateIndex
CREATE UNIQUE INDEX "Scope3CategoryConfig_category_key" ON "Scope3CategoryConfig"("category");

-- CreateIndex
CREATE INDEX "EmissionInventory_organizationId_idx" ON "EmissionInventory"("organizationId");

-- CreateIndex
CREATE INDEX "EmissionInventory_reportingYear_idx" ON "EmissionInventory"("reportingYear");

-- CreateIndex
CREATE UNIQUE INDEX "EmissionInventory_organizationId_reportingYear_key" ON "EmissionInventory"("organizationId", "reportingYear");

-- CreateIndex
CREATE INDEX "EmissionFactor_organizationId_idx" ON "EmissionFactor"("organizationId");

-- CreateIndex
CREATE INDEX "EmissionFactor_scope_idx" ON "EmissionFactor"("scope");

-- CreateIndex
CREATE INDEX "EmissionFactor_region_idx" ON "EmissionFactor"("region");

-- CreateIndex
CREATE INDEX "EmissionFactor_sector_idx" ON "EmissionFactor"("sector");

-- CreateIndex
CREATE INDEX "EmissionFactor_categoryId_idx" ON "EmissionFactor"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "EmissionFactorSource_name_key" ON "EmissionFactorSource"("name");

-- CreateIndex
CREATE INDEX "EmissionFactorVersion_sourceId_idx" ON "EmissionFactorVersion"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "EmissionFactorVersion_sourceId_version_key" ON "EmissionFactorVersion"("sourceId", "version");

-- CreateIndex
CREATE INDEX "EmissionFactorCategory_parentId_idx" ON "EmissionFactorCategory"("parentId");

-- CreateIndex
CREATE INDEX "UnitConversion_category_idx" ON "UnitConversion"("category");

-- CreateIndex
CREATE UNIQUE INDEX "UnitConversion_fromUnit_toUnit_key" ON "UnitConversion"("fromUnit", "toUnit");

-- CreateIndex
CREATE INDEX "EmissionFactorUpdate_effectiveDate_idx" ON "EmissionFactorUpdate"("effectiveDate");

-- CreateIndex
CREATE INDEX "AIAnalysis_organizationId_idx" ON "AIAnalysis"("organizationId");

-- CreateIndex
CREATE INDEX "AIAnalysis_type_idx" ON "AIAnalysis"("type");

-- CreateIndex
CREATE INDEX "AIAnalysis_status_idx" ON "AIAnalysis"("status");

-- CreateIndex
CREATE INDEX "AIRecommendation_analysisId_idx" ON "AIRecommendation"("analysisId");

-- CreateIndex
CREATE INDEX "AIRecommendation_category_idx" ON "AIRecommendation"("category");

-- CreateIndex
CREATE INDEX "AIRecommendation_priority_idx" ON "AIRecommendation"("priority");

-- CreateIndex
CREATE INDEX "AIPrediction_analysisId_idx" ON "AIPrediction"("analysisId");

-- CreateIndex
CREATE INDEX "AIPrediction_metric_idx" ON "AIPrediction"("metric");

-- CreateIndex
CREATE INDEX "AIPrediction_targetDate_idx" ON "AIPrediction"("targetDate");

-- CreateIndex
CREATE INDEX "AIModel_organizationId_idx" ON "AIModel"("organizationId");

-- CreateIndex
CREATE INDEX "AIModel_type_idx" ON "AIModel"("type");

-- CreateIndex
CREATE INDEX "AITrainingData_modelId_idx" ON "AITrainingData"("modelId");

-- CreateIndex
CREATE INDEX "AnomalyDetection_analysisId_idx" ON "AnomalyDetection"("analysisId");

-- CreateIndex
CREATE INDEX "AnomalyDetection_metric_idx" ON "AnomalyDetection"("metric");

-- CreateIndex
CREATE INDEX "AnomalyDetection_severity_idx" ON "AnomalyDetection"("severity");

-- CreateIndex
CREATE INDEX "AnomalyDetection_detectedAt_idx" ON "AnomalyDetection"("detectedAt");

-- CreateIndex
CREATE INDEX "DataGapAnalysis_analysisId_idx" ON "DataGapAnalysis"("analysisId");

-- CreateIndex
CREATE INDEX "DataGapAnalysis_dataCategory_idx" ON "DataGapAnalysis"("dataCategory");

-- CreateIndex
CREATE INDEX "DataGapAnalysis_severity_idx" ON "DataGapAnalysis"("severity");

-- CreateIndex
CREATE INDEX "AIConfidenceScore_analysisId_idx" ON "AIConfidenceScore"("analysisId");

-- CreateIndex
CREATE INDEX "AIConfidenceScore_metric_idx" ON "AIConfidenceScore"("metric");

-- CreateIndex
CREATE INDEX "DecarbonizationRoadmap_organizationId_idx" ON "DecarbonizationRoadmap"("organizationId");

-- CreateIndex
CREATE INDEX "DecarbonizationRoadmap_status_idx" ON "DecarbonizationRoadmap"("status");

-- CreateIndex
CREATE INDEX "RoadmapMilestone_roadmapId_idx" ON "RoadmapMilestone"("roadmapId");

-- CreateIndex
CREATE INDEX "RoadmapMilestone_targetYear_idx" ON "RoadmapMilestone"("targetYear");

-- CreateIndex
CREATE INDEX "RoadmapAction_roadmapId_idx" ON "RoadmapAction"("roadmapId");

-- CreateIndex
CREATE INDEX "RoadmapAction_milestoneId_idx" ON "RoadmapAction"("milestoneId");

-- CreateIndex
CREATE INDEX "RoadmapAction_category_idx" ON "RoadmapAction"("category");

-- CreateIndex
CREATE INDEX "RoadmapAction_status_idx" ON "RoadmapAction"("status");

-- CreateIndex
CREATE INDEX "AbatementTechnology_category_idx" ON "AbatementTechnology"("category");

-- CreateIndex
CREATE INDEX "MACCCurve_technologyId_idx" ON "MACCCurve"("technologyId");

-- CreateIndex
CREATE INDEX "MACCCurve_year_idx" ON "MACCCurve"("year");

-- CreateIndex
CREATE INDEX "InvestmentAnalysis_roadmapId_idx" ON "InvestmentAnalysis"("roadmapId");

-- CreateIndex
CREATE INDEX "Scenario_organizationId_idx" ON "Scenario"("organizationId");

-- CreateIndex
CREATE INDEX "Scenario_type_idx" ON "Scenario"("type");

-- CreateIndex
CREATE INDEX "ScenarioAssumption_scenarioId_idx" ON "ScenarioAssumption"("scenarioId");

-- CreateIndex
CREATE INDEX "ScenarioAssumption_parameter_idx" ON "ScenarioAssumption"("parameter");

-- CreateIndex
CREATE INDEX "ScenarioResult_scenarioId_idx" ON "ScenarioResult"("scenarioId");

-- CreateIndex
CREATE INDEX "ScenarioResult_year_idx" ON "ScenarioResult"("year");

-- CreateIndex
CREATE INDEX "ScenarioComparison_scenarioAId_idx" ON "ScenarioComparison"("scenarioAId");

-- CreateIndex
CREATE INDEX "ScenarioComparison_scenarioBId_idx" ON "ScenarioComparison"("scenarioBId");

-- CreateIndex
CREATE INDEX "CarbonBudget_organizationId_idx" ON "CarbonBudget"("organizationId");

-- CreateIndex
CREATE INDEX "TargetPathway_scenarioId_idx" ON "TargetPathway"("scenarioId");

-- CreateIndex
CREATE INDEX "TargetPathway_year_idx" ON "TargetPathway"("year");

-- CreateIndex
CREATE INDEX "MRVPlan_organizationId_idx" ON "MRVPlan"("organizationId");

-- CreateIndex
CREATE INDEX "MRVPlan_status_idx" ON "MRVPlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Measurement_meterReadingId_key" ON "Measurement"("meterReadingId");

-- CreateIndex
CREATE INDEX "Measurement_mrvPlanId_idx" ON "Measurement"("mrvPlanId");

-- CreateIndex
CREATE INDEX "Measurement_parameter_idx" ON "Measurement"("parameter");

-- CreateIndex
CREATE INDEX "Measurement_measuredAt_idx" ON "Measurement"("measuredAt");

-- CreateIndex
CREATE INDEX "Measurement_monitoringParameterId_idx" ON "Measurement"("monitoringParameterId");

-- CreateIndex
CREATE INDEX "Report_organizationId_idx" ON "Report"("organizationId");

-- CreateIndex
CREATE INDEX "Report_reportingYear_idx" ON "Report"("reportingYear");

-- CreateIndex
CREATE INDEX "Report_framework_idx" ON "Report"("framework");

-- CreateIndex
CREATE INDEX "ReportTemplate_framework_idx" ON "ReportTemplate"("framework");

-- CreateIndex
CREATE INDEX "ReportSection_reportId_idx" ON "ReportSection"("reportId");

-- CreateIndex
CREATE INDEX "ReportSection_templateId_idx" ON "ReportSection"("templateId");

-- CreateIndex
CREATE INDEX "ReportDataPoint_reportId_idx" ON "ReportDataPoint"("reportId");

-- CreateIndex
CREATE INDEX "ReportDataPoint_sectionId_idx" ON "ReportDataPoint"("sectionId");

-- CreateIndex
CREATE INDEX "ReportDataPoint_metric_idx" ON "ReportDataPoint"("metric");

-- CreateIndex
CREATE INDEX "MonitoringPlan_mrvPlanId_idx" ON "MonitoringPlan"("mrvPlanId");

-- CreateIndex
CREATE INDEX "MonitoringPlan_status_idx" ON "MonitoringPlan"("status");

-- CreateIndex
CREATE INDEX "MonitoringParameter_monitoringPlanId_idx" ON "MonitoringParameter"("monitoringPlanId");

-- CreateIndex
CREATE INDEX "MonitoringParameter_emissionSourceId_idx" ON "MonitoringParameter"("emissionSourceId");

-- CreateIndex
CREATE INDEX "VerificationEngagement_organizationId_idx" ON "VerificationEngagement"("organizationId");

-- CreateIndex
CREATE INDEX "VerificationEngagement_status_idx" ON "VerificationEngagement"("status");

-- CreateIndex
CREATE INDEX "VerificationScope_engagementId_idx" ON "VerificationScope"("engagementId");

-- CreateIndex
CREATE INDEX "AuditTrail_entityType_entityId_idx" ON "AuditTrail"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditTrail_timestamp_idx" ON "AuditTrail"("timestamp");

-- CreateIndex
CREATE INDEX "AuditTrail_performedBy_idx" ON "AuditTrail"("performedBy");

-- CreateIndex
CREATE INDEX "AuditTrail_organizationId_timestamp_idx" ON "AuditTrail"("organizationId", "timestamp");

-- CreateIndex
CREATE INDEX "ArchivedAuditTrail_entityType_entityId_idx" ON "ArchivedAuditTrail"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ArchivedAuditTrail_timestamp_idx" ON "ArchivedAuditTrail"("timestamp");

-- CreateIndex
CREATE INDEX "AuditEvidence_auditTrailId_idx" ON "AuditEvidence"("auditTrailId");

-- CreateIndex
CREATE INDEX "AuditEvidence_type_idx" ON "AuditEvidence"("type");

-- CreateIndex
CREATE INDEX "VerificationFinding_engagementId_idx" ON "VerificationFinding"("engagementId");

-- CreateIndex
CREATE INDEX "VerificationFinding_severity_idx" ON "VerificationFinding"("severity");

-- CreateIndex
CREATE INDEX "VerificationFinding_status_idx" ON "VerificationFinding"("status");

-- CreateIndex
CREATE INDEX "VerificationStatement_engagementId_idx" ON "VerificationStatement"("engagementId");

-- CreateIndex
CREATE INDEX "DigitalSignature_statementId_idx" ON "DigitalSignature"("statementId");

-- CreateIndex
CREATE INDEX "EvidencePackage_engagementId_idx" ON "EvidencePackage"("engagementId");

-- CreateIndex
CREATE INDEX "VersionHistory_entityType_entityId_idx" ON "VersionHistory"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "VersionHistory_version_idx" ON "VersionHistory"("version");

-- CreateIndex
CREATE UNIQUE INDEX "CarbonCredit_serialNumber_key" ON "CarbonCredit"("serialNumber");

-- CreateIndex
CREATE INDEX "CarbonCredit_organizationId_idx" ON "CarbonCredit"("organizationId");

-- CreateIndex
CREATE INDEX "CarbonCredit_status_idx" ON "CarbonCredit"("status");

-- CreateIndex
CREATE INDEX "CarbonCredit_vintage_idx" ON "CarbonCredit"("vintage");

-- CreateIndex
CREATE INDEX "CarbonCredit_registry_idx" ON "CarbonCredit"("registry");

-- CreateIndex
CREATE INDEX "CarbonOffset_creditId_idx" ON "CarbonOffset"("creditId");

-- CreateIndex
CREATE INDEX "CarbonOffset_offsetDate_idx" ON "CarbonOffset"("offsetDate");

-- CreateIndex
CREATE INDEX "CarbonPrice_market_idx" ON "CarbonPrice"("market");

-- CreateIndex
CREATE INDEX "CarbonPrice_priceDate_idx" ON "CarbonPrice"("priceDate");

-- CreateIndex
CREATE INDEX "InternalCarbonPrice_organizationId_idx" ON "InternalCarbonPrice"("organizationId");

-- CreateIndex
CREATE INDEX "InternalCarbonPrice_effectiveFrom_idx" ON "InternalCarbonPrice"("effectiveFrom");

-- CreateIndex
CREATE INDEX "ETSPosition_scheme_idx" ON "ETSPosition"("scheme");

-- CreateIndex
CREATE INDEX "ETSPosition_complianceYear_idx" ON "ETSPosition"("complianceYear");

-- CreateIndex
CREATE UNIQUE INDEX "RECertificate_certificateId_key" ON "RECertificate"("certificateId");

-- CreateIndex
CREATE INDEX "RECertificate_registry_idx" ON "RECertificate"("registry");

-- CreateIndex
CREATE INDEX "RECertificate_energySource_idx" ON "RECertificate"("energySource");

-- CreateIndex
CREATE INDEX "PPA_status_idx" ON "PPA"("status");

-- CreateIndex
CREATE INDEX "PPA_energySource_idx" ON "PPA"("energySource");

-- CreateIndex
CREATE INDEX "VoluntaryMarket_standard_idx" ON "VoluntaryMarket"("standard");

-- CreateIndex
CREATE INDEX "VoluntaryMarket_projectType_idx" ON "VoluntaryMarket"("projectType");

-- CreateIndex
CREATE INDEX "CarbonTrade_creditId_idx" ON "CarbonTrade"("creditId");

-- CreateIndex
CREATE INDEX "CarbonTrade_tradeDate_idx" ON "CarbonTrade"("tradeDate");

-- CreateIndex
CREATE INDEX "CarbonTrade_status_idx" ON "CarbonTrade"("status");

-- CreateIndex
CREATE UNIQUE INDEX "DisclosureFramework_code_version_key" ON "DisclosureFramework"("code", "version");

-- CreateIndex
CREATE INDEX "DisclosureRequirement_frameworkId_idx" ON "DisclosureRequirement"("frameworkId");

-- CreateIndex
CREATE INDEX "DisclosureRequirement_category_idx" ON "DisclosureRequirement"("category");

-- CreateIndex
CREATE INDEX "DisclosureResponse_requirementId_idx" ON "DisclosureResponse"("requirementId");

-- CreateIndex
CREATE INDEX "DisclosureResponse_reportId_idx" ON "DisclosureResponse"("reportId");

-- CreateIndex
CREATE INDEX "DisclosureResponse_status_idx" ON "DisclosureResponse"("status");

-- CreateIndex
CREATE INDEX "DisclosureReport_organizationId_idx" ON "DisclosureReport"("organizationId");

-- CreateIndex
CREATE INDEX "DisclosureReport_framework_idx" ON "DisclosureReport"("framework");

-- CreateIndex
CREATE INDEX "DisclosureReport_reportingYear_idx" ON "DisclosureReport"("reportingYear");

-- CreateIndex
CREATE INDEX "CDPResponse_reportId_idx" ON "CDPResponse"("reportId");

-- CreateIndex
CREATE INDEX "CDPResponse_category_idx" ON "CDPResponse"("category");

-- CreateIndex
CREATE UNIQUE INDEX "ISSBReport_reportId_key" ON "ISSBReport"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "CSRDReport_reportId_key" ON "CSRDReport"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "TCFDReport_reportId_key" ON "TCFDReport"("reportId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportGeneration_reportId_key" ON "ReportGeneration"("reportId");

-- CreateIndex
CREATE INDEX "RuleSet_organizationId_idx" ON "RuleSet"("organizationId");

-- CreateIndex
CREATE INDEX "RuleSet_category_idx" ON "RuleSet"("category");

-- CreateIndex
CREATE INDEX "Rule_ruleSetId_idx" ON "Rule"("ruleSetId");

-- CreateIndex
CREATE INDEX "Rule_type_idx" ON "Rule"("type");

-- CreateIndex
CREATE INDEX "RuleCondition_ruleId_idx" ON "RuleCondition"("ruleId");

-- CreateIndex
CREATE INDEX "RuleAction_ruleId_idx" ON "RuleAction"("ruleId");

-- CreateIndex
CREATE INDEX "RuleExecution_ruleId_idx" ON "RuleExecution"("ruleId");

-- CreateIndex
CREATE INDEX "RuleExecution_executedAt_idx" ON "RuleExecution"("executedAt");

-- CreateIndex
CREATE INDEX "RuleExecution_status_idx" ON "RuleExecution"("status");

-- CreateIndex
CREATE INDEX "RuleVersion_ruleId_idx" ON "RuleVersion"("ruleId");

-- CreateIndex
CREATE INDEX "RuleVersion_version_idx" ON "RuleVersion"("version");

-- CreateIndex
CREATE INDEX "CountryRegulation_countryCode_idx" ON "CountryRegulation"("countryCode");

-- CreateIndex
CREATE INDEX "CountryRegulation_type_idx" ON "CountryRegulation"("type");

-- CreateIndex
CREATE INDEX "IndustryStandard_sector_idx" ON "IndustryStandard"("sector");

-- CreateIndex
CREATE INDEX "IndustryStandard_code_idx" ON "IndustryStandard"("code");

-- CreateIndex
CREATE INDEX "DataLineageNode_graphId_idx" ON "DataLineageNode"("graphId");

-- CreateIndex
CREATE INDEX "DataLineageNode_type_idx" ON "DataLineageNode"("type");

-- CreateIndex
CREATE INDEX "DataLineageNode_entityType_entityId_idx" ON "DataLineageNode"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "DataLineageEdge_sourceNodeId_idx" ON "DataLineageEdge"("sourceNodeId");

-- CreateIndex
CREATE INDEX "DataLineageEdge_targetNodeId_idx" ON "DataLineageEdge"("targetNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "DataTransformation_edgeId_key" ON "DataTransformation"("edgeId");

-- CreateIndex
CREATE INDEX "DataSource_type_idx" ON "DataSource"("type");

-- CreateIndex
CREATE INDEX "DataSource_organizationId_idx" ON "DataSource"("organizationId");

-- CreateIndex
CREATE INDEX "DataVersion_dataSourceId_idx" ON "DataVersion"("dataSourceId");

-- CreateIndex
CREATE INDEX "DataVersion_version_idx" ON "DataVersion"("version");

-- CreateIndex
CREATE INDEX "LineageGraph_entityType_entityId_idx" ON "LineageGraph"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AIExplanation_analysisId_idx" ON "AIExplanation"("analysisId");

-- CreateIndex
CREATE INDEX "AIExplanation_entityType_entityId_idx" ON "AIExplanation"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ExplanationStep_explanationId_idx" ON "ExplanationStep"("explanationId");

-- CreateIndex
CREATE INDEX "ExplanationStep_stepNumber_idx" ON "ExplanationStep"("stepNumber");

-- CreateIndex
CREATE INDEX "AssumptionLog_explanationId_idx" ON "AssumptionLog"("explanationId");

-- CreateIndex
CREATE INDEX "AssumptionLog_category_idx" ON "AssumptionLog"("category");

-- CreateIndex
CREATE INDEX "CalculationTrace_explanationId_idx" ON "CalculationTrace"("explanationId");

-- CreateIndex
CREATE INDEX "ConfidenceBreakdown_explanationId_idx" ON "ConfidenceBreakdown"("explanationId");

-- CreateIndex
CREATE INDEX "EvidenceLink_explanationId_idx" ON "EvidenceLink"("explanationId");

-- CreateIndex
CREATE INDEX "EvidenceLink_type_idx" ON "EvidenceLink"("type");

-- CreateIndex
CREATE INDEX "Agent_organizationId_idx" ON "Agent"("organizationId");

-- CreateIndex
CREATE INDEX "Agent_type_idx" ON "Agent"("type");

-- CreateIndex
CREATE INDEX "Agent_status_idx" ON "Agent"("status");

-- CreateIndex
CREATE INDEX "AgentTask_agentId_idx" ON "AgentTask"("agentId");

-- CreateIndex
CREATE INDEX "AgentTask_status_idx" ON "AgentTask"("status");

-- CreateIndex
CREATE INDEX "AgentTask_scheduledAt_idx" ON "AgentTask"("scheduledAt");

-- CreateIndex
CREATE INDEX "AgentExecution_agentId_idx" ON "AgentExecution"("agentId");

-- CreateIndex
CREATE INDEX "AgentExecution_taskId_idx" ON "AgentExecution"("taskId");

-- CreateIndex
CREATE INDEX "AgentExecution_status_idx" ON "AgentExecution"("status");

-- CreateIndex
CREATE INDEX "AgentExecution_startedAt_idx" ON "AgentExecution"("startedAt");

-- CreateIndex
CREATE INDEX "AgentTool_agentId_idx" ON "AgentTool"("agentId");

-- CreateIndex
CREATE INDEX "AgentTool_type_idx" ON "AgentTool"("type");

-- CreateIndex
CREATE INDEX "MCPServer_status_idx" ON "MCPServer"("status");

-- CreateIndex
CREATE INDEX "MCPConnection_agentId_idx" ON "MCPConnection"("agentId");

-- CreateIndex
CREATE INDEX "MCPConnection_serverId_idx" ON "MCPConnection"("serverId");

-- CreateIndex
CREATE UNIQUE INDEX "MCPConnection_agentId_serverId_key" ON "MCPConnection"("agentId", "serverId");

-- CreateIndex
CREATE INDEX "AgentConversation_agentId_idx" ON "AgentConversation"("agentId");

-- CreateIndex
CREATE INDEX "AgentConversation_userId_idx" ON "AgentConversation"("userId");

-- CreateIndex
CREATE INDEX "AgentMessage_conversationId_idx" ON "AgentMessage"("conversationId");

-- CreateIndex
CREATE INDEX "AgentMessage_createdAt_idx" ON "AgentMessage"("createdAt");

-- CreateIndex
CREATE INDEX "ScienceBasedTarget_organizationId_idx" ON "ScienceBasedTarget"("organizationId");

-- CreateIndex
CREATE INDEX "ScienceBasedTarget_status_idx" ON "ScienceBasedTarget"("status");

-- CreateIndex
CREATE INDEX "ScienceBasedTarget_boundary_idx" ON "ScienceBasedTarget"("boundary");

-- CreateIndex
CREATE UNIQUE INDEX "TargetType_code_key" ON "TargetType"("code");

-- CreateIndex
CREATE INDEX "TargetProgress_targetId_idx" ON "TargetProgress"("targetId");

-- CreateIndex
CREATE INDEX "TargetProgress_year_idx" ON "TargetProgress"("year");

-- CreateIndex
CREATE UNIQUE INDEX "TargetProgress_targetId_year_key" ON "TargetProgress"("targetId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "NetZeroCommitment_targetId_key" ON "NetZeroCommitment"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "FLAGTarget_targetId_key" ON "FLAGTarget"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "BaselineYear_targetId_key" ON "BaselineYear"("targetId");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_organizationId_idx" ON "Notification"("organizationId");

-- CreateIndex
CREATE INDEX "Notification_isRead_idx" ON "Notification"("isRead");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationPreference_userId_idx" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_channel_eventType_key" ON "NotificationPreference"("userId", "channel", "eventType");

-- CreateIndex
CREATE INDEX "Workflow_organizationId_idx" ON "Workflow"("organizationId");

-- CreateIndex
CREATE INDEX "Workflow_type_idx" ON "Workflow"("type");

-- CreateIndex
CREATE INDEX "Workflow_status_idx" ON "Workflow"("status");

-- CreateIndex
CREATE INDEX "WorkflowStep_workflowId_idx" ON "WorkflowStep"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowExecution_workflowId_idx" ON "WorkflowExecution"("workflowId");

-- CreateIndex
CREATE INDEX "WorkflowExecution_status_idx" ON "WorkflowExecution"("status");

-- CreateIndex
CREATE INDEX "Approval_approverId_idx" ON "Approval"("approverId");

-- CreateIndex
CREATE INDEX "Approval_stepId_idx" ON "Approval"("stepId");

-- CreateIndex
CREATE INDEX "Approval_executionId_idx" ON "Approval"("executionId");

-- CreateIndex
CREATE INDEX "Approval_status_idx" ON "Approval"("status");

-- CreateIndex
CREATE INDEX "TrialRequest_status_idx" ON "TrialRequest"("status");

-- CreateIndex
CREATE INDEX "TrialRequest_createdAt_idx" ON "TrialRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMembership" ADD CONSTRAINT "OrganizationMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "APIKey" ADD CONSTRAINT "APIKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "APIKey" ADD CONSTRAINT "APIKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessPolicy" ADD CONSTRAINT "AccessPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EncryptionKey" ADD CONSTRAINT "EncryptionKey_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessUnit" ADD CONSTRAINT "BusinessUnit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionLine" ADD CONSTRAINT "ProductionLine_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_productionLineId_fkey" FOREIGN KEY ("productionLineId") REFERENCES "ProductionLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_refrigerantId_fkey" FOREIGN KEY ("refrigerantId") REFERENCES "Refrigerant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionSource" ADD CONSTRAINT "EmissionSource_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionSource" ADD CONSTRAINT "EmissionSource_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionSource" ADD CONSTRAINT "EmissionSource_productionLineId_fkey" FOREIGN KEY ("productionLineId") REFERENCES "ProductionLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionSource" ADD CONSTRAINT "EmissionSource_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fuel" ADD CONSTRAINT "Fuel_fuelTypeId_fkey" FOREIGN KEY ("fuelTypeId") REFERENCES "FuelType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityData" ADD CONSTRAINT "ActivityData_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityData" ADD CONSTRAINT "ActivityData_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityData" ADD CONSTRAINT "ActivityData_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_activityDataId_fkey" FOREIGN KEY ("activityDataId") REFERENCES "ActivityData"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_emissionSourceId_fkey" FOREIGN KEY ("emissionSourceId") REFERENCES "EmissionSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_fuelId_fkey" FOREIGN KEY ("fuelId") REFERENCES "Fuel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_refrigerantId_fkey" FOREIGN KEY ("refrigerantId") REFERENCES "Refrigerant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_rawMaterialId_fkey" FOREIGN KEY ("rawMaterialId") REFERENCES "RawMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_logisticsRouteId_fkey" FOREIGN KEY ("logisticsRouteId") REFERENCES "LogisticsRoute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_energySourceId_fkey" FOREIGN KEY ("energySourceId") REFERENCES "EnergySource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_wasteTypeId_fkey" FOREIGN KEY ("wasteTypeId") REFERENCES "WasteType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityDataEntry" ADD CONSTRAINT "ActivityDataEntry_waterSourceId_fkey" FOREIGN KEY ("waterSourceId") REFERENCES "WaterSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataImportJob" ADD CONSTRAINT "DataImportJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataImportMapping" ADD CONSTRAINT "DataImportMapping_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "DataImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataQualityScore" ADD CONSTRAINT "DataQualityScore_activityDataEntryId_fkey" FOREIGN KEY ("activityDataEntryId") REFERENCES "ActivityDataEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IoTDevice" ADD CONSTRAINT "IoTDevice_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IoTReading" ADD CONSTRAINT "IoTReading_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "IoTDevice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeterReading" ADD CONSTRAINT "MeterReading_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionCalculation" ADD CONSTRAINT "EmissionCalculation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionCalculation" ADD CONSTRAINT "EmissionCalculation_methodologyId_fkey" FOREIGN KEY ("methodologyId") REFERENCES "CalculationMethodology"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionResult" ADD CONSTRAINT "EmissionResult_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "EmissionCalculation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionResult" ADD CONSTRAINT "EmissionResult_emissionSourceId_fkey" FOREIGN KEY ("emissionSourceId") REFERENCES "EmissionSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionResult" ADD CONSTRAINT "EmissionResult_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionResult" ADD CONSTRAINT "EmissionResult_businessUnitId_fkey" FOREIGN KEY ("businessUnitId") REFERENCES "BusinessUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionResult" ADD CONSTRAINT "EmissionResult_emissionFactorId_fkey" FOREIGN KEY ("emissionFactorId") REFERENCES "EmissionFactor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionResult" ADD CONSTRAINT "EmissionResult_activityDataEntryId_fkey" FOREIGN KEY ("activityDataEntryId") REFERENCES "ActivityDataEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionAllocation" ADD CONSTRAINT "EmissionAllocation_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "EmissionCalculation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionAllocation" ADD CONSTRAINT "EmissionAllocation_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "EmissionResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculationFormula" ADD CONSTRAINT "CalculationFormula_methodologyId_fkey" FOREIGN KEY ("methodologyId") REFERENCES "CalculationMethodology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UncertaintyAnalysis" ADD CONSTRAINT "UncertaintyAnalysis_calculationId_fkey" FOREIGN KEY ("calculationId") REFERENCES "EmissionCalculation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionInventory" ADD CONSTRAINT "EmissionInventory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionFactor" ADD CONSTRAINT "EmissionFactor_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionFactor" ADD CONSTRAINT "EmissionFactor_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EmissionFactorSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionFactor" ADD CONSTRAINT "EmissionFactor_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "EmissionFactorCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionFactor" ADD CONSTRAINT "EmissionFactor_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "EmissionFactorVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionFactorEmbedding" ADD CONSTRAINT "EmissionFactorEmbedding_emissionFactorId_fkey" FOREIGN KEY ("emissionFactorId") REFERENCES "EmissionFactor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionFactorVersion" ADD CONSTRAINT "EmissionFactorVersion_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "EmissionFactorSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmissionFactorCategory" ADD CONSTRAINT "EmissionFactorCategory_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EmissionFactorCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIAnalysis" ADD CONSTRAINT "AIAnalysis_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AIModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIRecommendation" ADD CONSTRAINT "AIRecommendation_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AIAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIPrediction" ADD CONSTRAINT "AIPrediction_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AIAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIModel" ADD CONSTRAINT "AIModel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AITrainingData" ADD CONSTRAINT "AITrainingData_modelId_fkey" FOREIGN KEY ("modelId") REFERENCES "AIModel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnomalyDetection" ADD CONSTRAINT "AnomalyDetection_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AIAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataGapAnalysis" ADD CONSTRAINT "DataGapAnalysis_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AIAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConfidenceScore" ADD CONSTRAINT "AIConfidenceScore_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AIAnalysis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecarbonizationRoadmap" ADD CONSTRAINT "DecarbonizationRoadmap_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapMilestone" ADD CONSTRAINT "RoadmapMilestone_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "DecarbonizationRoadmap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapAction" ADD CONSTRAINT "RoadmapAction_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "DecarbonizationRoadmap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapAction" ADD CONSTRAINT "RoadmapAction_milestoneId_fkey" FOREIGN KEY ("milestoneId") REFERENCES "RoadmapMilestone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoadmapAction" ADD CONSTRAINT "RoadmapAction_technologyId_fkey" FOREIGN KEY ("technologyId") REFERENCES "AbatementTechnology"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MACCCurve" ADD CONSTRAINT "MACCCurve_technologyId_fkey" FOREIGN KEY ("technologyId") REFERENCES "AbatementTechnology"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvestmentAnalysis" ADD CONSTRAINT "InvestmentAnalysis_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "DecarbonizationRoadmap"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioAssumption" ADD CONSTRAINT "ScenarioAssumption_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioResult" ADD CONSTRAINT "ScenarioResult_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioComparison" ADD CONSTRAINT "ScenarioComparison_scenarioAId_fkey" FOREIGN KEY ("scenarioAId") REFERENCES "Scenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioComparison" ADD CONSTRAINT "ScenarioComparison_scenarioBId_fkey" FOREIGN KEY ("scenarioBId") REFERENCES "Scenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarbonBudget" ADD CONSTRAINT "CarbonBudget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetPathway" ADD CONSTRAINT "TargetPathway_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MRVPlan" ADD CONSTRAINT "MRVPlan_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_mrvPlanId_fkey" FOREIGN KEY ("mrvPlanId") REFERENCES "MRVPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_monitoringParameterId_fkey" FOREIGN KEY ("monitoringParameterId") REFERENCES "MonitoringParameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Measurement" ADD CONSTRAINT "Measurement_meterReadingId_fkey" FOREIGN KEY ("meterReadingId") REFERENCES "MeterReading"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Report" ADD CONSTRAINT "Report_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSection" ADD CONSTRAINT "ReportSection_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportSection" ADD CONSTRAINT "ReportSection_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDataPoint" ADD CONSTRAINT "ReportDataPoint_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "Report"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportDataPoint" ADD CONSTRAINT "ReportDataPoint_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "ReportSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringPlan" ADD CONSTRAINT "MonitoringPlan_mrvPlanId_fkey" FOREIGN KEY ("mrvPlanId") REFERENCES "MRVPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringParameter" ADD CONSTRAINT "MonitoringParameter_monitoringPlanId_fkey" FOREIGN KEY ("monitoringPlanId") REFERENCES "MonitoringPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringParameter" ADD CONSTRAINT "MonitoringParameter_emissionSourceId_fkey" FOREIGN KEY ("emissionSourceId") REFERENCES "EmissionSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationEngagement" ADD CONSTRAINT "VerificationEngagement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationScope" ADD CONSTRAINT "VerificationScope_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "VerificationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditEvidence" ADD CONSTRAINT "AuditEvidence_auditTrailId_fkey" FOREIGN KEY ("auditTrailId") REFERENCES "AuditTrail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationFinding" ADD CONSTRAINT "VerificationFinding_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "VerificationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationFinding" ADD CONSTRAINT "VerificationFinding_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationStatement" ADD CONSTRAINT "VerificationStatement_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "VerificationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalSignature" ADD CONSTRAINT "DigitalSignature_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "VerificationStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidencePackage" ADD CONSTRAINT "EvidencePackage_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "VerificationEngagement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarbonCredit" ADD CONSTRAINT "CarbonCredit_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarbonOffset" ADD CONSTRAINT "CarbonOffset_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "CarbonCredit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InternalCarbonPrice" ADD CONSTRAINT "InternalCarbonPrice_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CarbonTrade" ADD CONSTRAINT "CarbonTrade_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "CarbonCredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureRequirement" ADD CONSTRAINT "DisclosureRequirement_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "DisclosureFramework"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureResponse" ADD CONSTRAINT "DisclosureResponse_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "DisclosureRequirement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureResponse" ADD CONSTRAINT "DisclosureResponse_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DisclosureReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureReport" ADD CONSTRAINT "DisclosureReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisclosureReport" ADD CONSTRAINT "DisclosureReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CDPResponse" ADD CONSTRAINT "CDPResponse_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DisclosureReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ISSBReport" ADD CONSTRAINT "ISSBReport_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DisclosureReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CSRDReport" ADD CONSTRAINT "CSRDReport_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DisclosureReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TCFDReport" ADD CONSTRAINT "TCFDReport_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DisclosureReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportGeneration" ADD CONSTRAINT "ReportGeneration_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "DisclosureReport"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSet" ADD CONSTRAINT "RuleSet_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rule" ADD CONSTRAINT "Rule_ruleSetId_fkey" FOREIGN KEY ("ruleSetId") REFERENCES "RuleSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleCondition" ADD CONSTRAINT "RuleCondition_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleAction" ADD CONSTRAINT "RuleAction_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleExecution" ADD CONSTRAINT "RuleExecution_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleVersion" ADD CONSTRAINT "RuleVersion_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "Rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataLineageNode" ADD CONSTRAINT "DataLineageNode_graphId_fkey" FOREIGN KEY ("graphId") REFERENCES "LineageGraph"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataLineageEdge" ADD CONSTRAINT "DataLineageEdge_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "DataLineageNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataLineageEdge" ADD CONSTRAINT "DataLineageEdge_targetNodeId_fkey" FOREIGN KEY ("targetNodeId") REFERENCES "DataLineageNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataTransformation" ADD CONSTRAINT "DataTransformation_edgeId_fkey" FOREIGN KEY ("edgeId") REFERENCES "DataLineageEdge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DataVersion" ADD CONSTRAINT "DataVersion_dataSourceId_fkey" FOREIGN KEY ("dataSourceId") REFERENCES "DataSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExplanation" ADD CONSTRAINT "AIExplanation_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "AIAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExplanationStep" ADD CONSTRAINT "ExplanationStep_explanationId_fkey" FOREIGN KEY ("explanationId") REFERENCES "AIExplanation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssumptionLog" ADD CONSTRAINT "AssumptionLog_explanationId_fkey" FOREIGN KEY ("explanationId") REFERENCES "AIExplanation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalculationTrace" ADD CONSTRAINT "CalculationTrace_explanationId_fkey" FOREIGN KEY ("explanationId") REFERENCES "AIExplanation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConfidenceBreakdown" ADD CONSTRAINT "ConfidenceBreakdown_explanationId_fkey" FOREIGN KEY ("explanationId") REFERENCES "AIExplanation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceLink" ADD CONSTRAINT "EvidenceLink_explanationId_fkey" FOREIGN KEY ("explanationId") REFERENCES "AIExplanation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentExecution" ADD CONSTRAINT "AgentExecution_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "AgentTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentTool" ADD CONSTRAINT "AgentTool_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MCPConnection" ADD CONSTRAINT "MCPConnection_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MCPConnection" ADD CONSTRAINT "MCPConnection_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MCPServer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentConversation" ADD CONSTRAINT "AgentConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AgentConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceBasedTarget" ADD CONSTRAINT "ScienceBasedTarget_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScienceBasedTarget" ADD CONSTRAINT "ScienceBasedTarget_targetTypeId_fkey" FOREIGN KEY ("targetTypeId") REFERENCES "TargetType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TargetProgress" ADD CONSTRAINT "TargetProgress_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ScienceBasedTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetZeroCommitment" ADD CONSTRAINT "NetZeroCommitment_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ScienceBasedTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FLAGTarget" ADD CONSTRAINT "FLAGTarget_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ScienceBasedTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaselineYear" ADD CONSTRAINT "BaselineYear_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "ScienceBasedTarget"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowStep" ADD CONSTRAINT "WorkflowStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowExecution" ADD CONSTRAINT "WorkflowExecution_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkflowStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_executionId_fkey" FOREIGN KEY ("executionId") REFERENCES "WorkflowExecution"("id") ON DELETE SET NULL ON UPDATE CASCADE;

