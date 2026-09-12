# Stage 1: build the Angular frontend into static assets.
FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json ./frontend/
RUN cd frontend && npm install
COPY frontend ./frontend
RUN cd frontend && npm run build

# Stage 2: NGINX serving the built frontend + acting as reverse
# proxy/load-balancer/rate-limiter for every backend service.
FROM nginx:1.27-alpine
COPY gateway/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --from=frontend-build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
