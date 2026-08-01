/**
 * Barrel for the validation layer.
 *
 * Every schema is built from the `const` enum tuples in `src/lib/core/enums.ts`
 * and the reference tables in `src/lib/reference/`, so validation can never drift
 * from the Prisma enums or the unit registry.
 *
 * zod v3 classic API via the bare `zod` import (decision 9).
 */

export * from "./common";
export * from "./organization";
export * from "./master-data";
export * from "./activity-data";
export * from "./emission-factor";
export * from "./calculation";
export * from "./rules";
export * from "./targets";
export * from "./scenario";
export * from "./disclosure";
export * from "./credits";
export * from "./verification";
export * from "./agent";
export * from "./inventory-close";
