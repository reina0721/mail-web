#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
umask 077
secret=$(cat tests/runtime/bootstrap.secret)
test -f tests/runtime/user.secret || openssl rand -hex 24 > tests/runtime/user.secret
password=$(cat tests/runtime/user.secret)
jq -n --arg password "$password" '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],methodCalls:[["x:Account/set",{create:{user:{"@type":"User",name:"credential-test",domainId:"b",roles:{"@type":"User"},credentials:{"0":{"@type":"Password",secret:$password}}}}},"c"]]}' > tests/runtime/create-user.request
curl -fsS -u "bootstrap:$secret" -H 'Content-Type: application/json' http://127.0.0.1:19080/jmap/ --data-binary @tests/runtime/create-user.request > tests/runtime/create-user.result
if jq -e '.methodResponses[0][1].notCreated' tests/runtime/create-user.result >/dev/null; then
  jq '.methodResponses[0][1].notCreated' tests/runtime/create-user.result
  exit 1
fi
curl -fsS -u "credential-test@example.com:$password" -H 'Content-Type: application/json' http://127.0.0.1:19080/jmap/ \
 -d '{"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],"methodCalls":[["x:ApiKey/set",{"create":{"session":{"description":"mail-web-isolated-proof","permissions":{"@type":"Inherit"},"expiresAt":"2026-11-05T00:00:00Z"}}},"k"]]}' > tests/runtime/create-key.result
jq '[paths(scalars)]' tests/runtime/create-key.result
