# Multi-stage build: build in a full node image, run in a slim one.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
COPY services/shared/package.json services/shared/
COPY services/gateway-graphql/package.json services/gateway-graphql/

RUN npm install --workspaces --include-workspace-root --ignore-scripts

COPY services/shared services/shared
COPY services/gateway-graphql services/gateway-graphql

RUN npm run build --workspace=@urbannest/shared
RUN npm run build --workspace=@urbannest/gateway-graphql

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/shared/dist ./services/shared/dist
COPY --from=build /app/services/shared/package.json ./services/shared/package.json
COPY --from=build /app/services/gateway-graphql/dist ./services/gateway-graphql/dist
COPY --from=build /app/services/gateway-graphql/package.json ./services/gateway-graphql/package.json

WORKDIR /app/services/gateway-graphql
EXPOSE 4500
CMD ["node", "dist/server.js"]
