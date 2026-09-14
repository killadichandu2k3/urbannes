#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER_NAME="${CLUSTER_NAME:-urbannes}"

if ! kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  echo "ERROR: Kind cluster '${CLUSTER_NAME}' doesn't exist yet."
  echo "Run ./scripts/deploy-kind.sh first."
  exit 1
fi

kubectl config use-context "kind-${CLUSTER_NAME}"

echo "==> Installing metrics-server"
kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml

echo "==> Patching metrics-server for Kind's self-signed kubelet certs"
kubectl patch deployment metrics-server -n kube-system --type=json \
  -p='[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]'

echo "==> Waiting for metrics-server to become available"
kubectl wait --for=condition=available deployment/metrics-server -n kube-system --timeout=120s

echo ""
echo "==> Done. Metrics take ~30-60s to start flowing. Check with:"
echo ""
echo "    kubectl top nodes"
echo "    kubectl top pods -n urbannes"
echo ""
