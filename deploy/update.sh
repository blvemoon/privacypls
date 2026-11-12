#!/usr/bin/env bash
# Pulls the latest code from GitHub and restarts the app with no downtime.
# Run as the app user:  sudo -u privacypls -i  then  ~/app/deploy/update.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Current version: $(git rev-parse --short HEAD)"
git fetch --quiet origin
git pull --ff-only origin main
echo "New version:     $(git rev-parse --short HEAD)"

npm ci --omit=dev --no-audit --no-fund
npm run --silent check-rules
pm2 reload deploy/ecosystem.config.cjs --update-env
sleep 3
if curl -fsS http://127.0.0.1:3000/health > /dev/null; then
  echo "Updated and healthy."
else
  echo "WARNING: health check failed. See: pm2 logs privacypls --lines 50"
  echo "To roll back: git checkout <previous version> && npm ci --omit=dev && pm2 reload deploy/ecosystem.config.cjs"
  exit 1
fi
