FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
COPY services/shared/package.json services/shared/
COPY services/chat-service/package.json services/chat-service/

RUN npm install --workspaces --include-workspace-root --ignore-scripts

COPY services/shared services/shared
COPY services/chat-service services/chat-service

RUN npm run build --workspace=@urbannest/shared
RUN npm run build --workspace=@urbannest/chat-service

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/shared/dist ./services/shared/dist
COPY --from=build /app/services/shared/package.json ./services/shared/package.json
COPY --from=build /app/services/chat-service/dist ./services/chat-service/dist
COPY --from=build /app/services/chat-service/package.json ./services/chat-service/package.json

WORKDIR /app/services/chat-service
EXPOSE 4200
CMD ["node", "dist/server.js"]
