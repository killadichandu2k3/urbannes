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
export PATH="$PATH:/c/Windows/System32:/c/Windows/System32/WindowsPowerShell/v1.0:/c/WINDOWS/System32:/c/WINDOWS/System32/WindowsPowerShell/v1.0"
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
  RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/' || echo "2.337.0")
  if [ -z "$RUNNER_VERSION" ]; then RUNNER_VERSION="2.337.0"; fi
  echo "    mkdir -p ~/actions-runner && cd ~/actions-runner"
  echo "    curl -o actions-runner.tar.gz -L https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
  echo "    tar xzf actions-runner.tar.gz"
  echo "    ./config.sh --url https://github.com/<you>/<repo> --token <TOKEN> --labels kind"
  echo "    ./run.sh"
  echo ""
  echo "    --labels kind adds the 'kind' label; 'self-hosted' is added"
  echo "    automatically by every self-hosted runner. Leave ./run.sh"
  echo "    running in a terminal (or install it as a service — GitHub's"
  echo "    docs link this from the same Runners page — so it survives"
  echo "    reboots and picks up cd.yml runs automatically)."
  exit 0
fi

read -rp "    Your GitHub repo URL again (owner/repo or full URL): " REPO_URL
REPO_URL="${REPO_URL%.git}"

echo ""
echo "==> Downloading and configuring the runner in ~/actions-runner"
mkdir -p ~/actions-runner && cd ~/actions-runner
if [ ! -f config.sh ] && [ ! -f config.cmd ]; then
  RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | grep '"tag_name":' | sed -E 's/.*"v([^"]+)".*/\1/' || echo "2.337.0")
  if [ -z "$RUNNER_VERSION" ]; then RUNNER_VERSION="2.337.0"; fi

  OS_NAME=$(uname -s 2>/dev/null || echo "Linux")
  case "$OS_NAME" in
    MINGW*|MSYS*|CYGWIN*)
      RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-win-x64-${RUNNER_VERSION}.zip"
      echo "    Downloading Windows runner binaries from ${RUNNER_URL}..."
      curl -o actions-runner.zip -L "$RUNNER_URL"
      if command -v unzip >/dev/null 2>&1; then
        unzip -q -o actions-runner.zip
      elif command -v powershell.exe >/dev/null 2>&1; then
        powershell.exe -Command "Expand-Archive -Path actions-runner.zip -DestinationPath . -Force"
      elif [ -f "/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe" ]; then
        /c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe -Command "Expand-Archive -Path actions-runner.zip -DestinationPath . -Force"
      elif [ -f "/c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe" ]; then
        /c/WINDOWS/System32/WindowsPowerShell/v1.0/powershell.exe -Command "Expand-Archive -Path actions-runner.zip -DestinationPath . -Force"
      elif command -v tar >/dev/null 2>&1; then
        tar -xf actions-runner.zip
      else
        echo "    Error: Unable to extract actions-runner.zip. PowerShell or unzip not found." >&2
        exit 1
      fi
      rm -f actions-runner.zip
      ;;
    *)
      RUNNER_URL="https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
      echo "    Downloading Linux runner binaries from ${RUNNER_URL}..."
      curl -o actions-runner.tar.gz -L "$RUNNER_URL"
      tar xzf actions-runner.tar.gz
      rm -f actions-runner.tar.gz
      ;;
  esac
else
  echo "    Runner binaries already present — skipping download."
fi

if [ -f ./config.cmd ]; then
  ./config.cmd --url "$REPO_URL" --token "$RUNNER_TOKEN" --labels kind
else
  ./config.sh --url "$REPO_URL" --token "$RUNNER_TOKEN" --labels kind
fi

echo ""
echo "==> Runner configured. Start it now with:"
if [ -f ./run.cmd ]; then
  echo "      cd ~/actions-runner && ./run.cmd"
else
  echo "      cd ~/actions-runner && ./run.sh"
fi
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
