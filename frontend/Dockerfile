FROM node:20-alpine AS build
WORKDIR /app
COPY frontend/package.json ./frontend/
RUN cd frontend && npm install
COPY frontend ./frontend

RUN cd frontend && npm run build

FROM scratch AS export
COPY --from=build /app/frontend/dist /dist
