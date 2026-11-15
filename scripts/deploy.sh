#!/bin/sh
# Deploy on the host: pull and reload. The cron rewrites site/index.html in place every
# 30 minutes, so that file is normally "dirty" in the working tree — discard it first,
# the committed copy already carries a fresh track list (scripts/fetch-soundcloud.py is
# run before pushing).
set -e
cd "$(dirname "$0")/.."
git checkout -- site/index.html site/data/releases.json 2>/dev/null || true
git pull --ff-only
docker compose -f deploy/docker-compose.yml up -d --quiet-pull 2>&1 | tail -1
docker exec bfreeky_web nginx -s reload
echo "deployed: $(git log -1 --format='%h %s')"
