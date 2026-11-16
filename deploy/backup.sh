#!/usr/bin/env bash
# Nightly Precon backup: on this server AND an encrypted copy off-site.
#
#   1. pg_dump of the "precon" database (custom format, compressed)
#   2. tar of the uploaded file library (brochures, images: volume precon_files)
#   3. both checked to be readable (pg_restore --list / tar -t)
#   4. off-site: both bundled into one tar, encrypted with age (public key
#      BACKUP_AGE_RECIPIENT), uploaded with rclone to
#      BACKUP_RCLONE_REMOTE:BACKUP_RCLONE_PATH/daily/, then verified (rclone check)
#   5. copies older than KEEP_DAYS deleted on this server and off-site
#      (off-site hard-deleted, so B2 doesn't keep hidden old versions forever)
#
# Settings come from deploy/.env.production (BACKUP_AGE_RECIPIENT,
# BACKUP_RCLONE_REMOTE, BACKUP_RCLONE_PATH). Without them, only step 1-3 + local
# pruning run. The off-site copy needs the PRIVATE age key to read it back
# (/root/.precon-backup-age-key.txt); keep a copy of that key off the server.
#
# Cron (/etc/cron.d/precon-backup):
#   0 21 * * * root flock -n /tmp/precon-backup.lock nice -n 19 ionice -c3 /opt/precon-crm/deploy/backup.sh >> /var/log/precon-backup.log 2>&1
#
# Restore: see README.md, "Production server: backups and restore".
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${ENV_FILE:-$DEPLOY_DIR/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/precon}"
KEEP_DAYS="${KEEP_DAYS:-30}"

# Read one setting from the env file without sourcing (and exporting) all of it.
setting() { [[ -f "$ENV_FILE" ]] && grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- || true; }
BACKUP_AGE_RECIPIENT="${BACKUP_AGE_RECIPIENT:-$(setting BACKUP_AGE_RECIPIENT)}"
BACKUP_RCLONE_REMOTE="${BACKUP_RCLONE_REMOTE:-$(setting BACKUP_RCLONE_REMOTE)}"
BACKUP_RCLONE_PATH="${BACKUP_RCLONE_PATH:-$(setting BACKUP_RCLONE_PATH)}"

log() { echo "$(date -u +%FT%TZ) $*"; }
trap 'log "BACKUP FAILED (line $LINENO, exit $?)"' ERR

stamp="$(date -u +%Y-%m-%d_%H%M)"
dump="precon_$stamp.dump"
files="precon_files_$stamp.tar.gz"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# --- 1-3. Local backup -------------------------------------------------------
docker exec precon-db pg_dump -U precon -d precon -Fc > "$BACKUP_DIR/$dump.partial"
mv "$BACKUP_DIR/$dump.partial" "$BACKUP_DIR/$dump"

docker run --rm -v precon_files:/files:ro -v "$BACKUP_DIR":/out busybox \
  tar czf "/out/$files" -C /files .
chmod 600 "$BACKUP_DIR/$dump" "$BACKUP_DIR/$files"

tables="$(docker exec -i precon-db pg_restore --list < "$BACKUP_DIR/$dump" | grep -c 'TABLE DATA' || true)"
if [[ "$tables" -lt 1 ]]; then
  log "BACKUP FAILED: $dump has no table data"
  exit 1
fi
tar tzf "$BACKUP_DIR/$files" > /dev/null
log "local ok: $dump ($(du -h "$BACKUP_DIR/$dump" | cut -f1), $tables tables) + $files ($(du -h "$BACKUP_DIR/$files" | cut -f1))"

# --- 4. Off-site copy ----------------------------------------------------------
if [[ -n "$BACKUP_AGE_RECIPIENT" && -n "$BACKUP_RCLONE_REMOTE" && -n "$BACKUP_RCLONE_PATH" ]]; then
  remote="$BACKUP_RCLONE_REMOTE:$BACKUP_RCLONE_PATH/daily"
  work="$(mktemp -d)"
  trap 'rm -rf "$work"' EXIT
  bundle="precon_$stamp.tar.age"
  tar cf - -C "$BACKUP_DIR" "$dump" "$files" | age -r "$BACKUP_AGE_RECIPIENT" -o "$work/$bundle"

  rclone copyto "$work/$bundle" "$remote/$bundle" --low-level-retries=3
  # Same size and checksum on both sides, or this run fails.
  rclone check "$work" "$remote" --one-way --include "$bundle"
  log "off-site ok: $remote/$bundle ($(du -h "$work/$bundle" | cut -f1), verified)"

  # Only this folder's own files; hard delete so old versions don't pile up.
  rclone delete "$remote" --min-age "${KEEP_DAYS}d" --include 'precon_*.tar.age' --b2-hard-delete
else
  log "off-site copy skipped: BACKUP_AGE_RECIPIENT / BACKUP_RCLONE_REMOTE / BACKUP_RCLONE_PATH not set in $ENV_FILE"
fi

# --- 5. Local retention --------------------------------------------------------
find "$BACKUP_DIR" -maxdepth 1 -name 'precon_*' -mtime +"$KEEP_DAYS" -delete
log "backup complete; keeping $KEEP_DAYS days on this server and off-site"
