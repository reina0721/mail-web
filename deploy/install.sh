#!/bin/sh
set -eu
umask 077
root=${MAIL_WEB_ROOT:-/workapps/mail-web}
mkdir -p "$root/deploy"
# Save the manager before running it; the manager pins each release version.
curl -fSL --proto '=https' https://raw.githubusercontent.com/reina0721/mail-web/main/deploy/mail-web.sh -o "$root/deploy/mail-web.sh"
exec sh "$root/deploy/mail-web.sh" install "${1:-latest}"
