#!/bin/sh
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
key=$(cat "$root/secrets/bootstrap.key")
hook=$(cat "$root/secrets/mta-hook.key")
service=$(cat "$root/config/mail-web-service.account-id")
url=${STALWART_BOOTSTRAP_URL:-http://127.0.0.1:18080/jmap/}
rpc(){ jq -n --arg method "$1" --argjson args "$2" '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],methodCalls:[[$method,$args,"c"]]}' | curl -fsS -H "Authorization: Bearer $key" -H 'Content-Type: application/json' "$url" --data-binary @-; }
response=$(rpc x:Account/set "$(jq -n --arg id "$service" '{update:{($id):{"permissions/enabledPermissions/sysMtaHookGet":true,"permissions/enabledPermissions/sysMtaHookUpdate":true}}}')")
printf '%s' "$response" | jq -e '.methodResponses[0][0]=="x:Account/set" and ((.methodResponses[0][1].notUpdated//{})|length)==0' >/dev/null
if test ! -s "$root/config/mta-hook-id"; then
  args=$(jq -n --arg secret "$hook" '{create:{policy:{url:"http://mail-web:8080/internal/mta-hook",enable:{else:"false"},stages:{data:true},timeout:5000,tempFailOnError:true,maxResponseSize:4096,httpAuth:{"@type":"Bearer",bearerToken:{"@type":"Value",secret:$secret}}}}}')
  response=$(rpc x:MtaHook/set "$args")
  printf '%s' "$response" | jq -er '.methodResponses[0][1].created.policy.id' > "$root/config/mta-hook-id"
fi
echo 'Submission hook created with an empty scope. Other mail traffic is unaffected.'
