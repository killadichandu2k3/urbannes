# Self-hosted GitHub Actions runner (for the CD workflow)

CI (`.github/workflows/ci.yml`) runs entirely on GitHub-hosted runners — no
setup needed. CD (`.github/workflows/cd.yml`) deploys to **your Kind
cluster**, which only exists on your laptop, so it needs a runner that lives
on your laptop too. This is the standard, supported way to let GitHub Actions
reach a private/local environment.

**`./scripts/setup-git-and-ci.sh` automates everything below except the
registration token itself** (which GitHub issues per-repo from its web UI
and expires in about an hour, so no script can fetch it for you) — run
that script first; the steps below are the same steps it walks you
through, kept here for reference and for anything you'd rather do by hand.

## 1. Register the runner

In your GitHub repo: **Settings -> Actions -> Runners -> New self-hosted runner**,
pick your OS, and follow GitHub's generated commands — they look like:

```bash
mkdir actions-runner && cd actions-runner
curl -o actions-runner.tar.gz -L https://github.com/actions/runner/releases/download/vX.Y.Z/actions-runner-<os>-x64-X.Y.Z.tar.gz
tar xzf actions-runner.tar.gz
./config.sh --url https://github.com/<you>/<repo> --token <TOKEN_FROM_GITHUB_UI>
```

When `config.sh` asks for **labels**, add `kind` (in addition to the
defaults) — the CD workflow targets `runs-on: [self-hosted, kind]`
specifically so it never accidentally runs on some other self-hosted
runner you might add later.

## 2. Run it

For a quick test:
```bash
./run.sh
```

To keep it running persistently (recommended — install as a background service):
```bash
sudo ./svc.sh install
sudo ./svc.sh start
```

The runner now sits idle, polling GitHub for jobs labeled `self-hosted` +
`kind`. It only does work when a workflow run targets it — it's not
exposing any inbound port, so this is safe to leave running.

## 3. Require the tools the CD job uses

The runner executes on your actual machine, using your actual installed
tools — make sure these are on PATH for the user the runner service runs as:
- `docker` (with the daemon running)
- `kind` (with a cluster already created — `kind create cluster --config kind-config.yaml --name urbannes`)
- `kubectl`

## 4. Add the manual-approval gate

This is the important safety step — without it, CD would deploy to your
laptop automatically on every merge to `main`, with no chance to say no.

**Settings -> Environments -> New environment** -> name it `production-local`
(matching `environment: production-local` in `cd.yml`) -> **Required
reviewers** -> add yourself.

Now every CD run pauses and waits for you to click **Review deployments ->
Approve** in the GitHub Actions UI before it touches your Kind cluster,
even though the trigger (a successful CI run on `main`) is fully automatic.

## 5. What actually happens on deploy

1. CI passes on `main` (typecheck, builds, image builds, Compose smoke test)
2. CD workflow triggers, waits for your approval in the GitHub UI
3. Once approved, it runs **on your laptop** via the runner:
   - Confirms the Kind cluster exists
   - Rebuilds images and loads them into Kind with `kind load docker-image`
     (same `scripts/build-images.sh` you'd run by hand)
   - Applies `k8s/` via ArgoCD (see `k8s-argocd/README-argocd.md`) —
     CD no longer runs `kubectl apply -k k8s/` directly, since ArgoCD's
     automated sync (prune + self-heal) already owns that; running both
     would be two systems reconciling the same namespace
   - Waits for every Deployment's rollout to finish
   - Hits `/gateway/health` and runs one real GraphQL query as a
     post-deploy smoke test
   - Prints which image tag is now running for each Deployment

## 6. Stopping / removing the runner

```bash
sudo ./svc.sh stop
sudo ./svc.sh uninstall
./config.sh remove --token <TOKEN_FROM_GITHUB_UI>
```

## Why not just let CI deploy directly instead of adding a runner?

GitHub-hosted runners are ephemeral VMs with no route to `localhost:30000`
on your machine — there's no tunnel, VPN, or public IP involved in this
project's design, and adding one (e.g. exposing your laptop's Kubernetes
API to the internet) would be a real security exposure for a learning
project. A self-hosted runner is the mechanism GitHub actually built for
this situation: your laptop pulls jobs from GitHub over an outbound-only
connection, so nothing needs to be exposed inbound.
