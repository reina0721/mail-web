"""Identity fault checks against the named disposable Stalwart/application pair.

Only delivery/captcha inputs are seeded in the stopped test database. Actual
verification, provisioning, login, password APIs and revocation run unmodified.
Never run this helper against production or with production URLs.
"""
import concurrent.futures
import hashlib
import json
import secrets
import sqlite3
import subprocess
import time
import uuid
from pathlib import Path

# Reuse HTTP helpers without executing the mail tests below their setup line.
namespace = {"__file__": str(Path(__file__).with_name("platform-integration.py"))}
source = Path(namespace["__file__"]).read_text().split('\nstart()\nadmin = Actor', 1)[0]
exec(compile(source, namespace["__file__"], "exec"), namespace)
Actor, request, start, ROOT = [namespace[x] for x in ("Actor", "request", "start", "ROOT")]
BASE = namespace["BASE"]
assert BASE == "http://127.0.0.1:19190"


def verified_claim(email, purpose):
    subprocess.run(["docker", "stop", "mail-web-app-test"], check=True, stdout=subprocess.DEVNULL)
    challenge = uuid.uuid4()
    code = secrets.token_hex(3)
    pepper = (ROOT / "secrets/turnstile.key").read_text().strip()
    digest = hashlib.sha256(f"{challenge}:{code}:{pepper}".encode()).hexdigest()
    with sqlite3.connect(ROOT / "data/db/mail-web.sqlite") as db:
        db.execute("INSERT INTO verification_challenges(id,email,purpose,code_hash,expires_at) VALUES (?,?,?,?,?)", (challenge.bytes, email, purpose, digest, int(time.time()*1000)+600000))
        policy = json.loads(db.execute("SELECT value FROM platform_settings WHERE key='registration'").fetchone()[0])
        policy["enabled"] = True
        db.execute("UPDATE platform_settings SET value=? WHERE key='registration'", (json.dumps(policy),))
    start()
    status, result, _ = request(BASE + "/api/v1/registration/verify", "POST", {"challenge_id": str(challenge), "code": code}, {"Origin": BASE})
    assert status == 200, ("verify", status, result)
    return {"challenge_id": str(challenge), "verification_token": result["verificationToken"]}


start()
name = "register-" + secrets.token_hex(4)
password = secrets.token_hex(24)
claim = verified_claim(name + "@example.net", "registration")
payload = {**claim, "name": name, "password": password}
def register():
    return request(BASE + "/api/v1/auth/register", "POST", payload, {"Origin": BASE})[0]
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
    results = list(executor.map(lambda _: register(), range(4)))
assert 204 in results and set(results) <= {204, 409}, results
assert register() == 204
actor = Actor(name + "@iqwq.com", password)
assert actor.api("/account")["quotaBytes"] == 1073741824
with namespace["database"]() as db:
    assert db.execute("SELECT count(*) FROM platform_users WHERE email=?", (actor.email,)).fetchone()[0] == 1
print("PASS: verified claim, concurrent signup, idempotent retry and real mailbox login")

other = Actor(actor.email, password)
actor.api("/auth/sessions/revoke-others", "POST", {}, expected=204)
other.api("/account", expected=401)
print("PASS: server-side device revocation")

app_password = actor.api("/account/app-passwords", "POST", {"description": "isolated protocol proof"})["created"]["credential"]
assert app_password.get("secret") and app_password.get("id")
actor.api("/account/app-passwords/" + app_password["id"], "DELETE", expected=204)
assert all(item["id"] != app_password["id"] for item in actor.api("/account/app-passwords")["list"])

new_password = secrets.token_hex(24)
actor.api("/auth/password", "POST", {"current_password": password, "new_password": new_password}, expected=204)
actor.api("/account", expected=401)
assert request(BASE + "/api/v1/auth/login", "POST", {"email": actor.email, "password": password}, {"Origin": BASE})[0] != 204
actor = Actor(actor.email, new_password)
print("PASS: client credential lifecycle, password change and old session invalidation")

reset_claim = verified_claim(name + "@example.net", "recovery")
reset_password = secrets.token_hex(24)
status, _, _ = request(BASE + "/api/v1/auth/recovery", "POST", {**reset_claim, "password": reset_password}, {"Origin": BASE})
assert status == 204, ("recovery", status)
actor.api("/account", expected=401)
actor = Actor(actor.email, reset_password)
assert request(BASE + "/api/v1/auth/recovery", "POST", {**reset_claim, "password": secrets.token_hex(24)}, {"Origin": BASE})[0] == 400
print("PASS: external-address recovery claim, single use, real password reset and session invalidation")

admin = Actor("operator-v2@iqwq.com", (ROOT / "secrets/operator.initial-password").read_text().strip())
admin.api("/admin/registration", "PATCH", {"enabled": False, "maximumAccounts": 100, "quotaBytes": 1073741824, "attachmentBytes": 20971520, "hourlyRecipients": 10, "dailyRecipients": 50}, expected=204)
print("All real isolated identity checks passed; registration closed again.")
