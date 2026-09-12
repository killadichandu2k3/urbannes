# Multi-stage build: build in a full node image, run in a slim one.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
COPY services/shared/package.json services/shared/
COPY services/analytics-api/package.json services/analytics-api/

RUN npm install --workspaces --include-workspace-root --ignore-scripts

COPY services/shared services/shared
COPY services/analytics-api services/analytics-api

RUN npm run build --workspace=@urbannest/shared
RUN npm run build --workspace=@urbannest/analytics-api
RUN cp services/analytics-api/src/graphql/schema.graphql services/analytics-api/dist/graphql/schema.graphql

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/shared/dist ./services/shared/dist
COPY --from=build /app/services/shared/package.json ./services/shared/package.json
COPY --from=build /app/services/analytics-api/dist ./services/analytics-api/dist
COPY --from=build /app/services/analytics-api/package.json ./services/analytics-api/package.json

WORKDIR /app/services/analytics-api
EXPOSE 4300
CMD ["node", "dist/server.js"]
