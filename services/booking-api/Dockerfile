FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
COPY services/shared/package.json services/shared/
COPY services/booking-api/package.json services/booking-api/

RUN npm install --workspaces --include-workspace-root --ignore-scripts

COPY services/shared services/shared
COPY services/booking-api services/booking-api

RUN npm run build --workspace=@urbannes/shared
RUN npm run build --workspace=@urbannes/booking-api

RUN cp services/booking-api/src/graphql/schema.graphql services/booking-api/dist/graphql/schema.graphql

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/shared/dist ./services/shared/dist
COPY --from=build /app/services/shared/package.json ./services/shared/package.json
COPY --from=build /app/services/booking-api/dist ./services/booking-api/dist
COPY --from=build /app/services/booking-api/package.json ./services/booking-api/package.json

WORKDIR /app/services/booking-api
EXPOSE 4000
CMD ["node", "dist/server.js"]
