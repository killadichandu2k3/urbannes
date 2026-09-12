#!/usr/bin/env bash
# One-time setup: turns this folder into a git repo wired up for the CI/CD
# workflows already in .github/workflows/ci.yml and cd.yml, and walks you
# through registering a self-hosted GitHub Actions runner on THIS machine
# (the one running your Kind cluster — cd.yml requires `runs-on:
# [self-hosted, kind]` because deploying to a local Kind cluster only
# makes sense from the machine that cluster actually lives on; GitHub's
# own hosted runners have no route to it).
#
# What this script automates: git init, .gitignore sanity check, first
# commit, remote add, runner binary download + config. What it CANNOT
# automate: the registration token itself, which GitHub issues per-repo,
# expires in ~1 hour, and can only be fetched from your browser while
# logged in — there is no API for a script to mint one non-interactively
# without a personal access token you'd have to paste in here. This
# script pauses and tells you exactly where to get it.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Step 1: git init"
if [ -d .git ]; then
  echo "    Already a git repo — skipping init."
else
  git init -b main
  echo "    Initialized. Default branch: main"
fi

echo ""
echo "==> Step 2: first commit"
if git rev-parse HEAD >/dev/null 2>&1; then
  echo "    Repo already has commits — skipping."
else
  git add -A
  git commit -m "Initial commit" --quiet
  echo "    Committed $(git ls-files | wc -l | tr -d ' ') files."
fi

echo ""
echo "==> Step 3: add your GitHub remote"
if git remote get-url origin >/dev/null 2>&1; then
  echo "    origin already set to: $(git remote get-url origin)"
else
  read -rp "    Paste your GitHub repo URL (e.g. https://github.com/you/urbannest.git): " REMOTE_URL
  git remote add origin "$REMOTE_URL"
  echo "    origin set. Push whenever you're ready with:"
  echo "      git push -u origin main"
fi

echo ""
echo "==> Step 4: register a self-hosted runner on THIS machine"
echo "    cd.yml targets runs-on: [self-hosted, kind] — GitHub's hosted"
echo "    runners can't reach your local Kind cluster, so one runner must"
echo "    live here, with both labels 'self-hosted' and 'kind' attached."
echo ""
echo "    1. In your browser: your repo -> Settings -> Actions -> Runners"
echo "       -> 'New self-hosted runner' -> pick your OS/arch."
echo "    2. GitHub shows a registration token and a set of commands —"
echo "       copy the token (valid ~1 hour) and paste it below."
echo ""
read -rp "    Paste the registration token now (or press Enter to skip this step): " RUNNER_TOKEN

if [ -z "$RUNNER_TOKEN" ]; then
  echo ""
  echo "    Skipped. Re-run this script, or run these commands yourself"
  echo "    once you have a token — same steps GitHub's own instructions"
  echo "    give you, included here so this script is the one place to look:"
  echo ""
  echo "      mkdir -p ~/actions-runner && cd ~/actions-runner"
  echo "      curl -o actions-runner.tar.gz -L https://github.com/actions/runner/releases/latest/download/actions-runner-linux-x64.tar.gz"
  echo "      tar xzf actions-runner.tar.gz"
  echo "      ./config.sh --url https://github.com/<you>/<repo> --token <TOKEN> --labels kind"
  echo "      ./run.sh"
  echo ""
  echo "    --labels kind adds the 'kind' label; 'self-hosted' is added"
  echo "    automatically by every self-hosted runner. Leave ./run.sh"
  echo "    running in a terminal (or install it as a service — GitHub's"
  echo "    docs link this from the same Runners page — so it survives"
  echo "    reboots and picks up cd.yml runs automatically)."
  exit 0
fi

read -rp "    Your GitHub repo URL again (owner/repo or full URL): " REPO_URL

echo ""
echo "==> Downloading and configuring the runner in ~/actions-runner"
mkdir -p ~/actions-runner && cd ~/actions-runner
if [ ! -f config.sh ]; then
  curl -o actions-runner.tar.gz -L https://github.com/actions/runner/releases/latest/download/actions-runner-linux-x64.tar.gz
  tar xzf actions-runner.tar.gz
else
  echo "    Runner binaries already present — skipping download."
fi

./config.sh --url "$REPO_URL" --token "$RUNNER_TOKEN" --labels kind

echo ""
echo "==> Runner configured. Start it now with:"
echo "      cd ~/actions-runner && ./run.sh"
echo ""
echo "    Leave that running (or install as a service — see the option"
echo "    './svc.sh install && ./svc.sh start' printed by config.sh above)"
echo "    so cd.yml has a live runner to pick up every push to main."
echo ""
echo "==> Once it's running, push to trigger CI then CD:"
echo "      git push -u origin main"
echo ""
echo "    ci.yml runs on every push automatically. cd.yml runs after ci.yml"
echo "    succeeds (workflow_run trigger) and needs the Kind cluster to"
echo "    already exist on this runner's machine — run ./scripts/deploy-kind.sh"
echo "    once first if you haven't already."
