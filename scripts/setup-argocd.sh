#!/usr/bin/env bash
# Installs ArgoCD into the Kind cluster, then registers UrbanNes as an
# ArgoCD Application with automated sync (prune + self-heal) turned on —
# see k8s-argocd/README-argocd.md and application.yaml's syncPolicy.
# ArgoCD is now the real deploy path: it applies k8s/ to the cluster and
# reverts drift automatically, including a pod deleted by hand — delete a
# pod via `kubectl delete pod` or the ArgoCD UI and self-heal recreates it
# from the Deployment's desired replica count within seconds, same as it
# always would have; deleting the DEPLOYMENT itself in k8s/ and letting
# ArgoCD sync is how you actually remove something for good.
#
# This is still separate from deploy-kind.sh on purpose: ArgoCD is
# cluster tooling (like metrics-server was), installed once, that then
# takes over continuous reconciliation of the urbannes namespace.
set -euo pipefail
cd "$(dirname "$0")/.."

CLUSTER_NAME="${CLUSTER_NAME:-urbannes}"

if ! kind get clusters 2>/dev/null | grep -qx "${CLUSTER_NAME}"; then
  echo "ERROR: Kind cluster '${CLUSTER_NAME}' doesn't exist yet."
  echo "Run ./scripts/deploy-kind.sh first."
  exit 1
fi

kubectl config use-context "kind-${CLUSTER_NAME}"

echo "==> Creating argocd namespace"
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -

echo "==> Installing ArgoCD (this pulls several images — first run takes a few minutes)"
kubectl apply --server-side --force-conflicts -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

echo "==> Waiting for ArgoCD server to be ready"
kubectl wait --for=condition=available deployment/argocd-server -n argocd --timeout=300s

echo "==> Starting the in-cluster git-server (ArgoCD's Git source — see k8s-argocd/README-argocd.md)"
kubectl apply -f k8s-argocd/git-server.yaml
kubectl wait --for=condition=ready pod/git-server -n argocd --timeout=120s

echo "==> Registering UrbanNes as an ArgoCD Application (automated sync: prune + self-heal)"
kubectl apply -f k8s-argocd/application.yaml

echo "==> Waiting for the first sync to apply k8s/ to the urbannes namespace"
kubectl wait --for=jsonpath='{.status.sync.status}'=Synced application/urbannes -n argocd --timeout=180s || \
  echo "    (still syncing — check with: kubectl get application urbannes -n argocd)"

echo "==> Exposing the ArgoCD UI on https://localhost:8090"
# ArgoCD's server Service defaults to ClusterIP — kubectl port-forward is
# the simplest way to reach it from your host without editing the Service
# or adding another Kind extraPortMapping. This runs in the background so
# the script can finish; kill it later with the PID printed below, or just
# close your terminal / restart Docker.
kubectl port-forward svc/argocd-server -n argocd 8090:443 >/tmp/argocd-port-forward.log 2>&1 &
PF_PID=$!
sleep 2

echo "==> Fetching the initial admin password"
ARGOCD_PASSWORD=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d)

echo ""
echo "==> ArgoCD is up and managing deploys."
echo ""
echo "    URL:      https://localhost:8090"
echo "    Username: admin"
echo "    Password: ${ARGOCD_PASSWORD}"
echo ""
echo "    (Your browser will warn about a self-signed certificate —"
echo "    that's ArgoCD's default local dev cert, safe to click through.)"
echo ""
echo "    Port-forward running in background as PID ${PF_PID}."
echo "    Stop it any time with: kill ${PF_PID}"
echo ""
echo "==> Change the admin password once logged in (optional, local-only cluster):"
echo "    argocd account update-password"
echo ""
echo "==> If you edit files under k8s/ later, the git-server won't see the"
echo "    change until its bare repo is reseeded. Restart it with:"
echo "    kubectl delete pod git-server -n argocd && kubectl apply -f k8s-argocd/git-server.yaml"
echo "    ArgoCD then picks up the change on its own within its poll interval"
echo "    (default ~3 minutes), or hit Refresh + Sync in the UI for an"
echo "    immediate apply — no more manual kubectl apply -k needed."
echo ""
echo "==> Try it: delete a pod and watch ArgoCD bring it back"
echo "    kubectl delete pod -n urbannes -l app=auth-api --field-selector=status.phase=Running -o name | head -1 | xargs kubectl delete -n urbannes"
echo "    (or just click the pod in the ArgoCD UI and hit Delete)"
echo "    Self-heal notices the drift and recreates it from the Deployment's"
echo "    desired replica count, usually within a few seconds."
echo ""
