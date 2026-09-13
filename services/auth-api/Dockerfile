# Multi-stage build: build in a full node image, run in a slim one.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
COPY services/shared/package.json services/shared/
COPY services/auth-api/package.json services/auth-api/

RUN npm install --workspaces --include-workspace-root --ignore-scripts

COPY services/shared services/shared
COPY services/auth-api services/auth-api

RUN npm run build --workspace=@urbannes/shared
RUN npm run build --workspace=@urbannes/auth-api
RUN cp services/auth-api/src/graphql/schema.graphql services/auth-api/dist/graphql/schema.graphql

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/shared/dist ./services/shared/dist
COPY --from=build /app/services/shared/package.json ./services/shared/package.json
COPY --from=build /app/services/auth-api/dist ./services/auth-api/dist
COPY --from=build /app/services/auth-api/package.json ./services/auth-api/package.json

WORKDIR /app/services/auth-api
EXPOSE 4600
CMD ["node", "dist/server.js"]
