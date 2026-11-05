#!/bin/sh
set -eu
umask 077
cd "$(dirname "$0")/.."
root="$PWD/tests/runtime/platform"
mkdir -p "$root/deploy"
secret=$(cat tests/runtime/bootstrap.secret)
printf 'Password: %s\n' "$secret" > "$root/admin.credentials"
url=http://127.0.0.1:19080/jmap/
until curl -fsS http://127.0.0.1:19080/healthz/live >/dev/null; do sleep 1; done
rpc(){ jq -n --arg method "$1" --argjson args "$2" '{using:["urn:ietf:params:jmap:core","urn:stalwart:jmap"],methodCalls:[[$method,$args,"c"]]}' | curl -fsS -u "bootstrap:$secret" -H 'Content-Type: application/json' "$url" --data-binary @-; }
found=$(rpc x:Domain/get '{"properties":["id","name"]}')
if ! printf '%s' "$found" | jq -e '.methodResponses[0][1].list[]|select(.name=="mail.example")' >/dev/null; then
 rpc x:Domain/set '{"create":{"domain":{"name":"mail.example"}}}' | jq -e '.methodResponses[0][1].created.domain.id' >/dev/null
fi
cp deploy/bootstrap-stalwart.sh deploy/setup-hook.sh "$root/deploy/"
export ADMIN_CREDENTIALS_FILE="$root/admin.credentials"
export STALWART_ADMIN_EMAIL=bootstrap STALWART_BOOTSTRAP_URL="$url" MAIL_DOMAIN=mail.example MTA_HOOK_URL=http://mail-web:8080/internal/mta-hook
sh "$root/deploy/bootstrap-stalwart.sh"
sh "$root/deploy/setup-hook.sh"
mkdir -p "$root/data/db" "$root/data/staging" "$root/logs" "$root/backups"
test -s "$root/secrets/operator.initial-password" || openssl rand -hex 24 > "$root/secrets/operator.initial-password"
cat > "$root/app.env" <<EOF
PUBLIC_ORIGIN=http://127.0.0.1:19190
MAIL_DOMAIN=mail.example
SITE_NAME=Mail Web
STALWART_URL=http://mail-web-stalwart-test:8080
ALLOW_INSECURE_TEST_UPSTREAM=true
STALWART_DOMAIN_ID=$(cat "$root/config/domain-id")
STALWART_HOOK_ID=$(cat "$root/config/mta-hook-id")
NOTIFICATION_ACCOUNT_ID=$(cat "$root/config/no-reply.account-id")
NOTIFICATION_EMAIL=no-reply@mail.example
SESSION_KEY_FILE=/runtime/secrets/session.key
PROVISIONING_KEY_FILE=/runtime/secrets/provisioning.key
NOTIFICATION_KEY_FILE=/runtime/secrets/notification.key
MTA_HOOK_SECRET_FILE=/runtime/secrets/mta-hook.key
DATABASE_PATH=/runtime/data/db/mail-web.sqlite
STAGING_DIR=/runtime/data/staging
STATIC_DIR=/static
LOG_DIR=/runtime/logs
RUST_LOG=mail_web=info
BIND_ADDR=0.0.0.0:8080
TURNSTILE_SITE_KEY=isolated-fixture-only
TURNSTILE_SECRET_FILE=/runtime/secrets/turnstile.key
MTA_POLICY_VERIFIED=true
EOF
test -s "$root/secrets/turnstile.key" || openssl rand -hex 24 > "$root/secrets/turnstile.key"
echo 'Isolated platform configuration prepared; public registration remains closed.'
