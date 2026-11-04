#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p tests/runtime/stalwart/etc tests/runtime/stalwart/data
chmod 700 tests/runtime
chown -R 2000:2000 tests/runtime/stalwart
umask 077
if [ ! -f tests/runtime/bootstrap.secret ]; then openssl rand -hex 24 > tests/runtime/bootstrap.secret; fi
secret=$(cat tests/runtime/bootstrap.secret)
docker network inspect mail-web-test >/dev/null 2>&1 || docker network create mail-web-test >/dev/null
if ! docker inspect mail-web-stalwart-test >/dev/null 2>&1; then
  docker run -d --pull never --name mail-web-stalwart-test --init \
    --network mail-web-test \
    -p 127.0.0.1:19080:8080 \
    -e STALWART_PUBLIC_URL=http://mail-web-stalwart-test:8080 \
    -e "STALWART_RECOVERY_ADMIN=bootstrap:$secret" \
    -v "$PWD/tests/runtime/stalwart/etc:/etc/stalwart" \
    -v "$PWD/tests/runtime/stalwart/data:/var/lib/stalwart" \
    stalwartlabs/stalwart:v1.0.1-alpine >/dev/null
fi
if [ ! -s tests/runtime/bootstrap-result.json ]; then
  count=0
  until curl --retry 3 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:19080/healthz/live >/dev/null; do
    count=$((count+1)); test "$count" -le 30; sleep 1
  done
  curl -fsS -u "bootstrap:$secret" -H 'Content-Type: application/json' http://127.0.0.1:19080/jmap/ \
    -d '{"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],"methodCalls":[["x:Bootstrap/set",{"update":{"singleton":{"defaultHostname":"mail.example.com","defaultDomain":"example.com","requestTlsCertificate":false,"generateDkimKeys":false,"tracer":{"@type":"Stdout","ansi":false}}}},"b"]]}' > tests/runtime/bootstrap-result.json
  jq -e '.methodResponses[0][0] == "x:Bootstrap/set" and (.methodResponses[0][1].notUpdated // {} | length == 0)' tests/runtime/bootstrap-result.json >/dev/null
  docker restart mail-web-stalwart-test >/dev/null
fi
count=0
until curl --retry 3 --retry-connrefused --retry-delay 1 -fsS http://127.0.0.1:19080/healthz/live >/dev/null; do
 count=$((count+1)); test "$count" -le 30; sleep 1
done
echo 'Isolated Stalwart ready on loopback port 19080; credentials remain in tests/runtime.'
