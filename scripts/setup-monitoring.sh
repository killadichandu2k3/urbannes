#!/usr/bin/env bash
# Installs metrics-server into the Kind cluster.
#
# This is cluster-wide infrastructure, not part of the urbannest app itself
# — it's what feeds CPU/memory numbers to `kubectl top` and the HPAs in
# k8s/. Without it, `kubectl top` errors out and HPA has no CPU metric to
# scale on.
#
# Kind's nodes use kubelet certificates metrics-server doesn't trust out of
# the box (upstream metrics-server expects a real cert chain; Kind's is
# self-signed per-node) — so this script applies the standard upstream
# manifest, then patches in --kubelet-insecure-tls, which is the documented,
# safe-for-local-dev fix (never do this on a real cluster).
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER_NAME="${CLUSTER_NAME:-urbannest}"

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
echo "    kubectl top pods -n urbannest"
echo ""
