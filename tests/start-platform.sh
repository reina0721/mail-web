#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
root="$PWD/tests/runtime/platform"
binary=${MAIL_WEB_TEST_BINARY_DIR:-$PWD/target/debug}
static=${MAIL_WEB_TEST_STATIC_DIR:-$PWD/frontend/apps/web/out}
if test -z "${MAIL_WEB_TEST_IMAGE:-}"; then test -x "$binary/mail-web"; fi
test -s "$static/index.html"
test -s "$root/app.env"
if docker inspect mail-web-app-test >/dev/null 2>&1; then
 docker stop mail-web-app-test >/dev/null
 docker rm mail-web-app-test >/dev/null
fi
image=${MAIL_WEB_TEST_IMAGE:-rust:1}
if test -n "${MAIL_WEB_TEST_IMAGE:-}"; then command=/app/mail-web; else command=/testbin/mail-web; fi
docker run -d --pull never --user 0:0 --name mail-web-app-test --network mail-web-test --network-alias mail-web \
 -p 127.0.0.1:19190:8080 --env-file "$root/app.env" \
 -v "$root:/runtime" -v "$binary:/testbin:ro" -v "$static:/static:ro" \
 -w /runtime "$image" "$command" >/dev/null
echo 'Real isolated app listening on loopback port 19190.'
