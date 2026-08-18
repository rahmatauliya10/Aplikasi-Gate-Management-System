# ==============================================================================
# GMS Enterprise Backend Multi-Stage Container Architecture
# ==============================================================================
# Stage 1: Builder (Full build toolchain)
# Stage 2: Migrator (Tooling container with Prisma CLI, npm, npx & Migration Preflights)
# Stage 3: Prod-Deps (Pristine production-only dependencies without dev CVE footprint)
# Stage 4: Runtime (Ultra-minimal Alpine container with zero npm/npx attack surface)
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Builder
# ------------------------------------------------------------------------------
FROM node:22-alpine AS builder

# Install native compilation toolchain for argon2 / bcrypt
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Migrator (Prisma CLI & Schema Deployment Operator Container)
# ------------------------------------------------------------------------------
FROM node:22-alpine AS migrator

RUN apk upgrade --no-cache && apk add --no-cache postgresql-client dumb-init

WORKDIR /app

# High-speed native chown copy avoids slow recursive layer chmod
COPY --chown=node:node --from=builder /app/package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/scripts ./scripts

RUN mkdir -p /app/uploads /app/backups/local /app/backups/nas /app/logs /home/node/.cache /home/node/.npm \
    && chown -R node:node /home/node /app/uploads /app/backups /app/logs

USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["npx", "prisma", "migrate", "deploy"]

# ------------------------------------------------------------------------------
# Stage 3: Pristine Production Dependencies (Zero devDependencies footprint)
# ------------------------------------------------------------------------------
FROM node:22-alpine AS prod_deps

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./

# Install exclusively production dependencies (skipping dev postinstall hook)
RUN npm ci --omit=dev --ignore-scripts

# Copy generated Prisma engine & client artifacts directly from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# ------------------------------------------------------------------------------
# Stage 4: Production Runtime (Zero npm/npx Hardened Node 22 Alpine Container)
# ------------------------------------------------------------------------------
FROM node:22-alpine AS runtime

RUN apk upgrade --no-cache && apk add --no-cache \
    postgresql-client \
    dumb-init \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

WORKDIR /app

# Copy production runtime bundle with native chown (strictly production node_modules from prod_deps stage)
COPY --chown=node:node --from=prod_deps /app/package*.json ./
COPY --chown=node:node --from=prod_deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/scripts ./scripts

RUN mkdir -p /app/uploads /app/backups/local /app/backups/nas /app/logs /home/node/.cache \
    && chown -R node:node /home/node /app/uploads /app/backups /app/logs

EXPOSE 3001

USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main"]
