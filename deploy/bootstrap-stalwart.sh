#!/bin/sh
# Run locally on the mail host. Administrative credential file is read only;
# it is never copied into the project or used by the running application.
set -eu
umask 077
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
mkdir -p "$root/secrets" "$root/config"
chmod 700 "$root/secrets"
if test -s "$root/secrets/bootstrap.key"; then
  bearer=$(cat "$root/secrets/bootstrap.key")
else
  : "${ADMIN_CREDENTIALS_FILE:?provide secrets/bootstrap.key or ADMIN_CREDENTIALS_FILE}"
  admin=$(sed -n 's/^Password: //p' "$ADMIN_CREDENTIALS_FILE" | tr -d '\r')
  test -n "$admin"
fi
url=${STALWART_BOOTSTRAP_URL:-http://127.0.0.1:18080/jmap/}
admin_email=${STALWART_ADMIN_EMAIL:-admin@iqwq.com}
domain=${MAIL_DOMAIN:-iqwq.com}
# Keep curl invocation separate so shell arguments cannot be lost in a wrapper.
admin_request(){
 if test -n "${bearer:-}"; then curl --fail --silent --show-error -H "Authorization: Bearer $bearer" -H 'Content-Type: application/json' "$url" --data-binary @-;
 else curl --fail --silent --show-error -u "$admin_email:$admin" -H 'Content-Type: application/json' "$url" --data-binary @-; fi
}
rpc(){ jq -n --arg method "$1" --argjson args "$2" '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],methodCalls:[[$method,$args,"c"]]}' | admin_request; }
domain_id=$(rpc x:Domain/get '{"properties":["id","name"]}' | jq -er --arg domain "$domain" '.methodResponses[0][1].list[] | select(.name==$domain) | .id')
create(){
  name=$1; output=$2; management=$3
  test ! -s "$root/secrets/$output" || { echo "$name credential already present; unchanged"; return; }
  password=$(openssl rand -hex 32)
  found=$(rpc x:Account/query "$(jq -n --arg name "$name" '{filter:{name:$name}}')")
  test "$(printf '%s' "$found" | jq '.methodResponses[0][1].ids|length')" = 0 || { echo "Refusing to take over existing account: $name" >&2; exit 1; }
  args=$(jq -n --arg name "$name" --arg password "$password" --arg domain "$domain_id" --argjson management "$management" '{create:{service:{"@type":"User",name:$name,domainId:$domain,description:"Mail Web service identity",roles:{"@type":"User"},credentials:{"0":{"@type":"Password",secret:$password}},permissions:({"@type":"Merge",enabledPermissions:$management})}}}')
  response=$(rpc x:Account/set "$args")
  id=$(printf '%s' "$response" | jq -er '.methodResponses[0][1].created.service.id')
  response=$(printf '%s' '{"using":["urn:ietf:params:jmap:core","urn:stalwart:jmap"],"methodCalls":[["x:ApiKey/set",{"create":{"key":{"description":"Mail Web dedicated service credential","permissions":{"@type":"Inherit"}}}},"c"]]}' | curl --fail --silent --show-error -u "$name@$domain:$password" -H 'Content-Type: application/json' "$url" --data-binary @-)
  printf '%s' "$response" | jq -er '.methodResponses[0][1].created.key.secret' > "$root/secrets/$output"
  printf '%s\n' "$id" > "$root/config/$name.account-id"
  printf '%s' "$response" | jq -er '.methodResponses[0][1].created.key.id' > "$root/config/$name.key-id"
  echo "$name created; credential stored in secrets/$output"
}
create mail-web-service provisioning.key '{"sysAccountCreate":true,"sysAccountGet":true,"sysAccountQuery":true,"sysAccountUpdate":true,"sysDomainGet":true,"sysDomainQuery":true}'
create no-reply notification.key '{}'
printf '%s\n' "$domain_id" > "$root/config/domain-id"
test -s "$root/secrets/session.key" || openssl rand -hex 32 > "$root/secrets/session.key"
test -s "$root/secrets/mta-hook.key" || openssl rand -hex 32 > "$root/secrets/mta-hook.key"
echo 'Service identities initialized. Administrative credential was not copied.'
