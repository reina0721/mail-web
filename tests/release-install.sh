#!/bin/sh
# Clean-install and restore rehearsal in explicitly disposable project folders.
# No production credentials are copied into this environment.
set -eu
project=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
version=${1:?explicit release version required}
python_image=${MAIL_WEB_TEST_PYTHON_IMAGE:-rust:1}
case "$version" in v[0-9]*.[0-9]*.[0-9]*) ;; *) exit 1;; esac
root="$project/tests/runtime/release-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$root/deploy"
curl -fsSL --proto '=https' "https://raw.githubusercontent.com/reina0721/mail-web/$version/deploy/mail-web.sh" -o "$root/deploy/mail-web.sh"
if test -n "${MAIL_WEB_TEST_MANAGER:-}"; then cp "$MAIL_WEB_TEST_MANAGER" "$root/deploy/mail-web.sh"; fi
docker network inspect mail-web-release-test >/dev/null 2>&1 || docker network create mail-web-release-test >/dev/null
cd /tmp
sh "$root/deploy/mail-web.sh" install "$version"
if test -n "${MAIL_WEB_TEST_MANAGER:-}"; then cp "$MAIL_WEB_TEST_MANAGER" "$root/deploy/mail-web.sh"; fi
sed -i 's|^PUBLIC_ORIGIN=.*|PUBLIC_ORIGIN=http://127.0.0.1:19191|;s/^PORT=.*/PORT=19191/;s/^STALWART_NETWORK=.*/STALWART_NETWORK=mail-web-release-test/' "$root/.env"
sh "$root/deploy/mail-web.sh" start
sh "$root/deploy/mail-web.sh" stop
docker run --rm -i --pull never -v "$root/data:/data" "$python_image" python3 - <<'PY'
import sqlite3,uuid
with sqlite3.connect('/data/db/mail-web.sqlite') as db:
 db.execute("INSERT INTO platform_users(id,email,recovery_email,status) VALUES (?,?,?,'provisioning')",(uuid.uuid4().bytes,'release-fixture@iqwq.com','release-fixture@example.net'))
PY
sh "$root/deploy/mail-web.sh" start
sh "$root/deploy/mail-web.sh" backup > "$root/backup-path.txt"
snapshot=$(tail -n 1 "$root/backup-path.txt")
test -s "$snapshot/mail-web.sqlite"
sh "$root/deploy/mail-web.sh" stop

# Repeat installation must preserve configuration and the database.
original=$(sha256sum "$root/secrets/session.key" | cut -d' ' -f1)
sh "$root/deploy/mail-web.sh" install "$version"
if test -n "${MAIL_WEB_TEST_MANAGER:-}"; then cp "$MAIL_WEB_TEST_MANAGER" "$root/deploy/mail-web.sh"; fi
test "$(sha256sum "$root/secrets/session.key" | cut -d' ' -f1)" = "$original"
sh "$root/deploy/mail-web.sh" stop

restore="$root-restored"
mkdir -p "$restore/deploy" "$restore/backups/snapshot" "$restore/data/db"
cp "$root/deploy/mail-web.sh" "$restore/deploy/"
cp -R "$snapshot/." "$restore/backups/snapshot/"
cp "$snapshot/.env" "$snapshot/compose.yaml" "$restore/"
sh "$restore/deploy/mail-web.sh" restore "$restore/backups/snapshot"
curl -fsS http://127.0.0.1:19191/api/v1/health/ready
test -s "$restore/data/db/mail-web.sqlite"
docker run --rm -i --pull never -v "$restore/data:/data:ro" "$python_image" python3 - <<'PY'
import sqlite3
with sqlite3.connect('file:/data/db/mail-web.sqlite?mode=ro',uri=True) as db:
 assert db.execute("SELECT count(*) FROM platform_users WHERE email='release-fixture@iqwq.com'").fetchone()[0]==1
 assert db.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
PY
test "$(sha256sum "$restore/secrets/session.key" | cut -d' ' -f1)" = "$original"
sh "$restore/deploy/mail-web.sh" stop

# A missing image must fail locally rather than trigger a registry pull.
if MAIL_WEB_VERSION=missing-image-check docker compose --project-directory "$restore" -f "$restore/compose.yaml" up -d --pull never --no-build > "$restore/missing-image.log" 2>&1; then
 echo 'Missing image unexpectedly started' >&2; exit 1
fi
grep -Eqi 'No such image|not found|does not exist' "$restore/missing-image.log"
mkdir "$restore/check-bin"
printf '#!/bin/sh\nprintf aarch64\n' > "$restore/check-bin/uname"
chmod 700 "$restore/check-bin/uname"
if PATH="$restore/check-bin:$PATH" sh "$restore/deploy/mail-web.sh" install "$version" > "$restore/wrong-architecture.log" 2>&1; then
 echo 'Wrong architecture unexpectedly accepted' >&2; exit 1
fi
grep -q 'requires Linux AMD64' "$restore/wrong-architecture.log"
printf '\nPASS: Release-only clean/repeated installation, consistent backup, empty-directory restore, local-image failure and invocation from /tmp.\nArtifacts retained in %s\n' "$root"
