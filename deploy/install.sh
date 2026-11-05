#!/bin/sh
set -eu
umask 077
root=${MAIL_WEB_ROOT:-}
version=latest
repository=${MAIL_WEB_REPOSITORY:-reina0721/mail-web}
while test "$#" -gt 0; do
 case "$1" in
  --dir) root=${2:?installation directory required}; shift 2 ;;
  --version) version=${2:?version required}; shift 2 ;;
  --name) MAIL_WEB_CONTAINER_NAME=${2:?container name required}; export MAIL_WEB_CONTAINER_NAME; shift 2 ;;
  --bind) binding=${2:?IP:port required}; MAIL_WEB_LISTEN_ADDRESS=${binding%:*}; MAIL_WEB_PORT=${binding##*:}; export MAIL_WEB_LISTEN_ADDRESS MAIL_WEB_PORT; shift 2 ;;
  --allow-http) MAIL_WEB_ALLOW_HTTP=true; export MAIL_WEB_ALLOW_HTTP; shift ;;
  --repository) repository=${2:?owner/repository required}; shift 2 ;;
  --help|-h) printf '%s\n' 'Usage: sh install.sh --dir PATH [--version vVERSION|latest] [--name NAME] [--bind IP:PORT] [--allow-http] [--repository OWNER/REPO]'; exit 0 ;;
  *) echo "Unknown option: $1" >&2; exit 1 ;;
 esac
done
test -n "$root" || { echo 'Choose an installation directory with --dir PATH (or MAIL_WEB_ROOT).' >&2; exit 1; }
case "$repository" in *[!a-zA-Z0-9_./-]*|/*|*..*|*/*/*) echo 'Invalid repository' >&2; exit 1;; */*) ;; *) exit 1;; esac
mkdir -p "$root"
root=$(CDPATH= cd -- "$root" && pwd -P)
case "$root" in /|/root|/home|/usr|/var|/etc|/opt) echo 'Choose a dedicated application subdirectory.' >&2; exit 1;; esac
test ! -L "$root/deploy" || { echo 'Deployment directory must not be a symlink.' >&2; exit 1; }
mkdir -p "$root/deploy"
test ! -e "$root/deploy/mail-web.sh.download" && test ! -L "$root/deploy/mail-web.sh.download" || { echo 'An unfinished installer download exists; inspect it before retrying.' >&2; exit 1; }
MAIL_WEB_REPOSITORY=$repository; export MAIL_WEB_REPOSITORY
curl --fail --silent --show-error --location --proto '=https' "https://raw.githubusercontent.com/$repository/main/deploy/mail-web.sh" -o "$root/deploy/mail-web.sh.download"
chmod 700 "$root/deploy/mail-web.sh.download"
mv "$root/deploy/mail-web.sh.download" "$root/deploy/mail-web.sh"
exec sh "$root/deploy/mail-web.sh" install "$version"
