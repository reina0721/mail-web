#!/bin/sh
# Explicitly disposable integration environment. CI may pull its official test
# dependencies; the production release installer never pulls images.
set -eu
cd "$(dirname "$0")/.."
image=${MAIL_WEB_TEST_IMAGE:-mail-web:ci}
sh tests/stalwart-bootstrap.sh
sh tests/stalwart-integration.sh
sh tests/setup-platform.sh
root="$PWD/tests/runtime/platform"
docker run --rm --pull never --user 0:0 --network mail-web-test \
 --env-file "$root/app.env" -v "$root:/runtime" "$image" \
 --init-operator operator-v2@mail.example.com operator-recovery@example.net /runtime/secrets/operator.initial-password
MAIL_WEB_TEST_IMAGE="$image" sh tests/start-platform.sh
for script in installation-integration.py automatic-installation-integration.py platform-integration.py identity-integration.py connections-integration.py; do
 docker run --rm --pull never --network host \
  -v "$PWD:$PWD" -v /var/run/docker.sock:/var/run/docker.sock \
  -v /usr/bin/docker:/usr/bin/docker:ro -e MAIL_WEB_TEST_IMAGE="$image" -w "$PWD" rust:1 python3 -u "tests/$script"
done
