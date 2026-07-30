"use client";

/**
 * Ten master-data collections in one tabbed view.
 *
 * Each tab is the same generic `DataTable` over a different column set, plus the
 * create form for that collection. The bundle arrives from one `getMasterData()`
 * read, so switching tabs costs nothing.
 */

import * as React from "react";
import { Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type ColumnDef } from "@/components/shared/data-table";
import { ActionForm, type ActionFormField } from "@/components/shared/form/action-form";
import type { ActionState } from "@/lib/actions/types";
import type { MasterDataBundle } from "@/lib/data/repositories/master-data";
import { formatNumber } from "@/lib/format";

type CreateAction = (input: unknown) => Promise<ActionState<{ readonly id: string }>>;

export type MasterDataActions = {
  readonly createProduct: CreateAction;
  readonly createRawMaterial: CreateAction;
  readonly createFuel: CreateAction;
  readonly createVehicle: CreateAction;
  readonly createRefrigerant: CreateAction;
  readonly createSupplier: CreateAction;
  readonly createLogisticsRoute: CreateAction;
  readonly createEnergySource: CreateAction;
  readonly createWasteType: CreateAction;
  readonly createWaterSource: CreateAction;
};

export type MasterDataTabsProps = {
  readonly organizationId: string;
  readonly bundle: MasterDataBundle;
  readonly actions: MasterDataActions;
  readonly fuelCategories: readonly string[];
  readonly vehicleTypes: readonly string[];
  readonly energyTypes: readonly string[];
  readonly units: readonly string[];
};

/**
 * Column helpers bound to a row type.
 *
 * A free generic function cannot infer its row type from inside a `columns={[…]}`
 * array literal, so each collection instantiates its own tiny builder. That also
 * keeps the accessors type-checked against the repository's row shape.
 */
function columnsFor<T>() {
  return {
    text: (id: string, header: string, get: (row: T) => string): ColumnDef<T, unknown> => ({
      id,
      header,
      accessorFn: (row) => get(row),
    }),
    number: (
      id: string,
      header: string,
      get: (row: T) => number,
      decimals = 2,
    ): ColumnDef<T, unknown> => ({
      id,
      header,
      accessorFn: (row) => get(row),
      cell: ({ row }) => (
        <span className="font-mono text-xs">{formatNumber(get(row.original), decimals)}</span>
      ),
    }),
    bool: (id: string, header: string, get: (row: T) => boolean): ColumnDef<T, unknown> => ({
      id,
      header,
      accessorFn: (row) => (get(row) ? "yes" : "no"),
      cell: ({ row }) => (
        <Badge variant={get(row.original) ? "secondary" : "outline"}>
          {get(row.original) ? "yes" : "no"}
        </Badge>
      ),
    }),
  };
}

function CreateDialog({
  label,
  action,
  fields,
  hidden,
}: {
  readonly label: string;
  readonly action: CreateAction;
  readonly fields: readonly ActionFormField[];
  readonly hidden?: Readonly<Record<string, string | number | boolean | null>>;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Plus className="size-4" />
            {label}
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Validated by the item-27 zod schema before anything is written.
          </DialogDescription>
        </DialogHeader>
        <ActionForm action={action} hidden={hidden} fields={fields} submitLabel={label} />
      </DialogContent>
    </Dialog>
  );
}

export function MasterDataTabs({
  organizationId,
  bundle,
  actions,
  fuelCategories,
  vehicleTypes,
  energyTypes,
  units,
}: MasterDataTabsProps) {
  const unitOptions = units.map((unit) => ({ value: unit, label: unit }));

  const product = columnsFor<MasterDataBundle["products"][number]>();
  const rawMaterial = columnsFor<MasterDataBundle["rawMaterials"][number]>();
  const fuel = columnsFor<MasterDataBundle["fuels"][number]>();
  const fuelType = columnsFor<MasterDataBundle["fuelTypes"][number]>();
  const vehicle = columnsFor<MasterDataBundle["vehicles"][number]>();
  const refrigerant = columnsFor<MasterDataBundle["refrigerants"][number]>();
  const supplier = columnsFor<MasterDataBundle["suppliers"][number]>();
  const route = columnsFor<MasterDataBundle["logisticsRoutes"][number]>();
  const energy = columnsFor<MasterDataBundle["energySources"][number]>();
  const waste = columnsFor<MasterDataBundle["wasteTypes"][number]>();
  const water = columnsFor<MasterDataBundle["waterSources"][number]>();

  const tabs = [
    {
      value: "products",
      label: `Products (${bundle.products.length})`,
      table: (
        <DataTable
          id="products-table"
          data={bundle.products}
          searchPlaceholder="Filter products…"
          columns={[
            product.text("name", "Name", (row) => row.name),
            product.text("sku", "SKU", (row) => row.sku),
            product.text("category", "Category", (row) => row.category),
            product.text("unit", "Unit", (row) => row.unit),
            product.number("weight", "Weight", (row) => row.weight, 3),
            product.text("weightUnit", "Weight unit", (row) => row.weightUnit),
            product.text("lifecycleStage", "Lifecycle stage", (row) => row.lifecycleStage),
            product.bool("isActive", "Active", (row) => row.isActive),
          ]}
        />
      ),
      create: (
        <CreateDialog
          label="Add product"
          action={actions.createProduct}
          hidden={{ organizationId }}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "sku", label: "SKU" },
            { name: "category", label: "Category" },
            { name: "unit", label: "Unit", type: "select", options: unitOptions },
            { name: "weight", label: "Weight", type: "number", step: "any" },
            { name: "weightUnit", label: "Weight unit", type: "select", options: unitOptions },
            { name: "lifecycleStage", label: "Lifecycle stage" },
          ]}
        />
      ),
    },
    {
      value: "raw-materials",
      label: `Raw materials (${bundle.rawMaterials.length})`,
      table: (
        <DataTable
          id="raw-materials-table"
          data={bundle.rawMaterials}
          searchPlaceholder="Filter raw materials…"
          columns={[
            rawMaterial.text("name", "Name", (row) => row.name),
            rawMaterial.text("category", "Category", (row) => row.category),
            rawMaterial.text("unit", "Unit", (row) => row.unit),
            rawMaterial.number("emissionIntensity", "kgCO2e per unit", (row) => row.emissionIntensity, 3),
            rawMaterial.text("sourceRegion", "Source region", (row) => row.sourceRegion),
            rawMaterial.bool("isRecycled", "Recycled", (row) => row.isRecycled),
            rawMaterial.number("recycledContent", "Recycled %", (row) => row.recycledContent, 0),
          ]}
        />
      ),
      create: (
        <CreateDialog
          label="Add raw material"
          action={actions.createRawMaterial}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "category", label: "Category" },
            { name: "unit", label: "Unit", type: "select", options: unitOptions },
            {
              name: "emissionIntensity",
              label: "Emission intensity (kgCO2e/unit)",
              type: "number",
              step: "any",
            },
            { name: "sourceRegion", label: "Source region" },
            { name: "isRecycled", label: "Recycled", type: "checkbox" },
            { name: "recycledContent", label: "Recycled content (%)", type: "number" },
          ]}
        />
      ),
    },
    {
      value: "fuels",
      label: `Fuels (${bundle.fuels.length})`,
      table: (
        <DataTable
          id="fuels-table"
          data={bundle.fuels}
          searchPlaceholder="Filter fuels…"
          columns={[
            fuel.text("name", "Name", (row) => row.name),
            fuel.text("unit", "Unit", (row) => row.unit),
            fuel.number("netCalorific", "NCV", (row) => row.netCalorific, 4),
            fuel.number("grossCalorific", "GCV", (row) => row.grossCalorific, 4),
            fuel.number("carbonContent", "Carbon content", (row) => row.carbonContent, 4),
            fuel.bool("isRenewable", "Renewable", (row) => row.isRenewable),
          ]}
        />
      ),
      create: (
        <CreateDialog
          label="Add fuel"
          action={actions.createFuel}
          fields={[
            {
              name: "fuelTypeId",
              label: "Fuel type",
              type: "select",
              required: true,
              options: bundle.fuelTypes.map((type) => ({ value: type.id, label: type.name })),
            },
            { name: "name", label: "Name", required: true },
            { name: "unit", label: "Unit", type: "select", options: unitOptions, required: true },
            { name: "netCalorific", label: "Net calorific value", type: "number", step: "any" },
            { name: "grossCalorific", label: "Gross calorific value", type: "number", step: "any" },
            { name: "carbonContent", label: "Carbon content", type: "number", step: "any" },
            { name: "density", label: "Density", type: "number", step: "any" },
            { name: "isRenewable", label: "Renewable", type: "checkbox" },
          ]}
        />
      ),
    },
    {
      value: "fuel-types",
      label: `Fuel types (${bundle.fuelTypes.length})`,
      table: (
        <DataTable
          id="fuel-types-table"
          data={bundle.fuelTypes}
          searchPlaceholder="Filter fuel types…"
          columns={[
            fuelType.text("name", "Name", (row) => row.name),
            fuelType.text("category", "Category", (row) => row.category),
            fuelType.text("description", "Description", (row) => row.description),
          ]}
        />
      ),
      create: null,
    },
    {
      value: "vehicles",
      label: `Vehicles (${bundle.vehicles.length})`,
      table: (
        <DataTable
          id="vehicles-table"
          data={bundle.vehicles}
          searchPlaceholder="Filter vehicles…"
          columns={[
            vehicle.text("name", "Name", (row) => row.name),
            vehicle.text("type", "Type", (row) => row.type),
            vehicle.text("fuelType", "Fuel", (row) => row.fuelType),
            vehicle.text("make", "Make", (row) => row.make),
            vehicle.text("model", "Model", (row) => row.model),
            vehicle.number("efficiency", "Efficiency", (row) => row.efficiency, 2),
            vehicle.text("efficiencyUnit", "Efficiency unit", (row) => row.efficiencyUnit),
            vehicle.bool("isOwned", "Owned", (row) => row.isOwned),
          ]}
        />
      ),
      create: (
        <CreateDialog
          label="Add vehicle"
          action={actions.createVehicle}
          fields={[
            { name: "name", label: "Name", required: true },
            {
              name: "type",
              label: "Type",
              type: "select",
              required: true,
              options: vehicleTypes.map((type) => ({ value: type, label: type })),
            },
            { name: "fuelType", label: "Fuel" },
            { name: "make", label: "Make" },
            { name: "model", label: "Model" },
            { name: "year", label: "Year", type: "number" },
            { name: "efficiency", label: "Efficiency", type: "number", step: "any" },
            { name: "efficiencyUnit", label: "Efficiency unit", placeholder: "km/L" },
            { name: "isOwned", label: "Owned", type: "checkbox", defaultValue: true },
          ]}
        />
      ),
    },
    {
      value: "refrigerants",
      label: `Refrigerants (${bundle.refrigerants.length})`,
      table: (
        <DataTable
          id="refrigerants-table"
          data={bundle.refrigerants}
          searchPlaceholder="Filter refrigerants…"
          columns={[
            refrigerant.text("name", "Name", (row) => row.name),
            refrigerant.text("chemicalFormula", "Formula", (row) => row.chemicalFormula),
            refrigerant.number("gwp100", "GWP-100", (row) => row.gwp100, 0),
            refrigerant.number("odp", "ODP", (row) => row.ozoneDepletionPotential, 3),
            refrigerant.text("category", "Category", (row) => row.category),
          ]}
        />
      ),
      create: (
        <CreateDialog
          label="Add refrigerant"
          action={actions.createRefrigerant}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "chemicalFormula", label: "Chemical formula" },
            { name: "gwp100", label: "GWP-100", type: "number", step: "any", required: true },
            {
              name: "ozoneDepletionPotential",
              label: "Ozone depletion potential",
              type: "number",
              step: "any",
            },
            { name: "category", label: "Category" },
          ]}
        />
      ),
    },
    {
      value: "suppliers",
      label: `Suppliers (${bundle.suppliers.length})`,
      table: (
        <DataTable
          id="suppliers-table"
          data={bundle.suppliers}
          searchPlaceholder="Filter suppliers…"
          columns={[
            supplier.text("name", "Name", (row) => row.name),
            supplier.text("code", "Code", (row) => row.code),
            supplier.text("category", "Category", (row) => row.category),
            supplier.text("country", "Country", (row) => row.country),
            supplier.number("tier", "Tier", (row) => row.tier, 0),
            supplier.text("sustainabilityRating", "Rating", (row) => row.sustainabilityRating),
            supplier.bool("isActive", "Active", (row) => row.isActive),
          ]}
        />
      ),
      create: (
        <CreateDialog
          label="Add supplier"
          action={actions.createSupplier}
          hidden={{ organizationId }}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "code", label: "Code" },
            { name: "category", label: "Category" },
            { name: "country", label: "Country (ISO-2)" },
            { name: "contactEmail", label: "Contact email", type: "email" },
            { name: "tier", label: "Tier", type: "number", defaultValue: 1 },
            { name: "sustainabilityRating", label: "Sustainability rating" },
          ]}
        />
      ),
    },
    {
      value: "logistics",
      label: `Logistics routes (${bundle.logisticsRoutes.length})`,
      table: (
        <DataTable
          id="logistics-table"
          data={bundle.logisticsRoutes}
          searchPlaceholder="Filter routes…"
          columns={[
            route.text("name", "Name", (row) => row.name),
            route.text("origin", "Origin", (row) => row.origin),
            route.text("destination", "Destination", (row) => row.destination),
            route.number("distance", "Distance", (row) => row.distance, 0),
            route.text("distanceUnit", "Unit", (row) => row.distanceUnit),
            route.text("transportMode", "Mode", (row) => row.transportMode),
            route.bool("isReturn", "Return leg", (row) => row.isReturn),
          ]}
        />
      ),
      create: (
        <CreateDialog
          label="Add logistics route"
          action={actions.createLogisticsRoute}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "origin", label: "Origin", required: true },
            { name: "destination", label: "Destination", required: true },
            { name: "distance", label: "Distance", type: "number", step: "any", required: true },
            {
              name: "distanceUnit",
              label: "Distance unit",
              type: "select",
              options: unitOptions,
              defaultValue: "km",
              required: true,
            },
            {
              name: "transportMode",
              label: "Transport mode",
              type: "select",
              required: true,
              options: ["ROAD", "RAIL", "SEA", "AIR", "INLAND_WATERWAY"].map((mode) => ({
                value: mode,
                label: mode,
              })),
            },
            { name: "isReturn", label: "Return leg", type: "checkbox" },
          ]}
        />
      ),
    },
    {
      value: "energy",
      label: `Energy sources (${bundle.energySources.length})`,
      table: (
        <DataTable
          id="energy-table"
          data={bundle.energySources}
          searchPlaceholder="Filter energy sources…"
          columns={[
            energy.text("name", "Name", (row) => row.name),
            energy.text("type", "Type", (row) => row.type),
            energy.text("provider", "Provider", (row) => row.provider),
            energy.text("gridRegion", "Grid region", (row) => row.gridRegion),
            energy.number("renewablePercent", "Renewable %", (row) => row.renewablePercent, 1),
            energy.text("contractType", "Contract", (row) => row.contractType),
          ]}
        />
      ),
      create: (
        <CreateDialog
          label="Add energy source"
          action={actions.createEnergySource}
          fields={[
            { name: "name", label: "Name", required: true },
            {
              name: "type",
              label: "Type",
              type: "select",
              required: true,
              options: energyTypes.map((type) => ({ value: type, label: type })),
            },
            { name: "provider", label: "Provider" },
            { name: "gridRegion", label: "Grid region" },
            { name: "renewablePercent", label: "Renewable share (%)", type: "number" },
            { name: "contractType", label: "Contract type" },
          ]}
        />
      ),
    },
    {
      value: "waste",
      label: `Waste types (${bundle.wasteTypes.length})`,
      table: (
        <DataTable
          id="waste-table"
          data={bundle.wasteTypes}
          searchPlaceholder="Filter waste types…"
          columns={[
            waste.text("name", "Name", (row) => row.name),
            waste.text("category", "Category", (row) => row.category),
            waste.text("disposalMethod", "Disposal method", (row) => row.disposalMethod),
            waste.bool("isHazardous", "Hazardous", (row) => row.isHazardous),
            waste.number("recyclingRate", "Recycling rate %", (row) => row.recyclingRate, 1),
          ]}
        />
      ),
      create: (
        <CreateDialog
          label="Add waste type"
          action={actions.createWasteType}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "category", label: "Category" },
            { name: "disposalMethod", label: "Disposal method" },
            { name: "isHazardous", label: "Hazardous", type: "checkbox" },
            { name: "recyclingRate", label: "Recycling rate (%)", type: "number" },
          ]}
        />
      ),
    },
    {
      value: "water",
      label: `Water sources (${bundle.waterSources.length})`,
      table: (
        <DataTable
          id="water-table"
          data={bundle.waterSources}
          searchPlaceholder="Filter water sources…"
          columns={[
            water.text("name", "Name", (row) => row.name),
            water.text("type", "Type", (row) => row.type),
            water.text("source", "Source", (row) => row.source),
            water.text("treatment", "Treatment", (row) => row.treatment),
            water.bool("isRecycled", "Recycled", (row) => row.isRecycled),
          ]}
        />
      ),
      create: (
        <CreateDialog
          label="Add water source"
          action={actions.createWaterSource}
          fields={[
            { name: "name", label: "Name", required: true },
            { name: "type", label: "Type" },
            { name: "source", label: "Source" },
            { name: "treatment", label: "Treatment" },
            { name: "isRecycled", label: "Recycled", type: "checkbox" },
          ]}
        />
      ),
    },
  ] as const;

  // `fuelCategories` is surfaced as the fuel-type legend rather than a form field,
  // because `FuelType` rows are reference data seeded by `prisma/seed.ts`.
  return (
    <Tabs defaultValue="products">
      <TabsList className="flex-wrap" variant="line">
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {tabs.map((tab) => (
        <TabsContent key={tab.value} value={tab.value} className="space-y-3 pt-3">
          {tab.create && <div className="flex justify-end">{tab.create}</div>}
          {tab.table}
          {tab.value === "fuel-types" && (
            <p className="text-xs text-muted-foreground">
              Fuel categories in the reference table: {fuelCategories.join(", ")}. These are
              seeded by <code>npm run db:seed</code> and are not editable per tenant.
            </p>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
