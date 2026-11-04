#!/bin/sh
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
description=${1:?exact temporary credential description required}
key=$(cat "$root/secrets/bootstrap.key")
test -n "$key"
url=${STALWART_BOOTSTRAP_URL:-http://127.0.0.1:18080/jmap/}
rpc(){ jq -n --arg m "$1" --argjson a "$2" '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],methodCalls:[[$m,$a,"c"]]}' | curl -fsS -H "Authorization: Bearer $key" -H 'Content-Type: application/json' "$url" --data-binary @-; }
response=$(rpc x:ApiKey/get '{"properties":["id","description"]}')
id=$(printf '%s' "$response" | jq -er --arg description "$description" '[.methodResponses[0][1].list[]|select(.description==$description)]|if length==1 then .[0].id else error("temporary key is not unique") end')
response=$(rpc x:ApiKey/set "$(jq -n --arg id "$id" '{destroy:[$id]}')")
printf '%s' "$response" | jq -e --arg id "$id" '.methodResponses[0][1].destroyed|index($id)!=null' >/dev/null
status=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $key" "${url%/}/session")
test "$status" = 401
: > "$root/secrets/bootstrap.key"
echo 'Temporary administrative credential revoked and verified; local secret cleared.'
