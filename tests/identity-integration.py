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


subprocess.run(["docker", "stop", "mail-web-app-test"], check=True, stdout=subprocess.DEVNULL)
with sqlite3.connect(ROOT / "data/db/mail-web.sqlite") as db:
    # Each run has fresh limiter fixtures, as on a clean CI worker. Production
    # is never reachable through this helper's fixed paths or URLs.
    db.execute("DELETE FROM request_limits")
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
actor = Actor(name + "@mail.example", password)
assert actor.api("/account")["quotaBytes"] == 1073741824
with namespace["database"]() as db:
    assert db.execute("SELECT count(*) FROM platform_users WHERE email=?", (actor.email,)).fetchone()[0] == 1
print("PASS: verified claim, concurrent signup, idempotent retry and real mailbox login")
with namespace["database"]() as db:
    scoped_account = db.execute("SELECT stalwart_id FROM platform_users WHERE email=?", (actor.email,)).fetchone()[0]
scoped_basic = "Basic " + namespace["base64"].b64encode((actor.email + ":" + password).encode()).decode()
for method in ["SieveScript/get", "VacationResponse/get"]:
    status, data, _ = request(namespace["JMAP"], "POST", {"using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:sieve", "urn:ietf:params:jmap:vacationresponse"], "methodCalls": [[method, {"accountId": scoped_account}, "boundary"]]}, {"Authorization": scoped_basic})
    assert status in (401, 403) or (data["methodResponses"][0][0] == "error" and data["methodResponses"][0][1]["type"] in ("forbidden", "unknownCapability", "unknownMethod")), (method, status)
print("PASS: new mail-only accounts reject deferred Sieve/vacation entry points")


other = Actor(actor.email, password)
actor.api("/auth/sessions/revoke-others", "POST", {}, expected=204)
other.api("/account", expected=401)
print("PASS: server-side device revocation")

app_password = actor.api("/account/app-passwords", "POST", {"description": "isolated protocol proof"})["created"]["credential"]
assert app_password.get("secret") and app_password.get("id")
with namespace["database"]() as db:
    client_account = db.execute("SELECT stalwart_id FROM platform_users WHERE email=?", (actor.email,)).fetchone()[0]
client_basic = "Basic " + namespace["base64"].b64encode((actor.email + ":" + app_password["secret"]).encode()).decode()
client_request = {"using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], "methodCalls": [["Mailbox/get", {"accountId": client_account}, "client"]]}
client_status, client_result, _ = request(namespace["JMAP"], "POST", client_request, {"Authorization": client_basic})
assert client_status == 200 and client_result["methodResponses"][0][0] == "Mailbox/get"
grant_status, grant_result, _ = request(namespace["JMAP"], "POST", {"using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"], "methodCalls": [["x:ApiKey/set", {"create": {"unexpected": {"description": "must not be created"}}}, "grant"]]}, {"Authorization": client_basic})
assert grant_status in (401, 403) or (grant_result["methodResponses"][0][0] == "error" and grant_result["methodResponses"][0][1]["type"] == "forbidden"), "Client credentials must not mint persistent access keys"
actor.api("/account/app-passwords/" + app_password["id"], "DELETE", expected=204)
assert request(namespace["JMAP"], "POST", client_request, {"Authorization": client_basic})[0] in (401, 403)
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

jmap = namespace["jmap"]
service = "Bearer " + (ROOT / "secrets/provisioning.key").read_text().strip()
domain = (ROOT / "config/domain-id").read_text().strip()
def upstream_account(local_name, marker, secret):
    return jmap(service, "x:Account/set", {"create": {"fixture": {"@type": "User", "name": local_name, "domainId": domain, "description": marker, "roles": {"@type": "User"}, "credentials": {"0": {"@type": "Password", "secret": secret}}, "permissions": {"@type": "Merge", "disabledPermissions": {"authenticate": True, "emailSend": True}}}}})["created"]["fixture"]["id"]

# Reconstruct the precise durable state after Stalwart committed creation but
# its response/platform update was lost. The mailbox is real and disabled.
resume_name = "resume-" + secrets.token_hex(4)
resume_id, resume_secret = uuid.uuid4(), secrets.token_hex(24)
resume_claim = verified_claim(resume_name + "@example.net", "registration")
upstream_account(resume_name, "mail-web:" + str(resume_id), resume_secret)
subprocess.run(["docker", "stop", "mail-web-app-test"], check=True, stdout=subprocess.DEVNULL)
with sqlite3.connect(ROOT / "data/db/mail-web.sqlite") as db:
    db.execute("INSERT INTO platform_users(id,email,recovery_email,status,challenge_id) VALUES (?,?,?,'provisioning',?)", (resume_id.bytes, resume_name + "@mail.example", resume_name + "@example.net", uuid.UUID(resume_claim["challenge_id"]).bytes))
start()
resume_payload = {**resume_claim, "name": resume_name, "password": resume_secret}
for _ in range(2):
    assert request(BASE + "/api/v1/auth/register", "POST", resume_payload, {"Origin": BASE})[0] == 204
Actor(resume_name + "@mail.example", resume_secret)
assert len(jmap(service, "x:Account/query", {"filter": {"name": resume_name}})["ids"]) == 1
print("PASS: lost-create-response durable state resumes the marked mailbox exactly once after restart")

foreign_name = "foreign-" + secrets.token_hex(4)
foreign_id = upstream_account(foreign_name, "foreign-never-adopt", secrets.token_hex(24))
foreign_claim = verified_claim(foreign_name + "@example.net", "registration")
status, result, _ = request(BASE + "/api/v1/auth/register", "POST", {**foreign_claim, "name": foreign_name, "password": secrets.token_hex(24)}, {"Origin": BASE})
assert status == 409 and result["code"] == "upstream_address_exists"
with namespace["database"]() as db:
    assert db.execute("SELECT count(*) FROM platform_users WHERE email=?", (foreign_name + "@mail.example",)).fetchone()[0] == 0
assert jmap(service, "x:Account/get", {"ids": [foreign_id], "properties": ["id", "description"]})["list"][0]["description"] == "foreign-never-adopt"
replacement = "replace-" + secrets.token_hex(4)
assert request(BASE + "/api/v1/auth/register", "POST", {**foreign_claim, "name": replacement, "password": secrets.token_hex(24)}, {"Origin": BASE})[0] == 204
print("PASS: foreign mailbox is untouched and its empty reservation does not trap a verified applicant")

outage_name = "outage-" + secrets.token_hex(4)
outage_claim = verified_claim(outage_name + "@example.net", "registration")
outage_payload = {**outage_claim, "name": outage_name, "password": secrets.token_hex(24)}
subprocess.run(["docker", "stop", "mail-web-stalwart-test"], check=True, stdout=subprocess.DEVNULL)
try:
    assert request(BASE + "/api/v1/auth/register", "POST", outage_payload, {"Origin": BASE})[0] == 502
finally:
    subprocess.run(["docker", "start", "mail-web-stalwart-test"], check=True, stdout=subprocess.DEVNULL)
for _ in range(50):
    try:
        if request("http://127.0.0.1:19080/healthz/live")[0] == 200:
            break
    except OSError:
        pass
    time.sleep(.2)
subprocess.run(["docker", "stop", "mail-web-app-test"], check=True, stdout=subprocess.DEVNULL)
with sqlite3.connect(ROOT / "data/db/mail-web.sqlite") as db:
    # Advance only this disposable fixture's lease rather than waiting 3 minutes.
    db.execute("UPDATE platform_users SET provisioning_lease=0 WHERE email=? AND status='provisioning'", (outage_name + "@mail.example",))
start()
assert request(BASE + "/api/v1/auth/register", "POST", outage_payload, {"Origin": BASE})[0] == 204
assert len(jmap(service, "x:Account/query", {"filter": {"name": outage_name}})["ids"]) == 1
print("PASS: real upstream outage retains a recoverable reservation across application restart")

failed_reset_claim = verified_claim(name + "@example.net", "recovery")
subprocess.run(["docker", "stop", "mail-web-stalwart-test"], check=True, stdout=subprocess.DEVNULL)
try:
    status, _, _ = request(BASE + "/api/v1/auth/recovery", "POST", {**failed_reset_claim, "password": secrets.token_hex(24)}, {"Origin": BASE})
    assert status == 502, status
finally:
    subprocess.run(["docker", "start", "mail-web-stalwart-test"], check=True, stdout=subprocess.DEVNULL)
for _ in range(50):
    try:
        if request("http://127.0.0.1:19080/healthz/live")[0] == 200:
            break
    except OSError:
        pass
    time.sleep(.2)
actor.api("/account", expected=401)
assert request(BASE + "/api/v1/auth/recovery", "POST", {**failed_reset_claim, "password": secrets.token_hex(24)}, {"Origin": BASE})[0] == 400
fresh_reset_claim = verified_claim(name + "@example.net", "recovery")
reset_password = secrets.token_hex(24)
assert request(BASE + "/api/v1/auth/recovery", "POST", {**fresh_reset_claim, "password": reset_password}, {"Origin": BASE})[0] == 204
actor = Actor(actor.email, reset_password)
print("PASS: recovery outage revokes sessions and requires a fresh verification claim; no password is queued")

admin = Actor("operator-v2@mail.example", (ROOT / "secrets/operator.initial-password").read_text().strip())
managed = next(item for item in admin.api("/admin/users")["items"] if item["email"] == actor.email)
limits = {"quota_bytes": 1073741824, "hourly_recipients": 10, "daily_recipients": 50}
admin.api("/admin/users/" + managed["id"], "PATCH", {**limits, "enabled": False}, expected=202)
actor.api("/account", expected=401)
basic = "Basic " + namespace["base64"].b64encode((actor.email + ":" + reset_password).encode()).decode()
with namespace["database"]() as db:
    suspended_account = db.execute("SELECT stalwart_id FROM platform_users WHERE email=?", (actor.email,)).fetchone()[0]
for _ in range(40):
    status, _, _ = request(namespace["JMAP"], "POST", {"using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"], "methodCalls": [["Mailbox/get", {"accountId": suspended_account}, "test"]]}, {"Authorization": basic})
    if status in (401, 403):
        break
    time.sleep(.25)
assert status in (401, 403), ("Disabled account must also reject JMAP mailbox access", status)
ip = subprocess.check_output(["docker", "inspect", "--format", '{{(index .NetworkSettings.Networks "mail-web-test").IPAddress}}', "mail-web-stalwart-test"], text=True).strip()
try:
    with namespace["smtplib"].SMTP_SSL(ip, 465, timeout=15, context=namespace["ssl"]._create_unverified_context()) as smtp:
        smtp.login(actor.email, reset_password)
    raise AssertionError("Disabled account authenticated over SMTP")
except namespace["smtplib"].SMTPAuthenticationError as error:
    assert error.smtp_code in (535, 550), error.smtp_code
admin.api("/admin/users/" + managed["id"], "PATCH", {**limits, "enabled": True}, expected=202)
for _ in range(40):
    if next(item for item in admin.api("/admin/users")["items"] if item["id"] == managed["id"])["status"] == "active":
        break
    time.sleep(.25)
actor.api("/account", expected=401)
Actor(actor.email, reset_password)
print("PASS: suspension blocks platform and protocol access; re-enable does not revive old website sessions")
admin.api("/admin/registration", "PATCH", {"enabled": False, "maximumAccounts": 100, "quotaBytes": 1073741824, "attachmentBytes": 20971520, "hourlyRecipients": 10, "dailyRecipients": 50}, expected=204)
print("All real isolated identity checks passed; registration closed again.")
