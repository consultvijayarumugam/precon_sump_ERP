#!/usr/bin/env bash
# Build and (re)start Precon on the VPS, then apply database migrations.
# Touches only the "precon" Compose project; other apps and Traefik are untouched.
#
#   cd /opt/precon-crm/deploy && ./deploy.sh            # deploy what's checked out
#   cd /opt/precon-crm/deploy && ./deploy.sh --pull     # git pull main first
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env.production ]]; then
  echo "deploy/.env.production is missing (copy .env.production.example)" >&2
  exit 1
fi
if [[ "${1:-}" == "--pull" ]]; then
  git -C .. pull --ff-only origin main
fi

export GIT_SHA="$(git -C .. rev-parse --short HEAD)"
compose() { docker compose -p precon --env-file .env.production "$@"; }

echo "==> Building $GIT_SHA"
compose build

echo "==> Database"
compose up -d db
compose run --rm --no-deps api npx prisma migrate deploy

echo "==> Starting API and web"
compose up -d api web

echo "==> Status"
compose ps
