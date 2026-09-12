# UrbanNest — setup guide

Event booking platform: Angular frontend, GraphQL microservices, Kafka,
Postgres, Redis. This guide is steps only — what to install, what to run,
in order, and why a step exists when that isn't obvious.

Two ways to run it: **Docker Compose** (one command, no Kubernetes) or
**Kind + ArgoCD** (real multi-node Kubernetes, local). Compose is faster
to get running; Kind is the path if you want the Kubernetes/GitOps parts.

---

## Path A — Docker Compose

### 1. Install Docker Desktop
Download from https://www.docker.com/products/docker-desktop/, install,
open it, wait for "Docker Desktop is running."

Give it enough memory: **Settings → Resources → Memory → 7–8GB → Apply &
restart.** *(Why: Kafka + Zookeeper + Postgres + two Redis instances +
7 app services is a real multi-service stack, not a toy amount of RAM.)*

Confirm it worked:
```bash
docker --version
docker compose version
```
Both must print a version number.

### 2. Start everything
From the project root:
```bash
docker compose up --build
```
First run takes a few minutes — it's building 8 images and starting 14
containers. Wait until the log output slows to steady, repeating lines
before continuing. *(Starting too early, before Kafka/Postgres finish
booting, is the most common cause of "it's broken" — it isn't, it's still
starting.)*

Confirm everything's healthy:
```bash
docker compose ps
```
Every row should say `Up` or `Up (healthy)`.

### 3. Open the app
```
http://localhost:8080
```

### 4. Create an account
There's no pre-seeded login — click **Create an account**, fill in a
name/email/password (8+ characters), submit. You're logged in
immediately after.

### 5. Shut down
```bash
docker compose down
```
Keeps your data (accounts, bookings) for next time. To wipe everything
instead:
```bash
docker compose down -v
```

---

## Path B — Kind (Kubernetes) + ArgoCD

Do this instead of Path A if you want the Kubernetes deployment, or the
ArgoCD GitOps setup (auto-sync, self-heal, delete-a-pod-and-watch-it-
come-back).

### 1. Install Docker Desktop
Same as Path A, step 1 — Kind's nodes run as Docker containers, so Docker
must be running underneath either way.

### 2. Install Kind and kubectl
```bash
# macOS
brew install kind kubectl

# Windows (PowerShell, as Administrator)
choco install kind kubernetes-cli

# Linux
curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64
chmod +x ./kind && sudo mv ./kind /usr/local/bin/kind
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl && sudo mv kubectl /usr/local/bin/
```
Confirm: `kind version` and `kubectl version --client`.

### 3. Make the scripts executable
```bash
chmod +x scripts/*.sh
```
*(Why: they lose the executable bit when zipped/unzipped or freshly
cloned on some setups.)*

### 4. Deploy
```bash
./scripts/deploy-kind.sh
```
This creates the Kind cluster (1 control-plane + 2 workers), builds every
service image, loads them into Kind, installs ArgoCD if it isn't already
running, and waits for everything to come up. **ArgoCD — not this
script — is what actually applies the Kubernetes manifests**; the script
just bootstraps it and waits.

### 5. Open the app
```
http://localhost:30000
```
Create an account the same way as Path A, step 4.

### 6. Open ArgoCD (optional, to see/manage pods visually)
The deploy script prints a URL, username, and password — or get them any
time with:
```bash
kubectl port-forward svc/argocd-server -n argocd 8090:443 &
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
```
Open `https://localhost:8090` (your browser will warn about a
self-signed certificate — expected, click through), log in as `admin`
with that password.

**To delete a pod and watch it come back:** click any pod in the
`urbannest` Application → **Delete**. ArgoCD's self-heal recreates it
within seconds, because the Deployment in `k8s/` still says how many
replicas should exist. This is the point of turning on automated sync —
see `k8s-argocd/README-argocd.md` if you want the one-paragraph why.

### 7. Made a change to a file under `k8s/`?
Restart the in-cluster git server so ArgoCD sees it:
```bash
kubectl delete pod git-server -n argocd
kubectl apply -f k8s-argocd/git-server.yaml
```
Then click **Refresh → Sync** in the ArgoCD UI, or wait for its next
automatic poll.

### 8. Changed application code (not `k8s/`)?
```bash
./scripts/build-images.sh
kubectl rollout restart deployment/<service-name> -n urbannest
```
*(Why the restart: every Deployment uses `image: ...:latest`, so
Kubernetes doesn't know a new image was loaded unless you force a
rollout.)*

### 9. Tear down
```bash
./scripts/teardown-kind.sh          # removes the app, keeps the cluster
kind delete cluster --name urbannest # removes the cluster entirely
```

---

## Setting up CI/CD (GitHub Actions)

The workflows already exist at `.github/workflows/ci.yml` and `cd.yml`.
This section is just what's needed to make them run.

### 1. Turn this folder into a git repo and connect it to GitHub
```bash
./scripts/setup-git-and-ci.sh
```
This runs `git init`, makes the first commit, and asks for your GitHub
repo URL to set as the remote. Push when it's done:
```bash
git push -u origin main
```

### 2. Register a self-hosted runner
CD deploys to **your** Kind cluster, which only exists on your machine —
GitHub's own hosted runners have no route to it, so one runner has to run
on your machine.

The same script from step 1 walks you through this — it'll ask for a
registration token partway through. Get that token from:
**your repo on GitHub → Settings → Actions → Runners → New self-hosted
runner** (copy the token shown there; it expires in about an hour, so
paste it in as soon as you copy it).

If you'd rather do this by hand, or the script exits before you have a
token ready, the exact commands are in `docs/self-hosted-runner.md`.

### 3. Add the manual-approval gate for deploys
**Your repo on GitHub → Settings → Environments → New environment** →
name it `production-local` → **Required reviewers** → add yourself.

*(Why: without this, every merge to `main` would deploy to your laptop
automatically, with no chance to say no.)*

### 4. Push and watch it run
```bash
git push -u origin main
```
CI runs automatically. CD runs after CI succeeds, then pauses for your
approval in the GitHub Actions tab — click **Review deployments →
Approve** to let it deploy to your Kind cluster.

---

## Troubleshooting

- **`docker: command not found`** — Docker Desktop isn't installed or
  isn't running.
- **A service keeps restarting on first boot** — normal for the first
  20–30 seconds while it waits for Postgres/Kafka to accept connections.
  Check with `docker compose logs <service>`.
- **GraphQL calls time out** — check `booking-worker` is running and
  connected to Kafka (`docker compose logs booking-worker`, or Kafka UI
  at `http://localhost:8081`).
- **"An account with this email already exists" but you don't remember
  registering** — an old session's data is still in the Postgres volume.
  Run `docker compose down -v` for a clean slate, or just use a different
  email.
- **Kind runs out of memory** — raise Docker Desktop's memory limit
  (Settings → Resources), aim for 8GB+.
- **The `urbannest` Application doesn't show up in ArgoCD** — confirm the
  `git-server` pod reached `Running`: `kubectl get pod git-server -n
  argocd`. If not, re-apply it: `kubectl apply -f
  k8s-argocd/git-server.yaml`.
- **CD workflow never starts** — confirm your self-hosted runner is
  online: repo → Settings → Actions → Runners, should show "Idle" not
  offline.
