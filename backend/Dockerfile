FROM node:22-alpine AS builder

# Install build dependencies for native modules (argon2, bcrypt)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-alpine

# Install postgresql-client for native pg_dump backup & restore capabilities
RUN apk add --no-cache postgresql-client

WORKDIR /app

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3001

RUN mkdir -p /app/uploads /app/backups/local /app/backups/nas && chown -R node:node /app/uploads /app/backups

USER node

CMD ["npm", "run", "start:prod"]
