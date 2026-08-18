# ==============================================================================
# GMS Enterprise Backend Multi-Stage Container Architecture
# ==============================================================================
# Stage 1: Builder (Full build toolchain)
# Stage 2: Migrator (Tooling container with Prisma CLI, npm, npx & Migration Preflights)
# Stage 3: Prod-Deps (Prunes devDependencies to eliminate dev CVE surface)
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
# Stage 3: Production Dependencies Pruner
# ------------------------------------------------------------------------------
FROM builder AS prod_deps
WORKDIR /app
RUN npm prune --omit=dev

# ------------------------------------------------------------------------------
# Stage 4: Production Runtime (Zero npm/npx Minimal Alpine Container)
# ------------------------------------------------------------------------------
FROM alpine:3.21 AS runtime

RUN apk upgrade --no-cache && apk add --no-cache \
    libstdc++ \
    libgcc \
    postgresql-client \
    dumb-init \
    && addgroup -g 1000 node \
    && adduser -u 1000 -G node -s /bin/sh -D node

WORKDIR /app

# Copy exact Node 22 binary directly from builder (guarantees identical v8/node version with zero npm/npx footprint)
COPY --from=builder /usr/local/bin/node /usr/local/bin/node

# Copy production runtime bundle with native chown (strictly production node_modules from prod_deps stage)
COPY --chown=node:node --from=prod_deps /app/package*.json ./
COPY --chown=node:node --from=prod_deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist
COPY --chown=node:node --from=builder /app/prisma ./prisma
COPY --chown=node:node --from=builder /app/scripts ./scripts

RUN mkdir -p /app/uploads /app/backups/local /app/backups/nas /app/logs /home/node/.cache /home/node/.npm \
    && chown -R node:node /home/node /app/uploads /app/backups /app/logs

EXPOSE 3001

USER node

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/src/main"]
