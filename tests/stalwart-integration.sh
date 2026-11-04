#!/bin/sh
# Only the named isolated test server is accepted. No production credentials.
set -eu
umask 077
cd "$(dirname "$0")/.."
root="$PWD/tests/runtime"
test -s "$root/bootstrap.secret"
url=http://127.0.0.1:19080/jmap/
admin=$(cat "$root/bootstrap.secret")
prefix="mw$(date +%s)"
rpc(){
 jq -n --arg method "$1" --argjson args "$2" '{using:["urn:ietf:params:jmap:core","urn:ietf:params:jmap:mail","urn:ietf:params:jmap:submission","urn:stalwart:jmap"],methodCalls:[[$method,$args,"test"]]}' | curl -fsS -u "$username:$password" -H 'Content-Type: application/json' "$url" --data-binary @- > "$root/result.json"
 jq -e --arg method "$1" '.methodResponses[0][0]==$method and ((.methodResponses[0][1].notCreated // {})|length)==0 and ((.methodResponses[0][1].notUpdated // {})|length)==0' "$root/result.json" >/dev/null
}
username=bootstrap;password=$admin
rpc x:Domain/get '{"properties":["id","name"]}'
domain=$(jq -er '.methodResponses[0][1].list[]|select(.name=="example.com")|.id' "$root/result.json")
for person in a b; do
 secret=$(openssl rand -hex 24)
 printf '%s' "$secret" > "$root/$person.password"
 args=$(jq -n --arg name "$prefix$person" --arg domain "$domain" --arg secret "$secret" '{create:{user:{"@type":"User",name:$name,domainId:$domain,roles:{"@type":"User"},credentials:{"0":{"@type":"Password",secret:$secret}}}}}')
 rpc x:Account/set "$args"
 jq -er '.methodResponses[0][1].created.user.id' "$root/result.json" > "$root/$person.id"
done
alice=$(cat "$root/a.id");bob=$(cat "$root/b.id")
username="${prefix}a@example.com";password=$(cat "$root/a.password")
expires=$(date -u -d '+8 hours' +%Y-%m-%dT%H:%M:%SZ)
rpc x:ApiKey/set "$(jq -n --arg expires "$expires" '{create:{key:{description:"isolated integration",permissions:{"@type":"Inherit"},expiresAt:$expires}}}')"
key=$(jq -er '.methodResponses[0][1].created.key.secret' "$root/result.json")
key_id=$(jq -er '.methodResponses[0][1].created.key.id' "$root/result.json")
rpc Mailbox/get "$(jq -n --arg account "$alice" '{accountId:$account}')"
drafts=$(jq -er '.methodResponses[0][1].list[]|select(.role=="drafts")|.id' "$root/result.json")
rpc Email/set "$(jq -n --arg account "$alice" --arg mailbox "$drafts" --arg from "$username" --arg to "${prefix}b@example.com" '{accountId:$account,create:{draft:{mailboxIds:{($mailbox):true},keywords:{"$draft":true},from:[{email:$from}],to:[{email:$to}],subject:"Mail Web integration",textBody:[{partId:"text",type:"text/plain"}],bodyValues:{text:{value:"Isolation and real JMAP delivery",isEncodingProblem:false,isTruncated:false}}}}}')"
email=$(jq -er '.methodResponses[0][1].created.draft.id' "$root/result.json")
rpc Identity/get "$(jq -n --arg account "$alice" '{accountId:$account}')"
identity=$(jq -er '.methodResponses[0][1].list[0].id' "$root/result.json")
rpc EmailSubmission/set "$(jq -n --arg account "$alice" --arg email "$email" --arg identity "$identity" '{accountId:$account,create:{submission:{emailId:$email,identityId:$identity}}}')"
echo 'PASS: real JMAP draft creation and submission'
args=$(jq -n --arg account "$bob" '{using:["urn:ietf:params:jmap:core","urn:ietf:params:jmap:mail"],methodCalls:[["Mailbox/get",{accountId:$account},"cross"]]}')
printf '%s' "$args" | curl -fsS -H "Authorization: Bearer $key" -H 'Content-Type: application/json' "$url" --data-binary @- > "$root/cross.json"
jq -e '.methodResponses[0][0]=="error"' "$root/cross.json" >/dev/null
echo 'PASS: user API key cannot read another account'
rpc x:AppPassword/set '{"create":{"client":{"description":"integration SMTP client"}}}'
jq -e '.methodResponses[0][1].created.client.secret|length>10' "$root/result.json" >/dev/null
rpc x:AccountPassword/set "$(jq -n --arg password "$password" '{update:{singleton:{currentSecret:$password,secret:$password}}}')"
echo 'PASS: application password and account password methods'
rpc x:ApiKey/set "$(jq -n --arg id "$key_id" '{destroy:[$id]}')"
status=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer $key" http://127.0.0.1:19080/jmap/session)
test "$status" = 401
echo 'PASS: revoked key is rejected'
username="${prefix}b@example.com";password=$(cat "$root/b.password")
attempt=0
while :; do
 rpc Email/query "$(jq -n --arg account "$bob" '{accountId:$account,filter:{subject:"Mail Web integration"}}')"
 test "$(jq '.methodResponses[0][1].ids|length' "$root/result.json")" -eq 0 || break
 attempt=$((attempt+1));test "$attempt" -lt 10;sleep 1
done
echo 'PASS: recipient received the real submitted message'
