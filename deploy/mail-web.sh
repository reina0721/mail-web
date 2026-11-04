#!/bin/sh
# All paths are rooted at this installed script, never the caller's cwd.
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
mkdir -p releases backups config secrets data/db data/staging logs
exec 9>config/deployment.lock
flock -n 9 || { echo 'Another maintenance operation is running' >&2; exit 1; }
compose() { docker compose --project-directory "$root" -f "$root/compose.yaml" "$@"; }
check() {
  test "$(uname -m)" = x86_64 || { echo 'This release requires Linux AMD64' >&2; exit 1; }
  for tool in docker curl jq sha256sum tar openssl flock; do command -v "$tool" >/dev/null; done
  docker compose version >/dev/null
}
backup() {
  stamp=$(date -u +%Y%m%dT%H%M%SZ)-$$
  destination="$root/backups/$stamp"
  mkdir -m 700 "$destination"
  chown 10001:10001 "$destination"
  # VACUUM INTO includes committed WAL transactions in one consistent snapshot.
  compose exec -T mail-web /app/mail-web --backup "/app/backups/$stamp/mail-web.sqlite"
  cp .env compose.yaml "$destination/"
  tar -czf "$destination/config-secrets.tar.gz" config secrets
  (cd "$destination"; sha256sum mail-web.sqlite .env compose.yaml config-secrets.tar.gz > SHA256SUMS)
  printf '%s\n' "$destination"
}
fetch() {
  requested=${1:-latest}
  case "$requested" in latest|v[0-9]*.[0-9]*.[0-9]*) ;; *) echo 'Use latest or a v-prefixed version' >&2; exit 1;; esac
  case "$requested" in *[!a-zA-Z0-9.-]*) exit 1;; esac
  api=https://api.github.com/repos/reina0721/mail-web/releases
  if test "$requested" = latest; then endpoint="$api/latest"; else endpoint="$api/tags/$requested"; fi
  metadata=$(curl --fail --silent --show-error --location --proto '=https' "$endpoint")
  version=$(printf '%s' "$metadata" | jq -er '.tag_name')
  case "$version" in v[0-9]*.[0-9]*.[0-9]*) ;; *) exit 1;; esac
  case "$version" in *[!a-zA-Z0-9.-]*) exit 1;; esac
  directory="$root/releases/$version"
  mkdir -p "$directory"
  base="https://github.com/reina0721/mail-web/releases/download/$version"
  for asset in mail-web-linux-amd64.tar.gz SHA256SUMS; do
    curl --fail --silent --show-error --location --proto '=https' "$base/$asset" -o "$directory/$asset.part"
    mv "$directory/$asset.part" "$directory/$asset"
  done
  (cd "$directory"; awk '$2=="mail-web-linux-amd64.tar.gz" {print}' SHA256SUMS > package.sha256; test "$(wc -l < package.sha256)" = 1; sha256sum -c package.sha256)
  # Release archives must have ordinary, relative paths and no links.
  tar -tzf "$directory/mail-web-linux-amd64.tar.gz" | awk '/^\// || /(^|\/)\.\.($|\/)/ {bad=1} END {exit bad}'
  tar -tvzf "$directory/mail-web-linux-amd64.tar.gz" | awk 'substr($0,1,1)!="-" && substr($0,1,1)!="d" {bad=1} END {exit bad}'
  mkdir -p "$directory/package"
  tar -xzf "$directory/mail-web-linux-amd64.tar.gz" -C "$directory/package" --no-same-owner --no-same-permissions
  package="$directory/package"
  test "$(jq -r .architecture "$package/release-manifest.json")" = linux/amd64
  test "$(jq -r .version "$package/release-manifest.json")" = "$version"
  (cd "$package"; sha256sum -c image.sha256)
  docker load -i "$package/image.tar"
  image=$(jq -er .image "$package/release-manifest.json")
  expected=$(jq -er .imageId "$package/release-manifest.json")
  test "$(docker image inspect --format '{{.Id}}' "$image")" = "$expected"
}
start() {
  compose up -d --pull never --no-build
  attempt=0
  until compose exec -T mail-web /app/mail-web --healthcheck; do
    attempt=$((attempt+1)); test "$attempt" -lt 15 || { compose stop; echo 'Health check failed. Application stopped; preserve data and inspect logs.' >&2; exit 1; }
    sleep 2
  done
}
case "${1:-status}" in
  install|update)
    check
    fetch "${2:-latest}"
    if test -f .env; then
      test -f compose.yaml && backup
      compose stop
    else
      cp "$package/.env.example" .env
    fi
    cp "$package/compose.yaml" compose.yaml
    test -s secrets/session.key || openssl rand -hex 32 > secrets/session.key
    test -s secrets/mta-hook.key || openssl rand -hex 32 > secrets/mta-hook.key
    chmod 700 secrets
    chown -R 10001:10001 data logs backups
    chown 10001:10001 secrets secrets/*.key
    chmod 600 secrets/*.key
    sed -i "s/^MAIL_WEB_VERSION=.*/MAIL_WEB_VERSION=${version#v}/" .env
    if grep -q '^PUBLIC_ORIGIN=https://mail-web.example.com$' .env; then
      echo 'Installed. Set PUBLIC_ORIGIN and service settings in .env, then run deploy/mail-web.sh start.'
    else start; fi
    ;;
  start) start ;;
  stop) compose stop ;;
  status) compose ps ;;
  backup) backup ;;
  restore)
    selected=$(realpath "${2:?backup directory required}")
    case "$selected" in "$root"/backups/*) ;; *) echo 'Backup must be inside this installation' >&2; exit 1;; esac
    (cd "$selected"; sha256sum -c SHA256SUMS)
    compose stop
    # Preserve the pre-restore database, including any WAL, instead of deleting it.
    saved="$root/backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)-$$"
    mkdir "$saved"
    for file in data/db/mail-web.sqlite*; do test ! -f "$file" || mv "$file" "$saved/"; done
    cp "$selected/mail-web.sqlite" data/db/mail-web.sqlite
    cp "$selected/.env" .env
    cp "$selected/compose.yaml" compose.yaml
    tar -xzf "$selected/config-secrets.tar.gz" -C "$root"
    chown -R 10001:10001 data secrets
    # Restored sessions are revoked before service resumes.
    compose run --rm --no-deps --pull never mail-web --revoke-all-sessions
    start
    ;;
  rollback) echo 'Rollback requires restore of the matching pre-update backup: deploy/mail-web.sh restore backups/<snapshot>' ;;
  *) echo 'Usage: deploy/mail-web.sh install|update [vVERSION|latest] | start|stop|status|backup|restore <backup>|rollback' >&2; exit 1 ;;
esac
