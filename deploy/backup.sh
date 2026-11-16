#!/usr/bin/env bash
# Nightly Precon database backup, kept on this server (not off-site yet).
# A compressed custom-format pg_dump of the "precon" database into
# BACKUP_DIR, keeping the last KEEP_DAYS days. Run from cron:
#   30 2 * * * root /opt/precon-crm/deploy/backup.sh >> /var/log/precon-backup.log 2>&1
#
# Restore (into the running container, REPLACES the current data):
#   docker exec -i precon-db pg_restore -U precon -d precon --clean --if-exists < FILE.dump
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/precon}"
KEEP_DAYS="${KEEP_DAYS:-14}"
stamp="$(date +%Y-%m-%d_%H%M)"
file="$BACKUP_DIR/precon_$stamp.dump"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

docker exec precon-db pg_dump -U precon -d precon -Fc > "$file.partial"
mv "$file.partial" "$file"
chmod 600 "$file"

# Uploaded files (brochures, images) from the file library.
docker run --rm -v precon_files:/files:ro -v "$BACKUP_DIR":/out busybox \
  tar czf "/out/precon_files_$stamp.tar.gz" -C /files .
chmod 600 "$BACKUP_DIR/precon_files_$stamp.tar.gz"

find "$BACKUP_DIR" -maxdepth 1 -name 'precon_*' -mtime +"$KEEP_DAYS" -delete
echo "$(date -Is) backup ok: $file ($(du -h "$file" | cut -f1))"
