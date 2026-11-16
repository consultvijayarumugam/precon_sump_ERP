# Precon web (Next.js). Built and run by deploy/docker-compose.yml.
# The browser calls /api/v1 on this same origin; this server forwards it to the
# API container over the private Docker network (see next.config.ts).
FROM node:24-bookworm-slim

WORKDIR /app
ARG API_PROXY_TARGET=http://precon-api:4000
ENV API_PROXY_TARGET=${API_PROXY_TARGET} \
    NEXT_PUBLIC_API_URL=/api/v1 \
    NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# The server writes its cache under .next at runtime, so it must own it.
RUN npm run build && chown -R node:node /app/.next

ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["npx", "next", "start", "-H", "0.0.0.0", "-p", "3000"]
