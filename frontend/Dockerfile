FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json ./frontend/
RUN cd frontend && npm install
COPY frontend ./frontend
# `npm run build` -> `ng build` (Angular CLI) as of the Angular rewrite —
# still outputs to frontend/dist (see angular.json outputPath), so the
# COPY below and gateway/Dockerfile's consuming stage are unchanged.
RUN cd frontend && npm run build

# The gateway image (NGINX) is what actually SERVES these static files in
# a production-like run — see gateway/Dockerfile, which copies from this
# stage's output via a multi-stage COPY --from=frontend-build.
FROM scratch AS export
COPY --from=build /app/frontend/dist /dist
