# Why this folder exists

ArgoCD's `Application` resource only knows how to read from a Git (or
Helm) repository — there is no supported "point me at a local folder"
source (this is a long-standing, still-open upstream request:
argoproj/argo-cd#13552). So to run this fully local/offline (no GitHub
push, no external Git host required), something has to actually be a Git
repo that ArgoCD can reach over the network from inside the cluster.

That's what `git-server.yaml` is: a **tiny Git server running inside the
Kind cluster itself**, seeded from your own working copy of `k8s/` via a
Kind `extraMounts` hostPath (see `kind-config.yaml`).

## What's actually running

- **`git-server.yaml`** — a single Pod, pinned to the control-plane node
  (the only node with the hostPath mount), running plain `git` in a
  small Alpine container. On every start, it reseeds a bare repo from the
  mounted `k8s/` folder and force-pushes it to `main`, then serves it
  read-only over the Git protocol (port 9418) — no auth, no HTTP, no
  extra server software, since this never leaves the cluster network.
- **`application.yaml`** — the ArgoCD `Application` object pointing at
  `git://git-server.argocd.svc.cluster.local/urbannest.git`, path `k8s`,
  with `syncPolicy.automated` turned on: `prune: true` and
  `selfHeal: true`.

## ArgoCD is the real deploy path

`prune` and `selfHeal` together are what make ArgoCD an actual GitOps
controller instead of a read-only dashboard:

- **`selfHeal: true`** — any drift between the live cluster and what
  `k8s/` says gets reverted automatically, usually within seconds. Delete
  a pod by hand (`kubectl delete pod`) or from the ArgoCD UI, and ArgoCD
  notices the Deployment now has fewer ready replicas than it wants and
  recreates it — this is normal Kubernetes Deployment behavior underneath,
  but self-heal is what makes ArgoCD actively watch for and correct any
  OTHER kind of manual drift too (a `kubectl edit`, a `kubectl scale`),
  not just missing pods.
- **`prune: true`** — if you remove a resource from `k8s/` (delete a
  Deployment from a kustomization, say), ArgoCD deletes the corresponding
  live object on its next sync instead of leaving it orphaned.

Because of this, `scripts/deploy-kind.sh` no longer runs
`kubectl apply -k k8s/` itself — see its own header comment for why
running that AND ArgoCD's automated sync at the same time would be two
systems fighting over the same namespace, the exact double-ownership
problem GitOps setups exist to avoid. ArgoCD (via `setup-argocd.sh`) is
now the one thing that applies `k8s/` to the cluster.

## Your edit loop

1. Edit files under `k8s/` on disk, same as always.
2. Restart the git-server so it reseeds from your changes:
   ```
   kubectl delete pod git-server -n argocd && kubectl apply -f k8s-argocd/git-server.yaml
   ```
3. ArgoCD picks up the change on its own within its poll interval
   (a few minutes by default), or click **Refresh** then **Sync** in the
   ArgoCD UI (https://localhost:8090) for an immediate apply.

This restart-to-reseed step is this project's local, offline stand-in for
"commit and push" — a real deployment would point `application.yaml` at
an actual Git remote (GitHub, GitLab, etc.) and skip `git-server.yaml`
entirely; every commit pushed to `main` would then reach ArgoCD the same
way a `kubectl apply -k` change does here, just through your normal `git
push` instead of a pod restart.

## Application-level images vs. manifest-level GitOps

One thing ArgoCD's sync does NOT do: rebuild your Docker images. Editing
application code (a `.ts` file, not a `k8s/*.yaml` file) still needs
`./scripts/build-images.sh` to build and load the new image into Kind,
followed by a `kubectl rollout restart` to make the affected Deployment
actually pick it up (every Deployment here uses `image: ...:latest` +
`imagePullPolicy: IfNotPresent`, so a same-tag image swap alone produces
no spec diff for ArgoCD — or plain `kubectl` — to notice). `deploy-kind.sh`
still does this restart step for you; it's unrelated to whether ArgoCD or
`kubectl apply` applied the manifest that describes the Deployment.
