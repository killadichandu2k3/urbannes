#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER_NAME="${CLUSTER_NAME:-urbannes}"

build_and_load() {
  local name="$1"
  local dockerfile="$2"
  echo "==> Building ${name}"
  docker build -f "${dockerfile}" -t "urbannes/${name}:latest" .
  echo "==> Loading ${name} into Kind cluster '${CLUSTER_NAME}'"
  kind load docker-image "urbannes/${name}:latest" --name "${CLUSTER_NAME}"
}

build_and_load auth-api services/auth-api/Dockerfile
build_and_load booking-api services/booking-api/Dockerfile
build_and_load booking-worker services/booking-worker/Dockerfile
build_and_load analytics-api services/analytics-api/Dockerfile
build_and_load gateway-graphql services/gateway-graphql/Dockerfile
build_and_load notification-service services/notification-service/Dockerfile

echo "==> Building gateway (includes frontend build)"
docker build -f gateway/Dockerfile -t urbannes/gateway:latest .
echo "==> Loading gateway into Kind cluster '${CLUSTER_NAME}'"
kind load docker-image urbannes/gateway:latest --name "${CLUSTER_NAME}"

echo "==> All images built and loaded into Kind."
docker images | grep urbannes
