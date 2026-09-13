FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
COPY services/shared/package.json services/shared/
COPY services/notification-service/package.json services/notification-service/

RUN npm install --workspaces --include-workspace-root --ignore-scripts

COPY services/shared services/shared
COPY services/notification-service services/notification-service

RUN npm run build --workspace=@urbannes/shared
RUN npm run build --workspace=@urbannes/notification-service

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/shared/dist ./services/shared/dist
COPY --from=build /app/services/shared/package.json ./services/shared/package.json
COPY --from=build /app/services/notification-service/dist ./services/notification-service/dist
COPY --from=build /app/services/notification-service/package.json ./services/notification-service/package.json

WORKDIR /app/services/notification-service
EXPOSE 4100
CMD ["node", "dist/worker.js"]
