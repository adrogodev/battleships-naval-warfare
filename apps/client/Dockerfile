# syntax=docker/dockerfile:1
# Client: production build served by nginx. Build context is the repository root:
#   docker build -f apps/client/Dockerfile --build-arg VITE_SERVER_URL=http://localhost:3001 .
FROM node:24-alpine AS build
RUN npm install -g pnpm@10.7.1
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/client/package.json apps/client/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY apps/client apps/client

ARG VITE_SERVER_URL=http://localhost:3001
ENV VITE_SERVER_URL=${VITE_SERVER_URL}
RUN pnpm --filter @battleships/client build

FROM nginx:1.27-alpine
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 80
