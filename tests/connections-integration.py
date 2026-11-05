"""Two REAL disposable Stalwart servers. Never accepts production endpoints.

Only local account enrollment and human verification inputs are fixture-seeded
with the disposable app stopped. Authentication, initialization, JMAP, policy
updates, callback verification, sessions and revocation use the real APIs.
"""
import base64
import http.cookies
import json
import os
from pathlib import Path
import secrets
import shutil
import smtplib
import sqlite3
import ssl
import subprocess
import time
import urllib.error
import urllib.request
import uuid

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / "tests/runtime/connections"
SOURCE = PROJECT / "tests/runtime/platform"
NAME = "mail-web-connections-test"
SECOND = "mail-web-stalwart-secondary-test"
BASE = "http://127.0.0.1:19195"
ORIGIN = "http://mail-web-connections-test:8080"
UPSTREAM = "http://mail-web-stalwart-secondary-test:8080"
IMAGE = os.environ.get("MAIL_WEB_TEST_IMAGE", "mail-web:ci")


def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()


def request(url, method="GET", body=None, headers=None):
    data = None if body is None else body if isinstance(body, bytes) else json.dumps(body).encode()
    hdr = dict(headers or {})
    if data is not None:
        hdr.setdefault("Content-Type", "application/json")
    try:
        response = urllib.request.urlopen(urllib.request.Request(url, data, hdr, method=method), timeout=25)
    except urllib.error.HTTPError as error:
        response = error
    payload = response.read()
    try:
        value = json.loads(payload) if payload else None
    except (json.JSONDecodeError, UnicodeDecodeError):
        value = payload
    return response.status, value, response.headers


def rpc(port, auth, method, args):
    status, value, _ = request(f"http://127.0.0.1:{port}/jmap/", "POST",
        {"using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission", "urn:stalwart:jmap"], "methodCalls": [[method, args, "test"]]}, {"Authorization": auth})
    assert status == 200, (method, status)
    actual, result, _ = value["methodResponses"][0]
    assert actual == method and not result.get("notCreated") and not result.get("notUpdated"), (method, result.get("type"), result.get("notCreated"), result.get("notUpdated"))
    return result


def basic(user, password):
    return "Basic " + base64.b64encode((user + ":" + password).encode()).decode()


def wait(url):
    for _ in range(100):
        try:
            if request(url)[0] == 200:
                return
        except OSError:
            pass
        time.sleep(.2)
    raise AssertionError("Disposable service did not start: " + url)


def api(path, method="GET", body=None, cookie=None, expected=200):
    headers = {"Origin": ORIGIN}
    if cookie:
        headers.update(cookie)
    else:
        headers["Authorization"] = "Bearer " + capability
    status, data, response = request(BASE + "/api/v1" + path, method, body, headers)
    assert status == expected, (method, path, status, data)
    return data, response


def login(email, password, expected=204):
    _, headers = api("/auth/login", "POST", {"email": email, "password": password}, {}, expected)
    if expected != 204:
        return None
    jar = http.cookies.SimpleCookie()
    for entry in headers.get_all("Set-Cookie"):
        jar.load(entry)
    return {"Cookie": "; ".join(k + "=" + v.value for k, v in jar.items()), "X-CSRF-Token": jar["mail_csrf"].value}


def start():
    docker("start", NAME)
    wait(BASE + "/api/v1/health/ready")


def create_account(port, auth, domain, name, password, permissions):
    return rpc(port, auth, "x:Account/set", {"create": {"fixture": {"@type": "User", "name": name, "domainId": domain,
        "roles": {"@type": "User"}, "permissions": permissions, "quotas": {"maxDiskQuota": 1073741824, "maxApiKeys": 64},
        "credentials": {"0": {"@type": "Password", "secret": password}}}}})["created"]["fixture"]["id"]


for directory in ["secrets", "config", "data", "logs", "stalwart/etc", "stalwart/data"]:
    (ROOT / directory).mkdir(parents=True, exist_ok=True)
for file in (SOURCE / "secrets").iterdir():
    if file.is_file():
        shutil.copy2(file, ROOT / "secrets" / file.name)
admin_a = basic("bootstrap", (PROJECT / "tests/runtime/bootstrap.secret").read_text().strip())
password_b = secrets.token_hex(24)
admin_b = basic("bootstrap", password_b)
for container in [NAME, SECOND]:
    subprocess.run(["docker", "rm", "-f", container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
subprocess.run(["chown", "-R", "2000:2000", str(ROOT / "stalwart")], check=True)
docker("run", "-d", "--pull", "never", "--name", SECOND, "--init", "--network", "mail-web-test", "-p", "127.0.0.1:19081:8080",
    "-e", "STALWART_PUBLIC_URL=" + UPSTREAM, "-e", "STALWART_RECOVERY_ADMIN=bootstrap:" + password_b,
    "-v", str(ROOT / "stalwart/etc") + ":/etc/stalwart", "-v", str(ROOT / "stalwart/data") + ":/var/lib/stalwart", "stalwartlabs/stalwart:v1.0.1-alpine")
try:
    wait("http://127.0.0.1:19081/healthz/live")
    rpc(19081, admin_b, "x:Bootstrap/set", {"update": {"singleton": {"defaultHostname": "mx.second.example.com", "defaultDomain": "second.example.com", "requestTlsCertificate": False, "generateDkimKeys": False, "tracer": {"@type": "Stdout", "ansi": False}}}})
    docker("restart", SECOND)
    wait("http://127.0.0.1:19081/healthz/live")
    env = (SOURCE / "app.env").read_text().replace("PUBLIC_ORIGIN=http://mail-web:8080", "PUBLIC_ORIGIN=" + ORIGIN)
    env += "\nSETUP_TOKEN_FILE=/runtime/secrets/setup.key\nRUNTIME_CONFIG_FILE=/runtime/config/runtime.enc\n"
    (ROOT / "app.env").write_text(env)
    docker("run", "-d", "--pull", "never", "--user", "0:0", "--name", NAME, "--network", "mail-web-test", "-p", "127.0.0.1:19195:8080",
        "--env-file", str(ROOT / "app.env"), "-v", str(ROOT) + ":/runtime", IMAGE)
    wait(BASE + "/api/v1/health/ready")
    capability = (ROOT / "secrets/setup.key").read_text().strip()
    domain_a = (SOURCE / "config/domain-id").read_text().strip()
    permissions = rpc(19080, admin_a, "x:Account/get", {"properties": ["id", "name", "permissions"]})["list"]
    permissions = next(item["permissions"] for item in permissions if item["name"] == "operator-v2")
    password = secrets.token_hex(24)
    local_name = "same-" + secrets.token_hex(4)
    remote_a = create_account(19080, admin_a, domain_a, local_name, password, permissions)
    email_a = local_name + "@mail.example.com"
    api("/installation/operator", "POST", {"email": email_a, "password": password, "recovery": "multi-operator@example.net"}, expected=204)
    actor_a = login(email_a, password)
    original_a = rpc(19080, admin_a, "x:Account/get", {"ids": [remote_a], "properties": ["id", "roles", "quotas", "permissions"]})["list"][0]
    hook_a = (SOURCE / "config/mta-hook-id").read_text().strip()
    original_hook_a = rpc(19080, admin_a, "x:MtaHook/get", {"ids": [hook_a]})["list"][0]
    service_id = str(uuid.uuid4())
    api("/installation/connections/prepare", "POST", {"id": service_id, "name": "Second real server", "origin": UPSTREAM})
    api("/installation/connections/prepare", "POST", {"id": str(uuid.uuid4()), "name": "duplicate", "origin": UPSTREAM}, expected=409)
    path = "/installation/initialize/"
    scoped = lambda name: path + name + "?serviceId=" + service_id
    grant = api(scoped("authorize"), "POST", {"base": UPSTREAM, "username": "bootstrap", "password": password_b})[0]
    assert not grant["missingPermissions"]
    spec = {"brand": "Mail Web", "domain": "second.example.com", "publicOrigin": ORIGIN, "createDomain": False, "operatorMode": "existing", "operatorEmail": "", "recoveryEmail": "", "cloudflareAccount": ""}
    body = {"ticket": grant["ticket"], "spec": spec}
    api(path + "preflight", "POST", body, expected=401)  # Cannot spend B's grant on A.
    api(scoped("preflight"), "POST", body)
    api(scoped("job"), "POST", body)
    api(scoped("job"), "POST", body, expected=409)
    for _ in range(160):
        job = api(scoped("job"))[0]["job"]
        assert password_b not in json.dumps(job)
        assert job["status"] not in ["failed", "interrupted"], job
        if job["status"] == "completed":
            break
        time.sleep(.25)
    else:
        raise AssertionError("Second-server initialization did not complete")
    registry = api("/installation/connections")[0]
    domain_b = next(d["id"] for d in registry["domains"] if d["serviceId"] == service_id)
    assert not job["resources"].get("operator"), "Second source must not create another operator"
    assert docker("inspect", "--format", "{{.RestartCount}}", NAME) == "0"
    assert rpc(19080, admin_a, "x:Account/get", {"ids": [remote_a], "properties": ["id", "roles", "quotas", "permissions"]})["list"][0] == original_a
    assert rpc(19080, admin_a, "x:MtaHook/get", {"ids": [hook_a]})["list"][0] == original_hook_a
    print("PASS: second real Stalwart auto-configuration, scoped authorization, no restart/operator duplication or changes to A")

    # Real Stalwart uses short allocated IDs. Allocate only disposable ordinary
    # fixtures on B until its ID matches A, without altering either server's IDs.
    remote_b = None
    for index in range(128):
        candidate = create_account(19081, admin_b, job["resources"]["domain"], "collision-" + str(index), password, permissions)
        if candidate == remote_a:
            remote_b = candidate
            break
    assert remote_b == remote_a, "Could not exercise a real upstream-ID collision"
    rpc(19081, admin_b, "x:Account/set", {"update": {remote_b: {"name": local_name}}})
    email_b = local_name + "@second.example.com"
    login(email_b, password, 401)  # Real upstream account alone is not sufficient.
    docker("stop", NAME)
    user_b = uuid.uuid4()
    with sqlite3.connect(ROOT / "data/db/mail-web.sqlite") as db:
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("INSERT INTO platform_users(id,email,recovery_email,stalwart_id,status,service_id,domain_id) VALUES (?,?,?,?,'active',?,?)", (user_b.bytes, email_b, "multi-b@example.net", remote_b, service_id, domain_b))
        assert db.execute("SELECT count(*) FROM platform_users WHERE operator=1").fetchone()[0] == 1
    start()
    actor_b = login(email_b, password)
    assert api("/auth/session", cookie=actor_b)[0]["domainId"] == domain_b
    api("/account", cookie=actor_a)  # Existing session survives mapping migration/restart.
    api("/admin/users?domainId=" + domain_b, cookie=actor_b, expected=403)
    users = api("/admin/users?domainId=" + domain_b, cookie=actor_a)[0]["items"]
    assert len(users) == 1 and users[0]["email"] == email_b
    api("/admin/users/" + str(user_b), "PATCH", {"enabled": True, "quota_bytes": 134217728, "hourly_recipients": 2, "daily_recipients": 4}, actor_a, 202)
    for _ in range(80):
        quota = rpc(19081, admin_b, "x:Account/get", {"ids": [remote_b], "properties": ["id", "quotas"]})["list"][0]["quotas"]["maxDiskQuota"]
        if quota == 134217728:
            break
        time.sleep(.25)
    assert quota == 134217728
    assert rpc(19080, admin_a, "x:Account/get", {"ids": [remote_a], "properties": ["id", "roles", "quotas", "permissions"]})["list"][0] == original_a
    saved = []
    for tag, actor, email in [("A", actor_a, email_a), ("B", actor_b, email_b)]:
        draft = {"to": [email], "cc": [], "bcc": [], "subject": "Server " + tag, "text": "Isolated " + tag, "attachments": []}
        boundary = "mailweb" + uuid.uuid4().hex
        attachment = ("Private attachment from " + tag).encode()
        multipart = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="proof.txt"\r\nContent-Type: text/plain\r\n\r\n'.encode() + attachment + f"\r\n--{boundary}--\r\n".encode())
        blob = api("/attachments", "POST", multipart, {**actor, "Content-Type": "multipart/form-data; boundary=" + boundary})[0]
        draft["attachments"] = [blob]
        message = api("/drafts", "POST", draft, actor)[0]["id"]
        saved.append(message)
        detail = api("/messages/" + message, cookie=actor)[0]
        assert detail["subject"] == "Server " + tag
        assert api("/attachments/" + detail["attachments"][0]["blobId"] + "?message=" + message, cookie=actor)[0] == attachment
    assert api("/messages/" + saved[0], cookie=actor_a)[0]["subject"] == "Server A"
    assert api("/messages/" + saved[1], cookie=actor_b)[0]["subject"] == "Server B"
    assert api("/account/usage", cookie=actor_b)[0]["quotaBytes"] == 134217728
    assert api("/account/capabilities", cookie=actor_b)[0]["appPasswords"]
    api("/account", "PATCH", {"display_name": "Source B"}, actor_b, 204)
    api("/account", "PATCH", {"theme": "dark"}, actor_b, 204)
    profile_b = api("/account", cookie=actor_b)[0]
    assert profile_b["displayName"] == "Source B" and profile_b["preferences"]["theme"] == "dark"
    assert api("/account", cookie=actor_a)[0]["displayName"] != "Source B"
    print("PASS: equal real upstream IDs and names, local enrollment boundary, mail/drafts/quotas/admin/session isolation")

    # An additional domain reuses this connection's runtime keys and Hook.
    rpc(19081, admin_b, "x:Domain/set", {"create": {"extra": {"name": "extra.second.example.com"}}})
    api("/installation/connections", "POST", {"id": service_id, "name": "Second real server", "origin": UPSTREAM, "settings": {}, "domains": ["second.example.com", "extra.second.example.com"]})
    domains = api("/registration/domains")[0]["items"]
    assert {d["domain"] for d in domains} >= {"mail.example.com", "second.example.com", "extra.second.example.com"}
    assert "stalwart" not in json.dumps(domains).lower()
    report = api("/installation/readiness?domainId=" + domain_b, "POST")[0]
    assert all(item["status"] == "passed" for item in report["items"]), report
    assert not report["ready"]  # Human inputs have not been completed.
    policy = api("/admin/registration?domainId=" + domain_b, cookie=actor_a)[0]["policy"]
    api("/admin/registration?domainId=" + domain_b, "PATCH", {**policy, "enabled": True}, actor_a, 409)
    # Human verification is seeded ONLY in this stopped disposable DB.
    docker("stop", NAME)
    with sqlite3.connect(ROOT / "data/db/mail-web.sqlite") as db:
        db.execute("UPDATE registration_readiness SET human_verified_at=?", (int(time.time()*1000),))
    start()
    report = api("/installation/readiness?domainId=" + domain_b, "POST")[0]
    assert report["ready"], report
    api("/admin/registration?domainId=" + domain_b, "PATCH", {**policy, "enabled": True}, actor_a, 204)
    assert not api("/admin/registration", cookie=actor_a)[0]["policy"]["enabled"]
    assert api("/admin/registration?domainId=" + domain_b, cookie=actor_a)[0]["policy"]["enabled"]
    print("PASS: per-domain policy and real dependency checks, fail-closed before fixture human verification, A unchanged")
    extra = next(d["id"] for d in rpc(19081, admin_b, "x:Domain/get", {"properties": ["id", "name"]})["list"] if d["name"] == "extra.second.example.com")
    create_account(19081, admin_b, extra, "receiver", secrets.token_hex(24), permissions)
    target = "receiver@extra.second.example.com"
    submission = {"idempotency_key": str(uuid.uuid4()), "draft": {"to": [target], "cc": [], "bcc": [], "subject": "B quota", "text": "Real second server JMAP", "attachments": []}}
    assert api("/submissions", "POST", submission, actor_b)[0]["status"] == "submitted"
    ip = docker("inspect", "--format", '{{(index .NetworkSettings.Networks "mail-web-test").IPAddress}}', SECOND)
    assert ip.startswith(("172.", "10.", "192.168."))
    def smtp():
        with smtplib.SMTP_SSL(ip, 465, timeout=15, context=ssl._create_unverified_context()) as server:
            server.ehlo()
            server.login(email_b, password)
            server.sendmail(email_b, [target], f"From: {email_b}\r\nTo: {target}\r\nSubject: B SMTP\r\n\r\nReal source-specific Hook.\r\n")
    smtp()
    try:
        smtp()
        raise AssertionError("B SMTP bypassed its JMAP-shared recipient limit")
    except smtplib.SMTPDataError as error:
        assert error.smtp_code == 451, error.smtp_code
    with sqlite3.connect(f"file:{ROOT / 'data/db/mail-web.sqlite'}?mode=ro", uri=True) as db:
        counts = dict(db.execute("SELECT service_id,sum(recipient_count) FROM outbound_reservations GROUP BY service_id"))
        assert counts.get(service_id) == 2 and counts.get("default", 0) == 0, counts
    print("PASS: second-server real JMAP/SMTP shared durable quota through its own Hook, no counter pollution on A")
    docker("stop", SECOND)
    api("/mailboxes", cookie=actor_a)
    api("/mailboxes", cookie=actor_b, expected=502)
    docker("start", SECOND)
    wait("http://127.0.0.1:19081/healthz/live")
    api("/auth/logout", "POST", {}, actor_b, 204)
    api("/account", cookie=actor_a)
    logs = docker("logs", NAME)
    assert password_b not in logs and password not in logs
    assert password_b.encode() not in (ROOT / "config" / ("initialization-" + service_id + ".enc")).read_bytes()
    print("PASS: isolated source outage, other source continuity, revocation target and administrator-secret non-disclosure")
finally:
    for container in [NAME, SECOND]:
        subprocess.run(["docker", "stop", container], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
