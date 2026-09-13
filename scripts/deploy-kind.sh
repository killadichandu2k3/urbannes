#!/usr/bin/env bash
# Bootstraps the Kind cluster and hands deployment off to ArgoCD.
# ----------------------------------------------------------------------------
# ArgoCD (with automated sync + self-heal — see k8s-argocd/application.yaml)
# is now the one thing that applies k8s/ to the cluster. This script no
# longer runs `kubectl apply -k k8s/` itself: doing so AND running ArgoCD's
# automated sync would be two systems reconciling the same namespace,
# which is exactly the double-ownership problem GitOps setups exist to
# avoid. Instead, this script creates the cluster, builds + loads images,
# and installs/registers ArgoCD (via setup-argocd.sh) if it isn't already
# running — ArgoCD's own sync loop takes it from there.
#
# After the FIRST run, your normal loop is: edit code -> ./scripts/
# build-images.sh -> restart git-server (see k8s-argocd/README-argocd.md)
# -> ArgoCD picks up the change within its poll interval (or hit Refresh/
# Sync in the UI for an immediate apply).
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER_NAME="${CLUSTER_NAME:-urbannes}"

echo "==> Checking Kind cluster status"
if ! kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  echo "Kind cluster '${CLUSTER_NAME}' doesn't exist. Creating it..."
  kind create cluster --config kind-config.yaml
else
  echo "Kind cluster '${CLUSTER_NAME}' already exists."
fi

kubectl config use-context "kind-${CLUSTER_NAME}"

./scripts/build-images.sh

echo "==> Ensuring the urbannes namespace + base cluster resources exist"
# ArgoCD applies k8s/ (which includes base/namespace.yaml) once it syncs,
# but the FIRST sync needs the argocd namespace/CRDs already installed —
# so this bootstraps ArgoCD itself if it isn't running yet, then lets its
# sync loop apply everything under k8s/.
if ! kubectl get deployment argocd-server -n argocd >/dev/null 2>&1; then
  echo "==> ArgoCD not found — installing it now (see scripts/setup-argocd.sh)"
  ./scripts/setup-argocd.sh
else
  echo "==> ArgoCD already installed — triggering a sync of the urbannes Application"
  kubectl patch application urbannes -n argocd --type merge \
    -p '{"operation":{"sync":{"revision":"HEAD"}}}' >/dev/null 2>&1 || true
fi

echo "==> Waiting for Postgres to be ready (this can take a minute on first run)"
kubectl wait --for=condition=ready pod -l app=postgres -n urbannes --timeout=180s

echo "==> Waiting for the cache Redis to be ready"
kubectl wait --for=condition=ready pod -l app=redis-cache -n urbannes --timeout=180s

echo "==> Waiting for Kafka to be ready"
kubectl wait --for=condition=available deployment/kafka -n urbannes --timeout=180s

# Every app Deployment uses `image: ...:latest` + `imagePullPolicy:
# IfNotPresent` — on a re-run of this script (not a fresh cluster), the
# manifest content is unchanged even though build-images.sh just loaded a
# newer image into Kind's node, so ArgoCD's own sync sees no spec diff and
# won't reschedule pods on its own. Forcing a restart here makes this
# script safe and correct to re-run any time you've changed code, not
# just on first setup — same fix CD applies automatically (see
# .github/workflows/cd.yml). This is a plain `kubectl rollout restart`,
# not a manifest edit, so it doesn't conflict with ArgoCD's self-heal —
# self-heal reverts unwanted DRIFT from what git says, and a rollout
# restart doesn't change any pod's desired spec.
echo "==> Restarting app deployments to pick up freshly-loaded images"
kubectl rollout restart deployment/auth-api -n urbannes
kubectl rollout restart deployment/booking-api -n urbannes
kubectl rollout restart deployment/booking-worker -n urbannes
kubectl rollout restart deployment/analytics-api -n urbannes
kubectl rollout restart deployment/gateway-graphql -n urbannes
kubectl rollout restart deployment/notification-service -n urbannes
kubectl rollout restart deployment/chat-service -n urbannes
kubectl rollout restart deployment/gateway -n urbannes

echo "==> Waiting for application services to be ready"
kubectl wait --for=condition=available deployment/auth-api -n urbannes --timeout=180s
kubectl wait --for=condition=available deployment/booking-api -n urbannes --timeout=180s
kubectl wait --for=condition=available deployment/analytics-api -n urbannes --timeout=180s
kubectl wait --for=condition=available deployment/gateway-graphql -n urbannes --timeout=180s
kubectl wait --for=condition=available deployment/notification-service -n urbannes --timeout=180s
kubectl wait --for=condition=available deployment/chat-service -n urbannes --timeout=180s
kubectl wait --for=condition=available deployment/gateway -n urbannes --timeout=180s

echo ""
echo "==> Deployed. The NGINX gateway's NodePort (30000) is the public"
echo "    entrypoint now (Kong has been removed), mapped to your host via"
echo "    kind-config.yaml:"
echo ""
echo "    http://localhost:30000"
echo ""
echo "==> Node spread — confirm pods actually landed on different nodes"
echo "    (this cluster runs 1 control-plane + 2 workers, see kind-config.yaml):"
echo ""
kubectl get pods -n urbannes -o wide | awk '{printf "%-28s %-18s %s\n", $1, $7, $3}'
echo ""
