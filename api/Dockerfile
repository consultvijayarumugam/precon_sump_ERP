# Precon API (NestJS + Prisma). Built and run by deploy/docker-compose.yml.
# Dev dependencies stay in the image: the same image runs
# `prisma migrate deploy` and the production bootstrap (tsx) as one-off jobs.
FROM node:24-bookworm-slim

WORKDIR /app
# prisma.config.ts reads DATABASE_URL even for `prisma generate`; this
# placeholder is only for the build. The real one comes from .env.production.
ARG DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV DATABASE_URL=${DATABASE_URL}

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund

COPY . .
RUN npx prisma generate && npm run build \
  && mkdir -p /app/storage/library && chown -R node:node /app/storage

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    FILE_STORAGE_DIR=/app/storage/library
USER node
EXPOSE 4000
CMD ["node", "dist/main"]
