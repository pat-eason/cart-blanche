# syntax=docker/dockerfile:1
# Build context is the repo root (pnpm workspace).
FROM node:24-alpine AS build
RUN npm i -g pnpm@10.33.0
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @cart-blanche/web...
COPY apps/web apps/web
# Public URL prefix the app is served under (e.g. /cart-blanche/). Must start and end with a slash.
ARG BASE_PATH=/
ENV VITE_BASE=$BASE_PATH
RUN pnpm --filter @cart-blanche/web build

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
