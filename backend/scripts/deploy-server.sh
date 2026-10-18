#!/usr/bin/env bash
#
# Redeploys the back-end on the VM: install, build, restart, then check it is healthy.
# Run by GitHub Actions after every merge to main (the deploy SSH key pulls main, then runs this),
# or by hand: cd ~/fabricate && git pull --ff-only && bash backend/scripts/deploy-server.sh
# The running server is only restarted if the build succeeds, so a failed build leaves the
# current version running.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$BACKEND_DIR"

# Only one deploy at a time.
exec 9>/tmp/fabricate-deploy.lock
flock 9

# Non-interactive SSH sessions don't load the login shell, so make node/npm/pm2 available.
if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh"
fi

info() { printf '\n==> %s\n' "$*"; }

info "Deploying $(git log --oneline -1)"

info "Installing dependencies"
MONGOMS_DISABLE_POSTINSTALL=1 npm ci --no-audit --no-fund

info "Building (this takes a few minutes on the VM)"
npm run build

info "Removing build-only dependencies"
npm prune --omit=dev --no-audit --no-fund

info "Restarting the back-end"
pm2 restart backend --update-env
pm2 save >/dev/null

PORT="$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2 | tr -d ' "' || true)"
HEALTH_URL="http://localhost:${PORT:-3000}/health"
info "Waiting for $HEALTH_URL"
for _ in $(seq 1 30); do
  if curl -sf "$HEALTH_URL" >/dev/null; then
    echo "Back-end is up."
    break
  fi
  sleep 2
done
curl -sf "$HEALTH_URL" >/dev/null || { echo "Back-end did not become healthy; check: pm2 logs backend" >&2; exit 1; }

if npm run --silent 2>/dev/null | grep -q 'smoke:upload'; then
  info "Running the live Upload Clothing check"
  npm run smoke:upload
fi

info "Deploy finished"
