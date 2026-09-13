#!/usr/bin/env bash
# Builds every service image with the local Docker daemon, then loads each
# one into the Kind cluster's own internal containerd.
#
# Kind nodes don't share your host's Docker daemon — a Kind "node" is a
# Docker container running its own containerd inside it. Building an image
# with `docker build` only puts it in your HOST daemon's image store; the
# Kind node has never heard of it. `kind load docker-image` is the copy
# step that actually gets each image onto every node in the cluster so the
# scheduler can start pods from it — skip this and pods sit in
# `ImagePullBackOff` (or silently keep running a stale image) forever.
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
build_and_load chat-service services/chat-service/Dockerfile

echo "==> Building gateway (includes frontend build)"
docker build -f gateway/Dockerfile -t urbannes/gateway:latest .
echo "==> Loading gateway into Kind cluster '${CLUSTER_NAME}'"
kind load docker-image urbannes/gateway:latest --name "${CLUSTER_NAME}"

echo "==> All images built and loaded into Kind."
docker images | grep urbannes
