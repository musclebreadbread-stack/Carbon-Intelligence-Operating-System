# CIOS Implementation Plan

Target repo: `/projects/sandbox/Carbon-Intelligence-Operating-System`
Work branch: `feat/cios-core-implementation` (create from `main`; do **not** commit to `main`, do **not** push — the orchestrator pushes).

---

## Verified baseline (measured, not assumed)

- `npm run build` passes today (25 static routes, TypeScript clean, ~5s TS check).
- `npm run lint` passes today with zero output.
- `npx prisma validate` passes ("The schema at prisma/schema.prisma is valid").
- `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script` **works with no live DB** and emits 4,078 lines of SQL. This is how migrations get created.
- No test runner, no `test` script, no `prisma/migrations/`, no `src/lib/domain`, no server actions, no `src/app/api`.
- All 18 dashboard pages are server components rendering **hardcoded arrays** (3,207 lines total). They contain zero data access.
- `AGENTS.md` mandates: this Next.js (16.2.12) has breaking changes — read `node_modules/next/dist/docs/` before writing code. Already read for this plan; re-read per-topic when implementing.
- Node v22.23.1, npm 11.4.2. Registry reachable (`vitest@4.1.10`, `docx@9.7.1`, `tsx@4.23.1`, `@vitejs/plugin-react@6.0.4`, `vite-tsconfig-paths@6.1.1`, `@testing-library/react@16.3.2` all resolve).

## Design decisions (made here; do not re-litigate during implementation)

1. **Layering: pure domain core + thin persistence shell.** All calculation/business logic lives in `src/lib/domain/**` as pure TypeScript with **zero** imports of `@prisma/client`, `next/*`, or `@supabase/*`. Persistence lives in `src/lib/data/**`, mutations in `src/lib/actions/**`. Rationale: no PostgreSQL server exists in this environment, so the only way to get real, verifiable test coverage of the engines is to keep them free of I/O. This is also the only way `npm test` can be meaningful.

2. **Test runner: Vitest** (`vitest run`), not Jest. Rationale: it is the runner the bundled Next 16 docs document first (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`), it needs no Babel config with our TS+ESM setup, and `vite-tsconfig-paths` resolves the existing `@/*` alias with no duplicate config. Default `environment: 'node'` (domain tests are the bulk); component tests opt in per-file with `/** @vitest-environment jsdom */`.

3. **Tests co-locate as `*.test.ts` next to source.** Rationale: matches the flat `src/lib` layout already in place and keeps the alias-free relative imports short. Exclude `**/*.test.*` from the Next build via tsconfig — already handled because Next only compiles reachable modules, but the ESLint config must not flag test globals, so add the Vitest globals via `globals: true`.

4. **Prisma migration is generated offline as a single baseline `0_init`.** Use `prisma migrate diff --from-empty --to-schema-datamodel` piped to `prisma/migrations/0_init/migration.sql`, plus `prisma/migrations/migration_lock.toml` with `provider = "postgresql"`. Rationale: `migrate dev` requires a live database; the diff command is verified working here and produces the identical SQL Prisma would generate. The user then runs `prisma migrate deploy` (or `migrate resolve --applied 0_init`) against their own DB — this goes in the Korean setup document.

5. **DB-unavailable fallback ("demo mode") instead of build-time failure.** Every repository read goes through `withDb(fn, fallback)` in `src/lib/data/db.ts`, which catches Prisma init/connection errors (`P1000`, `P1001`, `P1002`, `P1003`, `P1017`, and missing/placeholder `DATABASE_URL`) and returns a fixture dataset from `src/lib/data/demo/`. Rationale: the deliverable requires `npm run build` to pass and the UI to be wired to *real logic* with no database available. Fixtures feed the **real** domain engines, so all displayed numbers are genuinely computed; only persistence is stubbed. A `DemoModeBanner` makes this explicit to the user rather than silently faking data.

6. **Pages opt out of prerender with `await connection()`**, not `export const dynamic = 'force-dynamic'`. Rationale: the bundled Next 16 docs (`03-api-reference/04-functions/connection.md`, `use-search-params.md`) explicitly say to prefer `connection()`, and `dynamic` is on the removal path once Cache Components is enabled. Call it in the page component, never in the repository, so repositories stay Next-free and unit-testable.

7. **LLM access is behind an interface.** `LlmClient` interface in `src/lib/ai/llm/types.ts`; `OpenAiLlmClient` (uses `fetch` against the OpenAI REST API — no new SDK dependency); `DeterministicLlmClient` (template-based, no network, used by tests and by the app whenever `OPENAI_API_KEY` is absent or a placeholder). `getLlmClient()` factory picks based on env. Rationale: satisfies "works against a real key when supplied, testable without one" with one code path and no mocking framework needed at the boundary.

8. **Statistical AI is real, generative AI is narrative.** Anomaly detection, forecasting, gap detection, confidence scoring, and uncertainty are implemented as deterministic statistics in `src/lib/domain/ai/**` (fully tested). The LLM is used only to render human-readable narrative over those numeric results. Rationale: keeps the audit-critical numbers reproducible and verifiable, which is what the Explainable-AI schema (`AIExplanation`/`ExplanationStep`/`CalculationTrace`/`AssumptionLog`) is designed for.

9. **Validation: zod v3 classic API via the bare `zod` import.** The installed `zod@3.25.76` ships both `zod` (v3 API) and `zod/v4`. Use the bare import consistently. Rationale: `@hookform/resolvers@5` supports it and mixing the two subpaths in one codebase causes type incompatibilities.

10. **Server-side entry points: Server Actions for the UI, Route Handlers for the API Gateway.** Actions in `src/lib/actions/*.ts` with `'use server'` at file top; every action re-checks auth via `requireSession()` (the bundled docs warn actions are reachable by direct POST). Route Handlers under `src/app/api/v1/**` authenticate with an `Authorization: Bearer <apiKey>` header checked against the `APIKey` model. Rationale: two different consumers with two different auth models; the schema already has `APIKey`.

11. **Monte Carlo uses a seeded PRNG** (`mulberry32` in `src/lib/domain/math/random.ts`), never `Math.random()`. Rationale: uncertainty output must be reproducible to be assertable in tests and defensible in verification.

12. **Money/emission math uses plain `number` with explicit rounding helpers**, not a decimal library. Rationale: GHG inventories are reported to at most a few significant figures and the schema stores `Float`; introducing `decimal.js` would fight the Prisma types for no accounting benefit. `roundTo(value, dp)` is applied only at presentation/persistence boundaries.

13. **Sensitive field handling** (`User.passwordHash`, `User.mfaSecret`, `DataSource.credentials`, `MCPServer` config): implement `src/lib/security/field-crypto.ts` using Node `crypto` AES-256-GCM keyed from `FIELD_ENCRYPTION_KEY`. Rationale: gap #8 in the review asked for a documented strategy; a working implementation plus the key-provisioning steps in the Korean doc closes it properly. Passwords themselves stay in Supabase Auth — `passwordHash` is only populated for the local/offline seed user.

14. **Korean deliverable is generated, not hand-written.** `scripts/generate-setup-guide.ts` uses `docx@9` and is run through `tsx`; output `docs/CIOS-직접-설정-가이드.docx` is committed. Rationale: the requirement is a real `.docx`; generating it makes it regenerable and reviewable in git as source code.

---

# Implementation Plan

## Phase 0 — Tooling foundation

- [ ] 1. Create the work branch and install the test/doc toolchain.
      `git checkout -b feat/cios-core-implementation`, then `npm i -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @testing-library/user-event vite-tsconfig-paths tsx docx`. Add scripts to package.json: `"test": "vitest run"`, `"test:watch": "vitest"`, `"typecheck": "tsc --noEmit"`, `"postinstall": "prisma generate"`, `"db:seed": "tsx prisma/seed.ts"`, `"docs:setup-guide": "tsx scripts/generate-setup-guide.ts"`. Create `vitest.config.mts` with `plugins: [tsconfigPaths(), react()]`, `test: { globals: true, environment: 'node', include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'] }`. Add `vitest/globals` to `tsconfig.json` `compilerOptions.types`, and add `coverage/` to `.gitignore` (already there) plus `vitest.config.mts` to the ESLint ignore list only if it errors.
      Files: `package.json`, `package-lock.json`, `vitest.config.mts`, `tsconfig.json`
      Verify: `npm test` — exits 0 reporting "No test files found" is NOT acceptable; add `src/lib/smoke.test.ts` with one trivial assertion in this item and confirm `npm test` reports 1 passed. Then `npm run build` and `npm run lint` still pass.

- [ ] 2. Generate the baseline Prisma migration offline.
      Run `mkdir -p prisma/migrations/0_init && npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql`, and write `prisma/migrations/migration_lock.toml` containing `provider = "postgresql"`. Do not attempt `migrate dev`/`migrate deploy` — there is no server.
      Files: `prisma/migrations/0_init/migration.sql`, `prisma/migrations/migration_lock.toml`
      Verify: `npx prisma validate` passes, and `npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script | diff - prisma/migrations/0_init/migration.sql` prints nothing (migration is in sync with the schema).

- [ ] 3. Create the shared core primitives.
      `src/lib/core/result.ts` (`Result<T,E>` with `ok`/`err`/`isOk`/`unwrapOr`), `src/lib/core/errors.ts` (`AppError` base + `ValidationError`, `NotFoundError`, `UnauthorizedError`, `CalculationError` with a `code` string), `src/lib/core/number.ts` (`roundTo`, `sum`, `mean`, `stdDev`, `percentile`, `safeDivide`), `src/lib/core/period.ts` (`ReportingPeriod` type, `overlapDays`, `prorate`, `fiscalYearBounds(fiscalYearStart)`, `monthsInPeriod`). All pure.
      Files: `src/lib/core/result.ts`, `src/lib/core/errors.ts`, `src/lib/core/number.ts`, `src/lib/core/period.ts`, plus `*.test.ts` for `number` and `period`
      Verify: `npm test -- src/lib/core` — all tests pass.

- [ ] 4. Create the reference-data tables as pure constants.
      `src/lib/reference/gwp.ts` (AR4/AR5/AR6 GWP-100 values for CO2, CH4 fossil/biogenic, N2O, and the HFC/PFC/SF6/NF3 species used by the schema's `EmissionResult` gas columns, keyed by `GwpVersion`), `src/lib/reference/units.ts` (canonical unit registry + conversion factor table matching the `UnitConversion` model's `fromUnit`/`toUnit`/`factor` shape, covering energy kWh/MWh/GJ/MJ/therm, volume L/m3/gal, mass kg/t/lb, distance km/mi, tkm/pkm), `src/lib/reference/scope3-categories.ts` (all 15 `Scope3Category` values with Korean+English names, default `CalculationApproach`, and minimum required activity fields), `src/lib/reference/frameworks.ts` (the 11 `ReportingFramework` values with publisher, version, and requirement-group codes).
      Files: `src/lib/reference/gwp.ts`, `src/lib/reference/units.ts`, `src/lib/reference/scope3-categories.ts`, `src/lib/reference/frameworks.ts`
      Verify: `npm run typecheck` passes and `npm test -- src/lib/reference` passes a table-integrity test (every `Scope3Category` enum member present exactly once; every conversion factor > 0; every framework code is a valid `ReportingFramework`).

- [ ] 5. Implement unit conversion and GWP normalisation.
      `src/lib/domain/units/convert.ts` — `convert(value, from, to)` resolving via direct factor, inverse factor, or one-hop pivot through the canonical unit; throws `CalculationError` on incompatible dimensions. `src/lib/domain/gwp/to-co2e.ts` — `gasesToCo2e(gases, gwpVersion)` returning `{ totalCO2e, byGas, biogenicCO2 }` where biogenic CO2 is tracked separately and excluded from the total per GHG Protocol.
      Files: `src/lib/domain/units/convert.ts`, `src/lib/domain/units/convert.test.ts`, `src/lib/domain/gwp/to-co2e.ts`, `src/lib/domain/gwp/to-co2e.test.ts`
      Verify: `npm test -- src/lib/domain/units src/lib/domain/gwp` — tests pass, including round-trip identity (`convert(convert(x,a,b),b,a) ≈ x`), a pivot conversion (MWh→GJ), a rejection case, and CH4 at AR5 = 28× vs AR6 = 27.9×.

## Phase 1 — Emission calculation engines

- [ ] 6. Implement versioned emission-factor resolution.
      `src/lib/domain/factors/resolve-factor.ts` — `resolveFactor(candidates, criteria)` selecting the applicable `EmissionFactorLike` for a given `{ date, scope, scope3Category, region, country, sector, unit }`, honouring `validFrom`/`validTo` windows, `isActive`, and a documented specificity ranking (organization-specific > supplier-specific > country > region > global; newest `validFrom` wins ties). Returns the factor plus a `selectionRationale` string array for the audit trail. Define the local structural types (`EmissionFactorLike`) in `src/lib/domain/factors/types.ts` so the module never imports Prisma.
      Files: `src/lib/domain/factors/types.ts`, `src/lib/domain/factors/resolve-factor.ts`, `src/lib/domain/factors/resolve-factor.test.ts`
      Verify: `npm test -- src/lib/domain/factors` — tests cover expired-factor exclusion, region fallback, tie-break by `validFrom`, and the no-match error.

- [ ] 7. Implement the Scope 1 calculation engines.
      `src/lib/domain/emissions/scope1.ts` with `calculateStationaryCombustion`, `calculateMobileCombustion`, `calculateProcessEmissions`, `calculateFugitiveEmissions` (refrigerant screening: `(inventoryChange + purchases - disposals) × GWP`, plus the material-balance variant). Each returns a `GasBreakdown` + `EmissionCalcTrace` (ordered steps with formula string, inputs, output, unit) so downstream lineage/explainability can consume it. Shared result types in `src/lib/domain/emissions/types.ts`.
      Files: `src/lib/domain/emissions/types.ts`, `src/lib/domain/emissions/scope1.ts`, `src/lib/domain/emissions/scope1.test.ts`
      Verify: `npm test -- src/lib/domain/emissions/scope1` — hand-computed expected values for each of the four source types pass, and every result carries a non-empty trace.

- [ ] 8. Implement the Scope 2 calculation engines.
      `src/lib/domain/emissions/scope2.ts` — `calculateLocationBased` (grid factor × consumption) and `calculateMarketBased` (contractual instruments applied in order: supplier-specific → RECs/GOs → residual mix, with an explicit residual-mix fallback and a `Math.max(0, …)` guard so oversupplied RECs cannot create negative emissions). Returns both a dual-reporting object `{ locationBased, marketBased }` and traces.
      Files: `src/lib/domain/emissions/scope2.ts`, `src/lib/domain/emissions/scope2.test.ts`
      Verify: `npm test -- src/lib/domain/emissions/scope2` — asserts location ≠ market for a REC-covered site, that 100% REC coverage yields 0 market-based, and that over-coverage clamps at 0.

- [ ] 9. Implement the Scope 3 calculation engines for all 15 categories.
      `src/lib/domain/emissions/scope3.ts` — one exported function per category (`calculateCat1PurchasedGoods` … `calculateCat15Investments`) plus a `calculateScope3Category(category, input)` dispatcher. Each supports the approaches declared in `CalculationApproach`: spend-based, activity/average-data, supplier-specific, hybrid. Category 3 derives WTT from Scope 1/2 activity; Category 11 handles direct vs indirect use-phase over a product lifetime; Category 15 handles equity-share and investment-specific attribution.
      Files: `src/lib/domain/emissions/scope3.ts`, `src/lib/domain/emissions/scope3.test.ts`
      Verify: `npm test -- src/lib/domain/emissions/scope3` — a parameterised test asserts the dispatcher handles all 15 enum members and each category has at least one hand-computed assertion.

- [ ] 10. Implement inventory aggregation and intensity metrics.
      `src/lib/domain/emissions/aggregate.ts` — `buildInventory(results, options)` producing `{ scope1Total, scope2Location, scope2Market, scope3Total, scope3ByCategory, totalEmissions }` matching the `EmissionInventory` columns; `rollUp(results, dimension)` for the 7-level hierarchy (organization → businessUnit → facility → building → productionLine → equipment → emissionSource); `applyConsolidation(results, approach)` for operational-control / financial-control / equity-share (using `Facility.operationalControl` and `equityShare`); `intensity(total, denominator)` for revenue/production/area/FTE. Also `allocate(total, method, keys)` matching the `EmissionAllocation` model (physical, economic, mass, energy-content).
      Files: `src/lib/domain/emissions/aggregate.ts`, `src/lib/domain/emissions/aggregate.test.ts`
      Verify: `npm test -- src/lib/domain/emissions/aggregate` — asserts scope totals sum correctly, equity-share at 50% halves a facility's contribution, rollup sums to the same grand total at every level, and allocation shares sum to the input total.

- [ ] 11. Implement uncertainty analysis.
      `src/lib/domain/math/random.ts` (`mulberry32` seeded PRNG, `normal`, `triangular`, `lognormal` samplers) and `src/lib/domain/emissions/uncertainty.ts` — `propagateUncertainty` (quadrature combination of activity-data / emission-factor / methodology uncertainty for sums and products) and `monteCarlo(inputs, { iterations, seed, confidenceLevel })` returning `{ mean, lowerBound, upperBound, overallUncertainty }` shaped to the `UncertaintyAnalysis` model.
      Files: `src/lib/domain/math/random.ts`, `src/lib/domain/math/random.test.ts`, `src/lib/domain/emissions/uncertainty.ts`, `src/lib/domain/emissions/uncertainty.test.ts`
      Verify: `npm test -- src/lib/domain/math src/lib/domain/emissions/uncertainty` — same seed gives byte-identical output across two runs, quadrature of 3%/4% ≈ 5%, and the 95% Monte Carlo interval brackets the analytic mean.

- [ ] 12. Implement data-quality scoring.
      `src/lib/domain/quality/score.ts` — `scoreEntry(entry)` producing the five `DataQualityScore` dimensions (completeness, accuracy, timeliness, consistency, reliability) plus a weighted `overallScore` and a derived `DataQualityLevel`, driven by a documented rubric (measured vs estimated, factor specificity, data age vs reporting period, unit/source consistency). `aggregateQuality(scores)` for inventory-level quality.
      Files: `src/lib/domain/quality/score.ts`, `src/lib/domain/quality/score.test.ts`
      Verify: `npm test -- src/lib/domain/quality` — a metered current-period entry with a supplier-specific factor scores HIGH; an estimated stale entry with a global default factor scores ESTIMATED/DEFAULT.

- [ ] 13. Implement the calculation orchestrator.
      `src/lib/domain/emissions/orchestrator.ts` — `runCalculation(request)` where `request` carries activity entries, candidate factors, GWP version, consolidation approach, and period. It resolves a factor per entry (item 6), dispatches to the right scope engine (items 7–9), converts units (item 5), scores quality (item 12), aggregates (item 10), computes uncertainty (item 11), and returns `{ calculation, results, inventory, uncertainty, traces, lineage }` — all plain objects shaped to `EmissionCalculation`/`EmissionResult`/`UncertaintyAnalysis`/`CalculationTrace`. `lineage` is the node/edge descriptor list consumed by item 15. Never touches Prisma.
      Files: `src/lib/domain/emissions/orchestrator.ts`, `src/lib/domain/emissions/orchestrator.test.ts`
      Verify: `npm test -- src/lib/domain/emissions/orchestrator` — an end-to-end fixture with Scope 1 + Scope 2 + two Scope 3 categories produces the expected `totalEmissions`, one `EmissionResult` per entry, a trace for every result, and a lineage edge from every activity entry to its result.

## Phase 2 — Rules, lineage, audit

- [ ] 14. Implement the rules engine.
      `src/lib/domain/rules/operators.ts` (a handler for each of the 13 `RuleOperator` values, with typed coercion and `IN`/`BETWEEN` list parsing from the `RuleCondition.value` string), `src/lib/domain/rules/evaluate.ts` (`evaluateRule(rule, context)` honouring `logicGroup` AND/OR grouping and `orderIndex`; `evaluateRuleSet(ruleSet, context)` honouring `priority` and `isActive`), `src/lib/domain/rules/actions.ts` (action handlers for `flag`, `reject`, `set_field`, `notify`, `recalculate`, `assign` producing an `RuleActionEffect[]` rather than performing side effects). Returns data shaped to `RuleExecution`.
      Files: `src/lib/domain/rules/operators.ts`, `src/lib/domain/rules/evaluate.ts`, `src/lib/domain/rules/actions.ts`, `src/lib/domain/rules/*.test.ts`
      Verify: `npm test -- src/lib/domain/rules` — a parameterised test exercises all 13 operators, plus mixed AND/OR grouping, priority ordering, and `IS_NULL` on a missing key.

- [ ] 15. Implement the data-lineage graph builder and traversal.
      `src/lib/domain/lineage/graph.ts` — `buildGraph(descriptors)` producing `DataLineageNode`/`DataLineageEdge`-shaped objects with stable synthetic ids, `traceUpstream(graph, nodeId)` / `traceDownstream(graph, nodeId)` (BFS with cycle guard), `toProvenanceTree(graph, nodeId)` for UI rendering, and `attachTransformation(edge, transformation)` for the `DataTransformation` record.
      Files: `src/lib/domain/lineage/graph.ts`, `src/lib/domain/lineage/graph.test.ts`
      Verify: `npm test -- src/lib/domain/lineage` — upstream trace from an `EmissionResult` node reaches the source activity entry and its emission factor; a deliberately cyclic graph terminates instead of hanging.

- [ ] 16. Implement audit-trail and version-history recording.
      `src/lib/domain/audit/diff.ts` — `diffEntity(before, after, options)` producing a field-level change map (with a `redactFields` list so `passwordHash`/`mfaSecret`/`credentials` are never written to `AuditTrail.changes`), and `buildAuditEntry({ entityType, entityId, action, before, after, performedBy, reason, ipAddress })` shaped to `AuditTrail`. `src/lib/domain/audit/hash.ts` — `hashEvidence(buffer|string)` SHA-256 for `AuditEvidence.hash` and `EvidencePackage`.
      Files: `src/lib/domain/audit/diff.ts`, `src/lib/domain/audit/hash.ts`, `src/lib/domain/audit/*.test.ts`
      Verify: `npm test -- src/lib/domain/audit` — diff detects added/removed/changed fields, redacted fields appear as `"[REDACTED]"`, unchanged entities produce an empty diff, and the hash is stable and 64 hex chars.

## Phase 3 — Targets, scenarios, finance, disclosure, verification

- [ ] 17. Implement SBTi target mathematics.
      `src/lib/domain/targets/sbti.ts` — `absoluteContractionPathway({ baselineYear, baselineEmissions, targetYear, annualRate })` (1.5 °C = 4.2 %/yr linear annual reduction) emitting a `TargetPathway`-shaped year series; `sectoralDecarbonizationPathway` for intensity-based targets; `evaluateProgress(target, actuals)` returning `{ reductionFromBaseline, reductionPercent, isOnTrack, gapToPathway }` shaped to `TargetProgress`; `netZeroPlan(commitment)` computing residual emissions and required neutralisation volume; `validateTargetAgainstCriteria(target)` returning SBTi eligibility warnings (baseline recency, minimum ambition, Scope 3 inclusion threshold when Scope 3 > 40 % of total).
      Files: `src/lib/domain/targets/sbti.ts`, `src/lib/domain/targets/sbti.test.ts`
      Verify: `npm test -- src/lib/domain/targets` — a 2020→2030 4.2 %/yr pathway yields 42 % cumulative reduction at 2030, `isOnTrack` flips correctly either side of the pathway value, and the Scope 3 threshold warning fires at 45 %.

- [ ] 18. Implement the scenario simulator and carbon budget.
      `src/lib/domain/scenarios/project.ts` — `projectScenario({ type, baseline, assumptions, targetYear })` producing a `ScenarioResult`-shaped year series from `ScenarioAssumption` levers (growth rate, energy efficiency %/yr, renewable-share ramp, fuel switching, supply-chain engagement, carbon price), with distinct default lever sets per `ScenarioType` (BASELINE, BAU, OPTIMISTIC, PESSIMISTIC, NET_ZERO, IEA_NZE, IEA_APS, IEA_STEPS, CUSTOM). `compareScenarios(a, b, metrics)` shaped to `ScenarioComparison`. `src/lib/domain/scenarios/budget.ts` — `consumeBudget(budget, actuals)` computing `usedBudget`/`remainingBudget` and the overshoot year for a `CarbonBudget`.
      Files: `src/lib/domain/scenarios/project.ts`, `src/lib/domain/scenarios/budget.ts`, `src/lib/domain/scenarios/*.test.ts`
      Verify: `npm test -- src/lib/domain/scenarios` — NET_ZERO reaches ≈0 at its target year, BAU rises monotonically with a positive growth lever, comparison deltas and `percentChange` are correct, and budget overshoot is detected in the right year.

- [ ] 19. Implement MACC and investment finance.
      `src/lib/domain/finance/investment.ts` — `npv(cashflows, discountRate)`, `irr(cashflows)` (bisection, documented bounds and non-convergence error), `paybackPeriod`, `roi`, `levelizedCostOfAbatement`, and `analyseInvestment(input)` shaped to `InvestmentAnalysis`. `src/lib/domain/finance/macc.ts` — `buildMaccCurve(technologies, year)` sorting by marginal cost and accumulating `cumulativeAbatement` into `MACCCurve`-shaped points; `selectPortfolio(curve, { abatementTarget, budget })` greedy least-cost selection. `src/lib/domain/roadmap/plan.ts` — `buildRoadmap({ baseline, target, actions })` sequencing `RoadmapAction`s into `RoadmapMilestone`s and computing the residual gap to target.
      Files: `src/lib/domain/finance/investment.ts`, `src/lib/domain/finance/macc.ts`, `src/lib/domain/roadmap/plan.ts`, plus `*.test.ts` for each
      Verify: `npm test -- src/lib/domain/finance src/lib/domain/roadmap` — NPV of a known cashflow matches a hand calculation, IRR of `[-1000, 500, 500, 500]` ≈ 23.4 %, MACC points are cost-ascending with monotonic cumulative abatement, and the roadmap gap equals target minus the sum of action reductions.

- [ ] 20. Implement carbon finance logic.
      `src/lib/domain/credits/registry.ts` — `creditBalance(credits, offsets)` per `CreditStatus`/vintage, `retireCredits(credits, quantity, { vintage, purpose })` FIFO-by-vintage returning `CarbonOffset`-shaped records and rejecting over-retirement, `netEmissions(grossEmissions, retiredOffsets)` keeping gross and net separate per GHG Protocol, `expiringCredits(credits, asOf, days)`. `src/lib/domain/credits/pricing.ts` — `markToMarket(credits, prices)`, `internalCarbonPriceImpact(emissions, price)`, `etsPosition({ allocated, verified, surrendered })` computing surplus/deficit and compliance cost, `ppaCoverage(ppas, consumption)` and `recCoverage`.
      Files: `src/lib/domain/credits/registry.ts`, `src/lib/domain/credits/pricing.ts`, `src/lib/domain/credits/*.test.ts`
      Verify: `npm test -- src/lib/domain/credits` — FIFO retirement consumes the oldest vintage first, over-retirement throws, net = gross − retired while gross is unchanged, and an ETS deficit produces a positive compliance cost.

- [ ] 21. Implement disclosure framework mapping and report assembly.
      `src/lib/domain/disclosure/requirements.ts` — a seeded requirement catalogue for the frameworks the schema calls out (CDP, ISSB S1/S2, CSRD/ESRS E1, TCFD, GRI 305, SASB) shaped to `DisclosureRequirement`. `src/lib/domain/disclosure/map.ts` — `mapInventoryToRequirements(inventory, framework)` auto-populating numeric `DisclosureResponse` values from the calculated inventory; `completeness(responses, requirements)` returning per-category and overall percentages plus the mandatory-unanswered list; `assembleReport(framework, responses, inventory)` producing the section tree used by `ReportGeneration`.
      Files: `src/lib/domain/disclosure/requirements.ts`, `src/lib/domain/disclosure/map.ts`, `src/lib/domain/disclosure/map.test.ts`
      Verify: `npm test -- src/lib/domain/disclosure` — Scope 1/2/3 totals land on the correct CDP and ESRS E1 requirement codes, completeness is 100 % when all mandatory items are answered and lists the exact gaps otherwise.

- [ ] 22. Implement MRV and verification logic.
      `src/lib/domain/verification/materiality.ts` — `isMaterial(deviation, total, threshold)` and `aggregateMisstatements(findings, total)` deciding the `opinionType` (unqualified / qualified / adverse) from accumulated material misstatements. `src/lib/domain/verification/findings.ts` — `severityRollup(findings)`, `openFindingsByDueDate`, `readinessScore(engagement)`. `src/lib/domain/mrv/plan.ts` — `monitoringPlanCoverage(plan, sources)` (which `EmissionSource`s lack a `MonitoringParameter`), `measurementCompleteness(parameters, measurements, frequency)` using `MeasurementFrequency` to compute expected reading counts per period, and `buildEvidencePackage(items)` using the item-16 hash.
      Files: `src/lib/domain/verification/materiality.ts`, `src/lib/domain/verification/findings.ts`, `src/lib/domain/mrv/plan.ts`, plus `*.test.ts` for each
      Verify: `npm test -- src/lib/domain/verification src/lib/domain/mrv` — a 6 % misstatement against a 5 % threshold yields a qualified opinion, an uncovered source is reported, and HOURLY frequency over 30 days expects 720 readings.

## Phase 4 — AI subsystem

- [ ] 23. Implement the LLM client abstraction.
      `src/lib/ai/llm/types.ts` (`LlmClient` with `complete(prompt, options)` and `completeJson<T>(prompt, schema, options)`, returning `{ text, tokensUsed, model, costUsd }`), `src/lib/ai/llm/openai-client.ts` (`fetch` POST to `https://api.openai.com/v1/chat/completions`, configurable base URL and model, timeout via `AbortSignal`, typed error mapping for 401/429/5xx, retry with exponential backoff), `src/lib/ai/llm/deterministic-client.ts` (renders narrative from structured input via templates; no network; records the prompt for assertion), `src/lib/ai/llm/factory.ts` (`getLlmClient()` → OpenAI when `OPENAI_API_KEY` is set and not `sk-placeholder`, otherwise deterministic; `isLlmConfigured()` for UI badges).
      Files: `src/lib/ai/llm/types.ts`, `src/lib/ai/llm/openai-client.ts`, `src/lib/ai/llm/deterministic-client.ts`, `src/lib/ai/llm/factory.ts`, `src/lib/ai/llm/*.test.ts`
      Verify: `npm test -- src/lib/ai/llm` — the deterministic client returns stable text for the same input; the OpenAI client is tested against a stubbed `globalThis.fetch` (`vi.stubGlobal`) asserting request shape, retry-on-429, and 401 error mapping; the factory returns deterministic when the key is absent or the `sk-placeholder` value from `.env.local`.

- [ ] 24. Implement the statistical AI engines.
      `src/lib/domain/ai/anomaly.ts` — `detectAnomalies(series, { method: 'zscore' | 'iqr' | 'seasonal', threshold })` returning `AnomalyDetection`-shaped records with `detectedValue`, `expectedValue`, `deviation`, `severity`. `src/lib/domain/ai/forecast.ts` — `forecast(series, { horizon, method: 'linear' | 'holt' })` returning `AIPrediction`-shaped points with `lowerBound`/`upperBound` prediction intervals. `src/lib/domain/ai/gaps.ts` — `detectDataGaps(expectedPeriods, entries)` returning `DataGapAnalysis`-shaped records with an `estimationMethod` and a filled `estimatedValue` (interpolation / prior-period / intensity-based). `src/lib/domain/ai/confidence.ts` — `scoreConfidence(factors)` producing `AIConfidenceScore` plus the weighted `ConfidenceBreakdown` rows.
      Files: `src/lib/domain/ai/anomaly.ts`, `src/lib/domain/ai/forecast.ts`, `src/lib/domain/ai/gaps.ts`, `src/lib/domain/ai/confidence.ts`, plus `*.test.ts` for each
      Verify: `npm test -- src/lib/domain/ai` — a spike in an otherwise flat series is flagged CRITICAL and a clean series flags nothing; a perfectly linear series forecasts the exact next value with a tight interval; a missing month is detected and interpolated; confidence weights sum to 1 and the breakdown reproduces the total.

- [ ] 25. Implement the explainable-AI service.
      `src/lib/ai/explain/build-explanation.ts` — `buildExplanation({ entityType, entityId, traces, assumptions, confidenceFactors, evidence })` assembling `AIExplanation` + `ExplanationStep[]` + `CalculationTrace[]` + `AssumptionLog[]` + `ConfidenceBreakdown[]` + `EvidenceLink[]` from the item-13 orchestrator output and the item-24 confidence scores, then calling the injected `LlmClient` to fill `humanReadable` while `technicalDetail` is generated deterministically from the traces. The `LlmClient` is a constructor/parameter dependency, never imported directly.
      Files: `src/lib/ai/explain/build-explanation.ts`, `src/lib/ai/explain/build-explanation.test.ts`
      Verify: `npm test -- src/lib/ai/explain` — with the deterministic client injected, an orchestrator fixture yields one `ExplanationStep` per trace step in `stepNumber` order, `technicalDetail` contains every formula string, and `humanReadable` is non-empty with zero network calls (assert `fetch` was never called).

- [ ] 26. Implement the agent runtime and MCP abstraction.
      `src/lib/ai/agents/tool-registry.ts` (register tools with a zod input schema; `AgentTool`-shaped descriptors; built-in tools: `calculate_emissions`, `query_inventory`, `detect_anomalies`, `project_scenario`, `lookup_emission_factor` — each delegating to the Phase 1–4 domain functions), `src/lib/ai/agents/runtime.ts` (`executeTask(agent, task, deps)` running a bounded tool-call loop with `maxRetries`/`timeout` from `AgentTask`, producing `AgentExecution`-shaped output including `logs`, `tokensUsed`, `duration`), `src/lib/ai/mcp/client.ts` (`McpClient` interface `listTools`/`callTool`/`ping`, an HTTP implementation for `MCPServer.url`, and an `InMemoryMcpClient` for tests), `src/lib/ai/agents/conversation.ts` (`AgentConversation`/`AgentMessage` turn handling with context windowing).
      Files: `src/lib/ai/agents/tool-registry.ts`, `src/lib/ai/agents/runtime.ts`, `src/lib/ai/agents/conversation.ts`, `src/lib/ai/mcp/client.ts`, plus `*.test.ts` for each
      Verify: `npm test -- src/lib/ai/agents src/lib/ai/mcp` — a task routed to `calculate_emissions` returns the same total as the item-13 orchestrator; invalid tool input is rejected by the zod schema; a tool that throws is retried up to `maxRetries` then recorded as failed with `errorMessage`; the in-memory MCP client round-trips a tool call.

## Phase 5 — Validation, persistence, server layer

- [ ] 27. Create the zod validation schemas.
      `src/lib/validation/` with one file per domain: `organization.ts` (organization, business unit, facility, building, production line, equipment, emission source — including the parent-reference rules), `master-data.ts`, `activity-data.ts` (quantity > 0, `endDate` ≥ `startDate`, unit must exist in the item-4 registry), `emission-factor.ts` (`validTo` after `validFrom`, unit ∈ `EmissionFactorUnit`), `calculation.ts`, `rules.ts` (operator-specific `value` parsing), `targets.ts`, `scenario.ts`, `disclosure.ts`, `credits.ts`, `verification.ts`, `agent.ts`, and `index.ts` re-exports. Derive TS types with `z.infer` and export them.
      Files: `src/lib/validation/*.ts`, `src/lib/validation/activity-data.test.ts`, `src/lib/validation/emission-factor.test.ts`
      Verify: `npm test -- src/lib/validation` and `npm run typecheck` — invalid payloads produce the expected `issues[].path`, valid payloads parse, and every enum in a schema matches the Prisma enum member list.

- [ ] 28. Build the data-access layer with a database-unavailable fallback.
      `src/lib/data/db.ts` — `isDbConfigured()` and `withDb<T>(query, fallback)` catching `PrismaClientInitializationError` and error codes `P1000`–`P1003`/`P1017` plus placeholder `DATABASE_URL`, returning the fallback and setting a module-level `demoMode` flag exposed by `getDataMode()`. `src/lib/data/demo/` — coherent fixture data for one seeded organization (2 business units, 3 facilities, buildings/lines/equipment/sources, 24 months of activity entries across Scope 1/2 and 6 Scope 3 categories, ~60 emission factors with versions, targets, scenarios, credits, findings, agents) exported as plain objects matching the domain input types. `src/lib/data/repositories/` — one repository per module (`organization`, `master-data`, `activity-data`, `emission-factor`, `calculation`, `rules`, `lineage`, `targets`, `scenario`, `roadmap`, `credits`, `disclosure`, `verification`, `mrv`, `ai`, `agent`, `audit`, `security`) exposing typed read functions and using `withDb` with the matching fixture.
      Files: `src/lib/data/db.ts`, `src/lib/data/demo/*.ts`, `src/lib/data/repositories/*.ts`, `src/lib/data/db.test.ts`, `src/lib/data/repositories/activity-data.test.ts`, `src/lib/data/repositories/calculation.test.ts`
      Verify: `npm test -- src/lib/data` — with `vi.mock('@/lib/prisma')` returning rows, repositories map them correctly; with the mock throwing a `P1001`, the same call returns fixture data and `getDataMode()` reports `"demo"`; a fixture-integrity test asserts every referenced foreign key exists and 24 months of entries are present.

- [ ] 29. Implement the auth/session and authorization helpers.
      `src/lib/auth/session.ts` — `getSession()` (Supabase `getUser()` + the matching `User` row and organization via the item-28 repository, with a demo session when Supabase is unconfigured), `requireSession()` (throws `UnauthorizedError`), `getActiveOrganizationId()`. `src/lib/auth/rbac.ts` — `can(session, resource, action)` evaluating `UserRole`→`Role`→`RolePermission`→`Permission` plus `AccessPolicy` attribute conditions via the item-14 rule operators; `requirePermission(session, resource, action)`. `src/lib/security/field-crypto.ts` — AES-256-GCM `encryptField`/`decryptField` keyed from `FIELD_ENCRYPTION_KEY`, throwing a clear error when the key is missing.
      Files: `src/lib/auth/session.ts`, `src/lib/auth/rbac.ts`, `src/lib/security/field-crypto.ts`, `src/lib/auth/rbac.test.ts`, `src/lib/security/field-crypto.test.ts`
      Verify: `npm test -- src/lib/auth src/lib/security` — a user with only `emission:read` is denied `emission:write`, a wildcard permission grants all actions on its resource, an ABAC policy scoped to one facility denies another, and encrypt→decrypt round-trips while a tampered ciphertext throws.

- [ ] 30. Implement the server actions.
      `src/lib/actions/` with `'use server'` at the top of each file: `organization.ts`, `master-data.ts`, `activity-data.ts`, `emission-factor.ts`, `calculation.ts` (`runCalculationAction` → item 13 → persists `EmissionCalculation`/`EmissionResult`/`UncertaintyAnalysis`/`CalculationTrace`/lineage in one `prisma.$transaction`), `rules.ts` (`executeRuleSetAction` writing `RuleExecution`), `targets.ts`, `scenario.ts` (`simulateScenarioAction`), `roadmap.ts`, `credits.ts` (`retireCreditsAction`), `disclosure.ts` (`generateDisclosureReportAction`), `verification.ts`, `ai.ts` (`runAnalysisAction` writing `AIAnalysis` + explanation graph), `agent.ts` (`executeAgentTaskAction`). Every action: `requireSession()` → `requirePermission()` → zod `safeParse` → domain call → persist → `buildAuditEntry` → `revalidatePath()`. Return a discriminated `ActionState` (`{ status: 'success' | 'error', ... }`) usable with `useActionState`. When in demo mode, actions return `{ status: 'error', code: 'DEMO_MODE' }` with a Korean-safe message key instead of throwing.
      Files: `src/lib/actions/*.ts`, `src/lib/actions/types.ts`, `src/lib/actions/calculation.test.ts`, `src/lib/actions/activity-data.test.ts`, `src/lib/actions/credits.test.ts`
      Verify: `npm test -- src/lib/actions` — with `@/lib/prisma`, `@/lib/auth/session`, and `next/cache` mocked: an unauthenticated call returns an `UnauthorizedError` state, an invalid payload returns field-level errors and performs no write, a valid `runCalculationAction` writes inside `$transaction` and calls `revalidatePath`, and an audit entry is written for every mutation.

- [ ] 31. Implement the REST API route handlers.
      `src/app/api/v1/` route handlers: `health/route.ts` (GET, unauthenticated, reports db/llm/supabase configuration status), `organizations/route.ts`, `facilities/route.ts`, `activity-data/route.ts` (GET list + POST create), `emission-factors/route.ts`, `calculations/route.ts` (GET list + POST run), `inventories/route.ts`, `targets/route.ts`, `scenarios/route.ts`, `disclosures/route.ts`, `credits/route.ts`, `lineage/[nodeId]/route.ts`. Shared `src/app/api/v1/_lib/handler.ts` providing `withApiKey(handler)` (Bearer token hashed and matched against `APIKey`, checks `expiresAt`/`isActive`, applies `rateLimit` via an in-memory token bucket in `src/lib/api/rate-limit.ts`), `jsonOk`/`jsonError` with a consistent envelope, zod query/body parsing, and `X-RateLimit-*` headers. Reuse the item-30 domain paths — no logic duplication.
      Files: `src/app/api/v1/**/route.ts`, `src/app/api/v1/_lib/handler.ts`, `src/lib/api/rate-limit.ts`, `src/lib/api/rate-limit.test.ts`, `src/app/api/v1/_lib/handler.test.ts`
      Verify: `npm test -- src/lib/api src/app/api` — the rate limiter allows N then returns 429 with a `Retry-After` header and refills after the window; `withApiKey` rejects a missing/invalid/expired key with 401 and passes a valid one. Then `npm run build` and confirm the new `/api/v1/*` routes appear as `ƒ` (dynamic) in the route table.

- [ ] 32. Write the Prisma seed script.
      `prisma/seed.ts` (run via `npm run db:seed`, uses `tsx`) idempotently upserting: reference data (unit conversions from item 4, `Scope3CategoryConfig` for all 15 categories, `CalculationMethodology` + `CalculationFormula` per scope, `EmissionFactorSource`/`EmissionFactorVersion`/`EmissionFactor` set, `DisclosureFramework` + `DisclosureRequirement` from item 21, `TargetType`, `AbatementTechnology`, system `Role`/`Permission` matrix) and the demo tenant (the same organization/hierarchy/activity data as the item-28 fixtures so demo mode and a seeded DB show identical numbers, plus one admin `User` with a bcrypt-free scrypt `passwordHash` via Node `crypto`). Add `prisma.seed` config to package.json.
      Files: `prisma/seed.ts`, `prisma/seed-data/*.ts`, `package.json`
      Verify: `npm run typecheck` passes and `npm test -- prisma` passes a test that imports the seed data modules and asserts referential integrity + that the seed's activity totals equal the item-28 fixture totals. (Executing the seed requires a live DB and is documented in the Korean guide, not run here.)

## Phase 6 — UI wiring

- [ ] 33. Add app-shell resilience and shared providers.
      `src/app/(dashboard)/error.tsx` and `src/app/(dashboard)/loading.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, per-module `error.tsx` for the four heaviest modules (`emission-engine`, `ai-engine`, `analytics`, `esg-disclosure`). `src/components/providers/session-provider.tsx` (client context carrying the item-29 session + active organization), `src/components/layout/organization-switcher.tsx`, `src/components/layout/demo-mode-banner.tsx` (renders when `getDataMode() === 'demo'`, explains that no DB/API key is configured and links to the Korean setup guide). Convert `(dashboard)/layout.tsx` to a server component that resolves the session and organization list and renders the client `Sidebar`/`Header` inside the provider; add `Header` user menu + sign-out server action.
      Files: `src/app/(dashboard)/error.tsx`, `src/app/(dashboard)/loading.tsx`, `src/app/global-error.tsx`, `src/app/not-found.tsx`, `src/app/(dashboard)/{emission-engine,ai-engine,analytics,esg-disclosure}/error.tsx`, `src/components/providers/session-provider.tsx`, `src/components/layout/{organization-switcher,demo-mode-banner,header}.tsx`, `src/app/(dashboard)/layout.tsx`, `src/lib/actions/auth.ts`
      Verify: `npm run build` passes with the dashboard routes now listed as `ƒ` rather than `○`; `npm test -- src/components/layout` passes a jsdom test (`/** @vitest-environment jsdom */`) asserting the banner renders in demo mode and is absent otherwise.

- [ ] 34. Build the shared data-display and form component set.
      `src/components/shared/data-table.tsx` (client, `@tanstack/react-table`: sorting, global filter, column visibility, pagination, row selection — one generic component reused by every module), `src/components/shared/kpi-card.tsx`, `src/components/shared/empty-state.tsx`, `src/components/shared/page-header.tsx`, `src/components/shared/stat-delta.tsx`, `src/components/shared/confidence-badge.tsx`, `src/components/shared/explanation-panel.tsx` (renders `AIExplanation` steps/assumptions/traces/confidence/evidence), `src/components/shared/lineage-graph.tsx` (SVG provenance tree from item 15), `src/components/charts/{emissions-trend,scope-breakdown,pathway,macc,waterfall,heatmap}.tsx` (client, recharts), `src/components/shared/form/{form-field,submit-button,action-error}.tsx` (react-hook-form + `zodResolver` + `useActionState` wiring for the item-30 `ActionState`).
      Files: `src/components/shared/**`, `src/components/charts/**`
      Verify: `npm test -- src/components` passes jsdom tests for `data-table` (renders rows, filters, paginates), `kpi-card`, and `explanation-panel` (renders every step in order); `npm run lint` and `npm run build` pass.

- [ ] 35. Wire the core operations pages to real data and actions.
      Replace the hardcoded arrays in `organization/page.tsx` (7-level hierarchy tree + facility map via mapbox-gl, gated on `MAPBOX_ACCESS_TOKEN` with a graceful placeholder), `master-data/page.tsx` (tabbed data tables for products, raw materials, fuels, vehicles, refrigerants, suppliers, logistics routes, energy sources, waste types, water sources), and `activity-data/page.tsx` (entry table + create/edit dialog form + validation-rule results + data-quality scores + CSV import mapping UI backed by `DataImportJob`). Each page: `await connection()`, read via item-28 repositories, mutate via item-30 actions. Add `src/app/(dashboard)/organization/_components/`, `master-data/_components/`, `activity-data/_components/` for the client pieces.
      Files: `src/app/(dashboard)/{organization,master-data,activity-data}/page.tsx` + their `_components/**`
      Verify: `npm run build` passes and prints these three routes as `ƒ`; `npm test -- src/app/\(dashboard\)/activity-data` passes a jsdom test on the entry form asserting a validation error for a negative quantity; `npm run lint` passes.

- [ ] 36. Wire the emission engine, factor library, and analytics pages.
      `emission-engine/page.tsx`: calculation list, a "run calculation" form invoking `runCalculationAction`, per-scope results with the real inventory numbers from item 10, uncertainty band, calculation trace drawer, and the lineage graph. `emission-factors/page.tsx`: factor data table with version/validity filters, source and version browser, a factor-resolution "explain which factor applies" panel driven by item 6, and a unit-conversion tool. `analytics/page.tsx`: trend, scope breakdown, facility heatmap, intensity metrics, YoY waterfall — all computed from item 10/24 over the repository data.
      Files: `src/app/(dashboard)/{emission-engine,emission-factors,analytics}/page.tsx` + their `_components/**`
      Verify: `npm run build` passes; `npm test -- src/app/\(dashboard\)/emission-engine` passes a jsdom test asserting the scope totals rendered equal `buildInventory()` output for the fixture dataset (proving the UI shows computed, not hardcoded, numbers).

- [ ] 37. Wire the AI module pages.
      `ai-engine/page.tsx`: analysis list, anomaly feed from item 24 with severity badges and resolve action, data-gap table with estimated fills, recommendations, and the `explanation-panel` for any selected item. `ai-roadmap/page.tsx`: roadmap timeline, milestones, MACC chart from item 19, investment analysis table with NPV/IRR/payback, and the residual-gap callout. `ai-simulator/page.tsx`: scenario builder form (assumption levers), projection chart against the SBTi pathway from item 17, carbon-budget consumption, and side-by-side scenario comparison. `ai-agents/page.tsx`: agent registry, task queue, execution log with token/cost, tool catalogue from item 26, MCP server connections with health status, and a conversation panel showing the `isLlmConfigured()` state.
      Files: `src/app/(dashboard)/{ai-engine,ai-roadmap,ai-simulator,ai-agents}/page.tsx` + their `_components/**`
      Verify: `npm run build` passes; `npm test -- src/app/\(dashboard\)/ai-simulator` passes a jsdom test asserting the projected 2030 value for a NET_ZERO scenario matches `projectScenario()`; `npm run lint` passes.

- [ ] 38. Wire the compliance, finance, and system pages.
      `digital-mrv/page.tsx` (MRV plans, monitoring parameters, coverage gaps, measurement completeness, IoT device/reading and meter-reading views), `verification/page.tsx` (engagements, scopes, findings with severity rollup, corrective actions, evidence packages with hashes, audit trail viewer, materiality/opinion summary), `esg-disclosure/page.tsx` (framework cards with real completeness from item 21, requirement-by-requirement response editor, auto-populated numeric answers, report generation), `carbon-finance/page.tsx` (credit registry, retirement form, gross-vs-net emissions, ETS position, REC/PPA coverage, internal carbon price impact, price history chart), `security/page.tsx` (users, roles, permission matrix, API keys with create/revoke, sessions, access policies, audit log), `api-gateway/page.tsx` (endpoint catalogue generated from the item-31 handlers, API key management, rate-limit status, live `/api/v1/health` result), `settings/page.tsx` (organization profile, fiscal year, base currency, GWP version, consolidation approach, notification preferences, integration/env configuration status).
      Files: `src/app/(dashboard)/{digital-mrv,verification,esg-disclosure,carbon-finance,security,api-gateway,settings}/page.tsx` + their `_components/**`
      Verify: `npm run build` passes with all 18 dashboard routes plus the `/api/v1/*` routes present; `npm test -- src/app/\(dashboard\)/carbon-finance` passes a jsdom test asserting net emissions = gross − retired as rendered; `npm run lint` passes.

- [ ] 39. Complete the auth pages and root landing page.
      Add `forgot-password/page.tsx` and `reset-password/page.tsx` under `(auth)`, replace the dead `href="#"` "Forgot password?" link in `login/page.tsx`, add an "email not confirmed" resend path, surface a clear "Supabase가 구성되지 않았습니다" state when `NEXT_PUBLIC_SUPABASE_URL` is unset instead of a raw network error, and replace `src/app/page.tsx` with a real landing page that links to `/login` and (when a session exists) `/dashboard`.
      Files: `src/app/(auth)/{login,register,forgot-password,reset-password}/page.tsx`, `src/app/page.tsx`, `src/lib/supabase/client.ts` (add `isSupabaseConfigured()`)
      Verify: `npm test -- src/app/\(auth\)` passes jsdom tests asserting the unconfigured-Supabase notice renders and the reset form validates email format; `npm run build` and `npm run lint` pass.

## Phase 7 — Ops, docs, final verification

- [ ] 40. Add the CI workflow.
      `.github/workflows/ci.yml` — on push and pull_request: Node 22 with npm cache, `npm ci`, `npx prisma generate`, `npm run lint`, `npm run typecheck`, `npm test -- --coverage` (add `@vitest/coverage-v8` in this item), `npm run build`, and a `npx prisma validate` + migration-drift check (`prisma migrate diff … | diff - prisma/migrations/0_init/migration.sql`). Set placeholder env vars in the workflow so the build reproduces the demo-mode path.
      Files: `.github/workflows/ci.yml`, `package.json`
      Verify: run each workflow step locally in order and confirm all exit 0; `npx yamllint`-free sanity via `node -e "require('fs').readFileSync('.github/workflows/ci.yml','utf8')"` plus `npm test -- --coverage` producing a coverage summary.

- [ ] 41. Add container and environment configuration.
      Multi-stage `Dockerfile` (deps → build with `output: 'standalone'` added to `next.config.ts` → minimal runner on `node:22-alpine`, non-root user, `EXPOSE 3000`), `.dockerignore`, and an expanded `.env.example` documenting every variable the code actually reads (`DATABASE_URL`, `DIRECT_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`, `FIELD_ENCRYPTION_KEY`, `MAPBOX_ACCESS_TOKEN`, `REDIS_URL`, `NEXT_PUBLIC_APP_URL`) with a one-line comment each and which features degrade without it.
      Files: `Dockerfile`, `.dockerignore`, `.env.example`, `next.config.ts`
      Verify: `npm run build` still passes and emits `.next/standalone`; confirm every variable in `.env.example` is grepped from `src/` (a `src/lib/env.test.ts` test that parses `.env.example` and asserts each key appears in the codebase, and that no `process.env.X` in `src/` is missing from `.env.example`).

- [ ] 42. Generate the Korean Word document listing everything the user must do themselves.
      `scripts/generate-setup-guide.ts` using `docx@9` (Document/Paragraph/TextRun/Table/HeadingLevel/TableOfContents), writing `docs/CIOS-직접-설정-가이드.docx`. All body text in Korean. Required sections, each with numbered concrete steps, the exact commands/URLs, expected cost, and a "완료 확인 방법" line: (1) 사전 준비 및 로컬 실행, (2) Supabase 프로젝트 생성·인증 설정(이메일/Google/Microsoft OAuth 리다이렉트 URL 포함)·Storage 버킷, (3) PostgreSQL 프로비저닝 + `pgvector` 확장 활성화 + `DATABASE_URL`/`DIRECT_URL` 설정 + `npx prisma migrate deploy` + `npm run db:seed`, (4) OpenAI API 키 발급·모델 선택·사용량 한도 설정, (5) `FIELD_ENCRYPTION_KEY` 생성 및 키 관리, (6) Mapbox 토큰, (7) Redis(선택), (8) 배포(Vercel 또는 Docker) + 환경변수 등록 + 도메인/DNS/SSL, (9) 유료 배출계수 데이터 라이선스(ecoinvent, DEFRA/BEIS, IEA, EPA eGRID, Sphera 등 — 무엇이 유료이고 어디서 구매하는지), (10) 법적·검증 절차(제3자 검증기관 선정, ISO 14064-3 검증, SBTi 목표 제출, CDP/CSRD/ISSB 제출 일정, 국내 배출권거래제 등록), (11) 운영 항목(백업, 모니터링, 감사 로그 보존, 접근권한 정책), (12) 미구현/외부 의존 기능 목록 표(기능 · 현재 상태 · 사용자가 해야 할 일). Include a summary table mapping each env var to what breaks without it.
      Files: `scripts/generate-setup-guide.ts`, `docs/CIOS-직접-설정-가이드.docx`
      Verify: `npm run docs:setup-guide` exits 0 and `docs/CIOS-직접-설정-가이드.docx` exists; `node -e "const z=require('fs').readFileSync('docs/CIOS-직접-설정-가이드.docx');if(z[0]!==0x50||z[1]!==0x4b)throw new Error('not a zip/docx');console.log('ok',z.length)"` confirms a real OOXML (ZIP) file over 10 KB, not a renamed markdown file. Also add `scripts/generate-setup-guide.test.ts` asserting the section builder returns all 12 sections and that no section body is empty, verified by `npm test -- scripts`.

- [ ] 43. Rewrite the README and cross-reference the Korean guide.
      Replace the untouched `create-next-app` README with: project overview, the module map, the architecture layering from decision 1, the real commands (`dev`, `build`, `start`, `lint`, `typecheck`, `test`, `db:seed`, `docs:setup-guide`), how demo mode works and how to leave it, the env var table, testing strategy, and a prominent link to `docs/CIOS-직접-설정-가이드.docx` for everything requiring the user's own accounts and credentials. Update `AGENTS.md` with the layering rule ("domain must not import Prisma/Next/Supabase") and the test command.
      Files: `README.md`, `AGENTS.md`
      Verify: `npm run lint` passes; confirm every command listed in the README exists in `package.json` scripts by running each of `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run docs:setup-guide` successfully.

- [ ] 44. Final full verification and commit hygiene pass.
      Run the complete gate in order and fix anything that fails: `npx prisma validate`, `npx prisma generate`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run docs:setup-guide`, plus the migration-drift diff from item 2. Confirm `git status` is clean apart from intended files, that `.env`/`.env.local` are still untracked, that `docs/CIOS-직접-설정-가이드.docx` **is** tracked, and that the branch is `feat/cios-core-implementation` with incremental commits (one per plan item or phase, conventional-commit messages). Do not push.
      Files: none (verification only)
      Verify: all eight commands exit 0; `git log --oneline main..HEAD` shows the incremental commits; `git status --short` shows no unintended modifications.

---

## Notes, assumptions, and known gaps

- **Gap #7 (Organization god object) is not restructured.** Splitting a 32-relation model would require rewriting a validated 148-model schema and invalidating the item-2 baseline migration for no functional gain in this pass. Instead the *access* pattern is fixed: repositories select narrow field sets per module rather than eager-loading the organization graph. Record this as a documented deferral in the README architecture section.
- **pgvector (gap #5) stays unused.** No model has a vector column and adding one would require a live pgvector database to test embeddings meaningfully. The extension stays declared and the Korean guide covers enabling it; semantic search is listed in the doc's "미구현" table.
- **Assumption on emission factor values.** No paid factor library is licensed here, so seeded factors use publicly citable published values (IPCC 2006 GL default factors, US EPA eGRID/GHG Emission Factors Hub, UK DEFRA/BEIS conversion factors) with `EmissionFactorSource.url` and `publisher` populated. Every seeded factor must carry its citation. The guide tells the user which commercial libraries to license for production.
- **Assumption on Korean UI copy.** The application UI stays English (matching the existing 3,207 lines of built UI); only the deliverable document and user-facing configuration notices are Korean. If the user wants a Korean UI, that is a follow-on i18n task, and it is listed in the doc's "미구현" table.
- **Executing the seed and any real Prisma query cannot be verified here.** Every verification step above therefore relies on mocked Prisma or the demo-mode path. This is called out explicitly in the Korean guide so the user knows to run `prisma migrate deploy` + `npm run db:seed` as their first post-provisioning check.
