# syntax=docker/dockerfile:1

ARG NODE_IMAGE=docker.io/library/node:22-alpine

FROM ${NODE_IMAGE} AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html styles.css vite.config.js ./
COPY src ./src
COPY assets ./assets

ARG APP_BASE=/
RUN npm run build -- --base="${APP_BASE}"

FROM ${NODE_IMAGE}

LABEL org.opencontainers.image.source="https://github.com/wl4g-games/mycf"

WORKDIR /app
ENV NODE_ENV=production \
    MYCF_WS_HOST=0.0.0.0 \
    MYCF_WS_PORT=8080 \
    MYCF_STATIC_ROOT=/app/dist

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY src ./src
COPY --from=build /app/dist ./dist

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

CMD ["node", "server/index.js"]
