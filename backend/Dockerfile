FROM node:24-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --filter backend
COPY backend backend
RUN pnpm --filter backend build

FROM node:24-alpine
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/
RUN pnpm install --prod --frozen-lockfile --filter backend
COPY --from=build /repo/backend/dist backend/dist
COPY backend/drizzle backend/drizzle
WORKDIR /repo/backend
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
