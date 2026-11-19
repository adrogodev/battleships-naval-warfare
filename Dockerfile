# syntax=docker/dockerfile:1
# Multiplayer server (Node + Socket.IO). Runs the TypeScript sources with tsx,
# the same way `pnpm --filter @battleships/server start` does locally.
FROM node:24-alpine
RUN npm install -g pnpm@10.7.1
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/server apps/server

ENV NODE_ENV=production PORT=3001
EXPOSE 3001
USER node
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:${PORT}/health > /dev/null || exit 1
CMD ["pnpm", "--filter", "@battleships/server", "start"]
