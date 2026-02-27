FROM node:24-bookworm-slim AS builder

WORKDIR /app

# Native modules (e.g. better-sqlite3) may compile on Node 24 in CI.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY scripts ./scripts
RUN npm install

COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:24-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

# ffmpeg is required for audio conversion/splitting in Protokoll pipelines.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 8080

# Cloud Run provides PORT; server-hono also supports MCP_PORT/PROTOKOLL_MCP_PORT.
CMD ["node", "dist/mcp/server-hono.js", "--host", "0.0.0.0"]
