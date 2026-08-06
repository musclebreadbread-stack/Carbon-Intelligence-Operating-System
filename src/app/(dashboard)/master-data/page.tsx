/**
 * Master data module.
 *
 * Ten reference collections read in one `getMasterData()` round trip (rather than
 * ten), rendered through the shared data table, and created through the item-30
 * master-data actions.
 */

import { connection } from "next/server";
import { Boxes, Database, Fuel, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { KpiCard } from "@/components/shared/kpi-card";
import { PageHeader } from "@/components/shared/page-header";
import {
  createEnergySourceAction,
  createFuelAction,
  createLogisticsRouteAction,
  createProductAction,
  createRawMaterialAction,
  createRefrigerantAction,
  createSupplierAction,
  createVehicleAction,
  createWasteTypeAction,
  createWaterSourceAction,
} from "@/lib/actions/master-data";
import { activeOrganizationId } from "@/lib/auth/active-organization";
import { ENERGY_TYPES, FUEL_CATEGORIES, VEHICLE_TYPES } from "@/lib/core/enums";
import { getMasterData } from "@/lib/data/repositories/master-data";
import { formatNumber } from "@/lib/format";
import { UNIT_REGISTRY } from "@/lib/reference/units";
import { getDictionary } from "@/lib/i18n/server";

import { MasterDataTabs } from "./_components/master-data-tabs";

export default async function MasterDataPage() {
  await connection();
  const dict = await getDictionary();

  const organizationId = await activeOrganizationId();
  const bundle = await getMasterData(organizationId);

  const total =
    bundle.products.length +
    bundle.rawMaterials.length +
    bundle.fuels.length +
    bundle.fuelTypes.length +
    bundle.vehicles.length +
    bundle.refrigerants.length +
    bundle.suppliers.length +
    bundle.logisticsRoutes.length +
    bundle.energySources.length +
    bundle.wasteTypes.length +
    bundle.waterSources.length;

  const highGwpRefrigerants = bundle.refrigerants.filter(
    (refrigerant) => refrigerant.gwp100 >= 1000,
  );
  const renewableFuels = bundle.fuels.filter((fuel) => fuel.isRenewable);

  return (
    <div className="space-y-6">
      <PageHeader
        title={dict["master.title"]}
        description={dict["master.desc"]}
        meta={[{ label: dict["master.meta.records"], value: formatNumber(total) }]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          title={dict["master.kpi.masterRecords"]}
          value={formatNumber(total)}
          icon={Database}
          description={dict["master.kpi.masterRecordsDesc"]}
          source="getMasterData()"
        />
        <KpiCard
          title={dict["master.kpi.suppliers"]}
          value={formatNumber(bundle.suppliers.length)}
          icon={Users}
          description={`${bundle.suppliers.filter((supplier) => supplier.tier === 1).length} ${dict["master.kpi.suppliersDesc"]}`}
          source="Supplier"
        />
        <KpiCard
          title={dict["master.kpi.fuels"]}
          value={formatNumber(bundle.fuels.length)}
          icon={Fuel}
          description={`${renewableFuels.length} renewable, ${bundle.fuelTypes.length} fuel types`}
          source="Fuel / FuelType"
        />
        <KpiCard
          title={dict["master.kpi.highGwpRefrigerants"]}
          value={formatNumber(highGwpRefrigerants.length)}
          icon={Boxes}
          description={dict["master.kpi.highGwpRefrigerantsDesc"]}
          source="Refrigerant.gwp100"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{dict["master.card.collections"]}</CardTitle>
          <CardDescription>
            {dict["master.card.collectionsDesc"]}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MasterDataTabs
            organizationId={organizationId}
            bundle={bundle}
            fuelCategories={FUEL_CATEGORIES}
            vehicleTypes={VEHICLE_TYPES}
            energyTypes={ENERGY_TYPES}
            units={UNIT_REGISTRY.map((definition) => definition.unit)}
            actions={{
              createProduct: createProductAction,
              createRawMaterial: createRawMaterialAction,
              createFuel: createFuelAction,
              createVehicle: createVehicleAction,
              createRefrigerant: createRefrigerantAction,
              createSupplier: createSupplierAction,
              createLogisticsRoute: createLogisticsRouteAction,
              createEnergySource: createEnergySourceAction,
              createWasteType: createWasteTypeAction,
              createWaterSource: createWaterSourceAction,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
