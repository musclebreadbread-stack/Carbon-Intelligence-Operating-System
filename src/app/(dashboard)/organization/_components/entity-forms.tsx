"use client";

/**
 * Create forms for the hierarchy levels, in a tabbed dialog.
 *
 * The action references are handed down from the page (a server component) as
 * props: a client component may import a `'use server'` module, but keeping the
 * wiring in the page makes it obvious which mutations a screen is allowed to
 * perform. Every form goes through `ActionForm`, so `DEMO_MODE`, `FORBIDDEN` and
 * field-level validation all render identically.
 */

import * as React from "react";
import { Plus } from "lucide-react";

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
import { ActionForm } from "@/components/shared/form/action-form";
import type { ActionState } from "@/lib/actions/types";

type Option = { readonly value: string; readonly label: string };

export type EntityFormsProps = {
  readonly organizationId: string;
  readonly businessUnits: readonly Option[];
  readonly facilities: readonly Option[];
  readonly buildings: readonly Option[];
  readonly productionLines: readonly Option[];
  readonly equipment: readonly Option[];
  readonly scopes: readonly Option[];
  readonly scope3Categories: readonly Option[];
  readonly tiers: readonly Option[];
  readonly createBusinessUnit: (input: unknown) => Promise<ActionState<{ readonly id: string }>>;
  readonly createFacility: (input: unknown) => Promise<ActionState<{ readonly id: string }>>;
  readonly createBuilding: (input: unknown) => Promise<ActionState<{ readonly id: string }>>;
  readonly createProductionLine: (
    input: unknown,
  ) => Promise<ActionState<{ readonly id: string }>>;
  readonly createEquipment: (input: unknown) => Promise<ActionState<{ readonly id: string }>>;
  readonly createEmissionSource: (
    input: unknown,
  ) => Promise<ActionState<{ readonly id: string }>>;
};

export function EntityForms(props: EntityFormsProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="size-4" />
            Add entity
          </Button>
        }
      />
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to the hierarchy</DialogTitle>
          <DialogDescription>
            Each level writes through its own server action, which re-checks the session,
            the permission and the parent reference before persisting.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="business-unit">
          <TabsList className="flex-wrap" variant="line">
            <TabsTrigger value="business-unit">Business unit</TabsTrigger>
            <TabsTrigger value="facility">Facility</TabsTrigger>
            <TabsTrigger value="building">Building</TabsTrigger>
            <TabsTrigger value="line">Line</TabsTrigger>
            <TabsTrigger value="equipment">Equipment</TabsTrigger>
            <TabsTrigger value="source">Source</TabsTrigger>
          </TabsList>

          <TabsContent value="business-unit" className="pt-3">
            <ActionForm
              action={props.createBusinessUnit}
              hidden={{ organizationId: props.organizationId }}
              submitLabel="Create business unit"
              fields={[
                { name: "name", label: "Name", required: true },
                { name: "code", label: "Code" },
                {
                  name: "tier",
                  label: "Tier",
                  type: "select",
                  options: props.tiers,
                  defaultValue: "BUSINESS_UNIT",
                  required: true,
                },
                { name: "description", label: "Description", type: "textarea", wide: true },
              ]}
            />
          </TabsContent>

          <TabsContent value="facility" className="pt-3">
            <ActionForm
              action={props.createFacility}
              hidden={{ organizationId: props.organizationId }}
              submitLabel="Create facility"
              fields={[
                { name: "name", label: "Name", required: true },
                { name: "code", label: "Code" },
                {
                  name: "businessUnitId",
                  label: "Business unit",
                  type: "select",
                  options: props.businessUnits,
                },
                { name: "type", label: "Type", placeholder: "manufacturing, office…" },
                { name: "city", label: "City" },
                { name: "country", label: "Country (ISO-2)", placeholder: "KR" },
                { name: "latitude", label: "Latitude", type: "number", step: "any" },
                { name: "longitude", label: "Longitude", type: "number", step: "any" },
                { name: "area", label: "Area", type: "number", step: "any" },
                {
                  name: "areaUnit",
                  label: "Area unit",
                  type: "select",
                  options: [
                    { value: "sqm", label: "sqm" },
                    { value: "sqft", label: "sqft" },
                  ],
                  defaultValue: "sqm",
                  required: true,
                },
                {
                  name: "equityShare",
                  label: "Equity share (%)",
                  type: "number",
                  defaultValue: 100,
                  min: 0,
                  max: 100,
                  required: true,
                  description: "Used by equity-share consolidation.",
                },
                {
                  name: "operationalControl",
                  label: "Operational control",
                  type: "checkbox",
                  defaultValue: true,
                },
              ]}
            />
          </TabsContent>

          <TabsContent value="building" className="pt-3">
            <ActionForm
              action={props.createBuilding}
              submitLabel="Create building"
              fields={[
                {
                  name: "facilityId",
                  label: "Facility",
                  type: "select",
                  options: props.facilities,
                  required: true,
                },
                { name: "name", label: "Name", required: true },
                { name: "code", label: "Code" },
                { name: "floors", label: "Floors", type: "number", min: 1 },
                { name: "area", label: "Area", type: "number", step: "any" },
                {
                  name: "areaUnit",
                  label: "Area unit",
                  type: "select",
                  options: [
                    { value: "sqm", label: "sqm" },
                    { value: "sqft", label: "sqft" },
                  ],
                  defaultValue: "sqm",
                  required: true,
                },
                { name: "yearBuilt", label: "Year built", type: "number" },
              ]}
            />
          </TabsContent>

          <TabsContent value="line" className="pt-3">
            <ActionForm
              action={props.createProductionLine}
              submitLabel="Create production line"
              fields={[
                {
                  name: "buildingId",
                  label: "Building",
                  type: "select",
                  options: props.buildings,
                  required: true,
                },
                { name: "name", label: "Name", required: true },
                { name: "code", label: "Code" },
                { name: "capacity", label: "Capacity", type: "number", step: "any" },
                { name: "capacityUnit", label: "Capacity unit", placeholder: "t/yr" },
              ]}
            />
          </TabsContent>

          <TabsContent value="equipment" className="pt-3">
            <ActionForm
              action={props.createEquipment}
              submitLabel="Create equipment"
              fields={[
                {
                  name: "productionLineId",
                  label: "Production line",
                  type: "select",
                  options: props.productionLines,
                  required: true,
                },
                { name: "name", label: "Name", required: true },
                { name: "code", label: "Code" },
                { name: "type", label: "Type", placeholder: "boiler, chiller…" },
                { name: "manufacturer", label: "Manufacturer" },
                { name: "model", label: "Model" },
                {
                  name: "efficiency",
                  label: "Efficiency (0–1)",
                  type: "number",
                  step: "any",
                  min: 0,
                  max: 1,
                },
              ]}
            />
          </TabsContent>

          <TabsContent value="source" className="pt-3">
            <ActionForm
              action={props.createEmissionSource}
              submitLabel="Create emission source"
              fields={[
                { name: "name", label: "Name", required: true },
                { name: "code", label: "Code" },
                {
                  name: "scope",
                  label: "Scope",
                  type: "select",
                  options: props.scopes,
                  required: true,
                },
                {
                  name: "scope3Category",
                  label: "Scope 3 category",
                  type: "select",
                  options: props.scope3Categories,
                  description: "Required for Scope 3 sources only.",
                },
                {
                  name: "sourceType",
                  label: "Source type",
                  type: "select",
                  options: [
                    { value: "STATIONARY", label: "Stationary combustion" },
                    { value: "MOBILE", label: "Mobile combustion" },
                    { value: "PROCESS", label: "Process" },
                    { value: "FUGITIVE", label: "Fugitive" },
                  ],
                },
                {
                  name: "facilityId",
                  label: "Facility",
                  type: "select",
                  options: props.facilities,
                  description: "Attach at any level; at least one parent is required.",
                },
                {
                  name: "equipmentId",
                  label: "Equipment",
                  type: "select",
                  options: props.equipment,
                },
              ]}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
