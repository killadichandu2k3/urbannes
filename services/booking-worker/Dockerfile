FROM node:20-alpine AS build
WORKDIR /app

COPY package.json ./
COPY services/shared/package.json services/shared/
COPY services/booking-worker/package.json services/booking-worker/

RUN npm install --workspaces --include-workspace-root --ignore-scripts

COPY services/shared services/shared
COPY services/booking-worker services/booking-worker

RUN npm run build --workspace=@urbannes/shared
RUN npm run build --workspace=@urbannes/booking-worker
# Copy SQL assets into dist (tsc doesn't copy non-.ts files)
RUN mkdir -p services/booking-worker/dist/db
RUN cp services/booking-worker/src/db/schema.sql services/booking-worker/dist/db/schema.sql
RUN cp services/booking-worker/src/db/seed.sql services/booking-worker/dist/db/seed.sql

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/services/shared/dist ./services/shared/dist
COPY --from=build /app/services/shared/package.json ./services/shared/package.json
COPY --from=build /app/services/booking-worker/dist ./services/booking-worker/dist
COPY --from=build /app/services/booking-worker/package.json ./services/booking-worker/package.json

WORKDIR /app/services/booking-worker
CMD ["node", "dist/worker.js"]
