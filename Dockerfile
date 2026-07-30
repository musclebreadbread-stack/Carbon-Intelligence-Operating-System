# Carbon Intelligence Operating System — production image.
#
# Three stages: dependency install, build (Next.js `output: 'standalone'`), and a
# minimal runner that carries no build tooling. See
# docs/CIOS-직접-설정-가이드.docx section 8 for the deployment procedure and the
# environment variables to register.

# --- deps ---------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app

# The postinstall script runs `prisma generate`, so the schema must be present
# before `npm ci`.
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# --- builder ------------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# No database, Supabase project or API key is available at image-build time.
# Placeholder values keep the build on the demo-mode path; the real values are
# supplied at container start, and every page reads them per request because
# pages call `await connection()` rather than prerendering.
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public
ENV NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder

RUN npx prisma generate && npm run build

# --- runner -------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# `server.js` does not serve `public` or `.next/static` itself unless they are
# copied next to it (see next/dist/docs .../next-config-js/output.md).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Kept so `npx prisma migrate deploy` can be run from this image as a release
# step before the first start.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
