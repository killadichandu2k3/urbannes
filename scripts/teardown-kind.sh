#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Deleting urbannes namespace (this removes every resource in it, including PVCs/data)"
kubectl delete namespace urbannes --ignore-not-found

echo "==> Done. Run 'kind delete cluster --name urbannes' if you also want to remove the whole cluster."
