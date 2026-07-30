<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Project rules

## Layering (non-negotiable)

`src/lib/domain`, `src/lib/core`, `src/lib/reference` and `src/lib/ai` are pure TypeScript and must
**never** import `@prisma/client`, `next/*` or `@supabase/*`. All calculation belongs there; define
local structural types (`EmissionFactorLike`, …) instead of reaching for Prisma types. Persistence
lives in `src/lib/data/**`, mutations in `src/lib/actions/**`, route handlers in
`src/app/api/v1/**`. This is what makes the engines testable without a database.

Related conventions:

- Pages opt out of prerendering with `await connection()` in the page component, not
  `export const dynamic`. Never call it from a repository.
- Repository reads go through `withDb(fn, fallback)` so a missing or unreachable database degrades
  to the fixture dataset (demo mode) instead of failing the render. Mutations must refuse with
  `DEMO_MODE`, never fake success.
- Randomness in domain code uses the seeded `mulberry32` PRNG, never `Math.random()`.
- Do not modify `prisma/schema.prisma` without regenerating `prisma/migrations/0_init/migration.sql`
  (`npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script`); CI
  compares their digests.
- Every environment variable read from `src/**` must be documented in `.env.example`;
  `src/lib/env.test.ts` enforces both directions.

## Commands

```bash
npm test                     # vitest run — the whole suite
npm test -- src/lib/domain   # path-filtered subset
npm run lint
npm run typecheck
npm run build
npm run docs:setup-guide     # regenerates docs/CIOS-직접-설정-가이드.docx
```

Tests co-locate as `*.test.ts` beside the source; jsdom is opt-in per file with
`/** @vitest-environment jsdom */`.
