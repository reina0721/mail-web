#!/bin/sh
# The installed script owns a single application directory, independent of cwd.
set -eu
umask 077
case "${1:-status}" in -h|--help|help) echo 'Usage: deploy/mail-web.sh install|update [vVERSION|latest] | start|stop|restart|status|version|check-update|setup|rotate-setup-token|backup|restore <snapshot>|policy-verified true|false'; exit 0;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
case "$root" in /|/root|/home|/usr|/var|/etc|/opt) echo 'A dedicated application directory is required.' >&2; exit 1;; esac
cd "$root"
for name in releases backups config secrets data logs deploy docs; do
 test ! -L "$name" || { echo "Refusing linked application directory: $name" >&2; exit 1; }
 mkdir -p "$name"
done
for file in .env compose.yaml; do test ! -L "$file" || { echo "Linked installation file refused: $file" >&2; exit 1; }; done
test -z "$(find data config secrets logs backups releases deploy docs -type l -print -quit)" || { echo 'Symlinks are not allowed in managed application paths.' >&2; exit 1; }
mkdir -p data/db data/staging
for name in data/db data/staging; do test ! -L "$name" || { echo 'Linked data directory refused' >&2; exit 1; }; done
exec 9>config/deployment.lock
flock -n 9 || { echo 'Another maintenance operation is running' >&2; exit 1; }
value(){ test ! -f .env || sed -n "s/^$1=//p" .env | tail -1; }
compose(){ docker compose --project-directory "$root" -f "$root/compose.yaml" "$@"; }
check(){
 test "$(uname -s)/$(uname -m)" = Linux/x86_64 || { echo 'This release requires Linux AMD64' >&2; exit 1; }
 for tool in docker curl jq sha256sum tar openssl flock realpath; do command -v "$tool" >/dev/null; done
 docker compose version >/dev/null
}
validate_name(){ case "$1" in ''|*[!a-zA-Z0-9_.-]*|-*) echo 'Invalid container name' >&2; exit 1;; esac; }
owned_container(){
 name=${1:-$(value CONTAINER_NAME)}; name=${name:-mail-web}; validate_name "$name"
 if docker container inspect "$name" >/dev/null 2>&1; then
  owner=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$name")
  test "$owner" = "$root" || { echo "Container $name belongs to another installation; no container changed." >&2; exit 1; }
 fi
}
repository(){
 repo=${MAIL_WEB_REPOSITORY:-$(value RELEASE_REPOSITORY)}; repo=${repo:-reina0721/mail-web}
 case "$repo" in *[!a-zA-Z0-9_./-]*|/*|*..*|*/*/*) echo 'Invalid release repository' >&2; exit 1;; */*) ;; *) exit 1;; esac
}
metadata(){
 repository
 requested=${1:-latest}
 case "$requested" in latest|v[0-9]*.[0-9]*.[0-9]*) ;; *) echo 'Use latest or an exact v-prefixed release.' >&2; exit 1;; esac
 case "$requested" in *[!a-zA-Z0-9.-]*) exit 1;; esac
 if test "$requested" = latest; then endpoint=latest; else endpoint="tags/$requested"; fi
 release=$(curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' "https://api.github.com/repos/$repo/releases/$endpoint")
 version=$(printf '%s' "$release" | jq -er '.tag_name')
 case "$version" in v[0-9]*.[0-9]*.[0-9]*) ;; *) exit 1;; esac
 case "$version" in *[!a-zA-Z0-9.-]*) exit 1;; esac
 test "$(printf '%s' "$release" | jq -r '.draft')" = false
}
archive_safe(){
 tar -tzf "$1" | awk '/^\// || /(^|\/)\.\.($|\/)/ {bad=1} END {exit bad}'
 tar -tvzf "$1" | awk 'substr($0,1,1)!="-" && substr($0,1,1)!="d" {bad=1} END {exit bad}'
}
fetch(){
 metadata "${1:-latest}"
 directory="$root/releases/$version"
 mkdir -p "$directory"
 base="https://github.com/$repo/releases/download/$version"
 for asset in mail-web-linux-amd64.tar.gz SHA256SUMS; do
  curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --retry 2 "$base/$asset" -o "$directory/$asset.part"
  mv "$directory/$asset.part" "$directory/$asset"
 done
 (cd "$directory"; awk '$2=="mail-web-linux-amd64.tar.gz" {print}' SHA256SUMS > package.sha256; test "$(wc -l < package.sha256)" = 1; sha256sum -c package.sha256)
 archive_safe "$directory/mail-web-linux-amd64.tar.gz"
 package="$directory/package-$(date -u +%Y%m%dT%H%M%SZ)-$$"
 mkdir "$package"
 tar -xzf "$directory/mail-web-linux-amd64.tar.gz" -C "$package" --no-same-owner --no-same-permissions
 test "$(jq -r .architecture "$package/release-manifest.json")" = linux/amd64
 test "$(jq -r .version "$package/release-manifest.json")" = "$version"
 (cd "$package"; sha256sum -c image.sha256)
 image=$(jq -er .image "$package/release-manifest.json")
 expected=$(jq -er .imageId "$package/release-manifest.json")
 case "$image" in mail-web:*) ;; *) echo 'Unexpected release image name' >&2; exit 1;; esac
 case "$image" in *[!a-zA-Z0-9_.:-]*) exit 1;; esac
 docker load -i "$package/image.tar"
 test "$(docker image inspect --format '{{.Id}}' "$image")" = "$expected"
}
backup(){
 stamp=$(date -u +%Y%m%dT%H%M%SZ)-$$
 destination="$root/backups/$stamp"
 mkdir -m 700 "$destination"
 chown 10001:10001 "$destination"
 if compose ps --status running --services | grep -qx mail-web; then
  compose exec -T mail-web /app/mail-web --backup "/app/backups/$stamp/mail-web.sqlite"
 else
  compose run --rm --no-deps --pull never mail-web --backup "/app/backups/$stamp/mail-web.sqlite"
 fi
 cp .env compose.yaml "$destination/"
 tar --exclude=config/deployment.lock -czf "$destination/config-secrets.tar.gz" config secrets
 (cd "$destination"; sha256sum mail-web.sqlite .env compose.yaml config-secrets.tar.gz > SHA256SUMS)
 printf '%s\n' "$destination"
}
start(){
 owned_container
 compose up -d --pull never --no-build
 attempt=0
 until compose exec -T mail-web /app/mail-web --healthcheck; do
  attempt=$((attempt+1))
  test "$attempt" -lt 20 || { compose stop; echo 'Health check failed; service stopped. Inspect logs/ and restore the matching backup if this was an update.' >&2; return 1; }
  sleep 2
 done
}
setup_link(){
 test -s secrets/setup.key || { echo 'No setup token. Run rotate-setup-token.' >&2; exit 1; }
 address=$(value LISTEN_ADDRESS); address=${address:-127.0.0.1}; port=$(value PORT); port=${port:-18090}
 case "$address" in 0.0.0.0|\[::\]) address=127.0.0.1;; esac
 printf 'Setup panel (keep this capability private):\nhttp://%s:%s/setup/#setup_token=%s\n' "$address" "$port" "$(cat secrets/setup.key)"
}
case "${1:-status}" in
 install|update)
  check
  if test -f .env && test -f compose.yaml; then owned_container; fi
  fetch "${2:-latest}"
  if test -f .env; then
   if test -f compose.yaml; then compose stop; if test -s data/db/mail-web.sqlite; then backup; fi; fi
  else
   cp "$package/.env.example" .env
   name=${MAIL_WEB_CONTAINER_NAME:-mail-web}; validate_name "$name"
   address=${MAIL_WEB_LISTEN_ADDRESS:-127.0.0.1}; port=${MAIL_WEB_PORT:-18090}
   case "$address" in ''|*[!0-9a-fA-F.:\[\]]*) echo 'Use a listen IP address' >&2; exit 1;; esac
   case "$port" in ''|*[!0-9]*) exit 1;; esac
   test "$port" -ge 1 && test "$port" -le 65535
   allow_http=${MAIL_WEB_ALLOW_HTTP:-false}; case "$allow_http" in true|false) ;; *) exit 1;; esac
   sed -i "s/^CONTAINER_NAME=.*/CONTAINER_NAME=$name/;s/^LISTEN_ADDRESS=.*/LISTEN_ADDRESS=$address/;s/^PORT=.*/PORT=$port/;s/^ALLOW_HTTP=.*/ALLOW_HTTP=$allow_http/" .env
   project=$(printf '%s' "$root" | sha256sum | cut -c1-12)
   printf '\nCOMPOSE_PROJECT_NAME=mailweb-%s\n' "$project" >> .env
   repository
   sed -i "s|^RELEASE_REPOSITORY=.*|RELEASE_REPOSITORY=$repo|" .env
  fi
  cp "$package/compose.yaml" compose.yaml
  for key in session setup mta-hook; do test -s "secrets/$key.key" || openssl rand -hex 32 > "secrets/$key.key"; done
  chmod 700 secrets config
  chown -R 10001:10001 data logs backups config
  chown 10001:10001 secrets secrets/*.key
  chmod 600 secrets/*.key
  sed -i "s/^MAIL_WEB_VERSION=.*/MAIL_WEB_VERSION=${version#v}/" .env
  start
  cp "$package/deploy/mail-web.sh" deploy/mail-web.sh.next
  chmod 700 deploy/mail-web.sh.next
  mv deploy/mail-web.sh.next deploy/mail-web.sh
  cp "$package/README.md" README.md
  mkdir -p docs
  cp -R "$package/docs/." docs/
  cp "$package/release-manifest.json" config/installed-release.json
  printf 'Installed %s in %s\n' "$version" "$root"
  if test ! -s config/runtime.enc; then setup_link; fi
  ;;
 start) check; start ;;
 stop) owned_container; compose stop ;;
 restart) check; owned_container; compose stop; start ;;
 status) owned_container; compose ps ;;
 version) if test -s config/installed-release.json; then jq -r '.version' config/installed-release.json; else value MAIL_WEB_VERSION; fi ;;
 check-update) metadata "${2:-latest}"; printf 'Installed: %s\nAvailable: %s\n' "$(value MAIL_WEB_VERSION)" "$version" ;;
 setup) setup_link ;;
 rotate-setup-token) openssl rand -hex 32 > secrets/setup.key.next; chown 10001:10001 secrets/setup.key.next; chmod 600 secrets/setup.key.next; mv secrets/setup.key.next secrets/setup.key; setup_link ;;
 backup) owned_container; backup ;;
 policy-verified)
  case "${2:-}" in true|false) ;; *) echo 'Use policy-verified true|false after protocol acceptance.' >&2; exit 1;; esac
  check; owned_container; compose stop
  if ! compose run --rm --no-deps --pull never mail-web --set-policy-verified "$2"; then start; exit 1; fi
  start
  ;;
 restore)
  check
  selected=$(realpath "${2:?backup directory required}")
  case "$selected" in "$root"/backups/*) ;; *) echo 'Backup must be inside this installation' >&2; exit 1;; esac
  (cd "$selected"; sha256sum -c SHA256SUMS)
  archive_safe "$selected/config-secrets.tar.gz"
  if test -n "${MAIL_WEB_CONTAINER_NAME:-}" && test ! -s data/db/mail-web.sqlite; then
   owned_container "$MAIL_WEB_CONTAINER_NAME"
  else
   owned_container; compose stop
  fi
  saved="$root/backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ)-$$"
  mkdir "$saved"
  for file in data/db/mail-web.sqlite*; do test ! -f "$file" || mv "$file" "$saved/"; done
  cp "$selected/mail-web.sqlite" data/db/mail-web.sqlite
  cp "$selected/.env" .env
  cp "$selected/compose.yaml" compose.yaml
  tar -xzf "$selected/config-secrets.tar.gz" -C "$root" --no-same-owner --no-same-permissions
  if test -n "${MAIL_WEB_CONTAINER_NAME:-}"; then validate_name "$MAIL_WEB_CONTAINER_NAME"; sed -i "s/^CONTAINER_NAME=.*/CONTAINER_NAME=$MAIL_WEB_CONTAINER_NAME/" .env; fi
  project=$(printf '%s' "$root" | sha256sum | cut -c1-12)
  sed -i "s/^COMPOSE_PROJECT_NAME=.*/COMPOSE_PROJECT_NAME=mailweb-$project/" .env
  chown -R 10001:10001 data secrets logs backups config
  compose run --rm --no-deps --pull never mail-web --revoke-all-sessions
  start
  ;;
 rollback) echo 'Restore the matching pre-update snapshot: deploy/mail-web.sh restore backups/<snapshot>' ;;
 *) echo 'Unknown command. Run deploy/mail-web.sh --help.' >&2; exit 1 ;;
esac
