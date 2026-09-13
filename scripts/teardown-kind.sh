#!/usr/bin/env bash
# Removes everything this project deployed, without touching the Kind
# cluster itself (so other projects/clusters on your machine are left
# alone). Use `kind delete cluster --name urbannes` separately if you
# want to remove the whole cluster.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Deleting urbannes namespace (this removes every resource in it, including PVCs/data)"
kubectl delete namespace urbannes --ignore-not-found

echo "==> Done. Run 'kind delete cluster --name urbannes' if you also want to remove the whole cluster."
