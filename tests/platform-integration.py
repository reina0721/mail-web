"""Real isolated application + Stalwart checks; never accepts production URLs."""
import base64
import http.cookies
import json
import os
from pathlib import Path
import secrets
import smtplib
import sqlite3
import ssl
import subprocess
import time
import urllib.error
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parent / "runtime" / "platform"
assert ROOT.parent.name == "runtime" and ROOT.parent.parent.name == "tests"
BASE = "http://127.0.0.1:19190"
JMAP = "http://127.0.0.1:19080/jmap/"


def request(url, method="GET", body=None, headers=None):
    data = None if body is None else (body if isinstance(body, bytes) else json.dumps(body).encode())
    hdr = dict(headers or {})
    if data is not None:
        hdr.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, data, hdr, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=25)
    except urllib.error.HTTPError as error:
        response = error
    data = response.read()
    try:
        value = json.loads(data) if data else None
    except json.JSONDecodeError:
        value = data
    return response.status, value, response.headers


def jmap(auth, method, arguments):
    status, value, _ = request(JMAP, "POST", {"using": ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission", "urn:stalwart:jmap"], "methodCalls": [[method, arguments, "test"]]}, {"Authorization": auth})
    assert status == 200, (method, status)
    name, result, _ = value["methodResponses"][0]
    assert name == method, (method, result.get("type"))
    assert not result.get("notCreated") and not result.get("notUpdated"), (method, result.get("notCreated"), result.get("notUpdated"))
    return result


class Actor:
    def __init__(self, email, password):
        self.email, self.password = email, password
        status, _, headers = request(BASE + "/api/v1/auth/login", "POST", {"email": email, "password": password}, {"Origin": BASE})
        assert status == 204, ("login", status)
        cookies = http.cookies.SimpleCookie()
        for header in headers.get_all("Set-Cookie"):
            cookies.load(header)
        self.cookie = "; ".join(f"{key}={value.value}" for key, value in cookies.items())
        self.csrf = cookies["__Host-mail_csrf"].value

    def api(self, path, method="GET", body=None, expected=200, content_type=None):
        headers = {"Cookie": self.cookie, "Origin": BASE, "X-CSRF-Token": self.csrf}
        if content_type:
            headers["Content-Type"] = content_type
        status, data, response_headers = request(BASE + "/api/v1" + path, method, body, headers)
        assert status == expected, (method, path.split("?")[0], status, data if isinstance(data, dict) else "response")
        assert response_headers.get("Cache-Control") == "no-store"
        return data


def database():
    return sqlite3.connect(f"file:{ROOT / 'data/db/mail-web.sqlite'}?mode=ro", uri=True)


def start():
    subprocess.run(["docker", "start", "mail-web-app-test"], check=True, stdout=subprocess.DEVNULL)
    for _ in range(30):
        try:
            if request(BASE + "/api/v1/health/ready")[0] == 200:
                return
        except OSError:
            pass
        time.sleep(0.2)
    raise AssertionError("isolated app did not restart")


def draft(to, subject):
    return {"to": [to], "cc": [], "bcc": [], "subject": subject, "text": "Real integration content " + uuid.uuid4().hex, "attachments": []}


start()
admin = Actor("operator-v2@iqwq.com", (ROOT / "secrets/operator.initial-password").read_text().strip())
service = "Bearer " + (ROOT / "secrets/provisioning.key").read_text().strip()
name = "isolation-" + secrets.token_hex(4)
password = secrets.token_hex(24)
foreign_domain = next(item["id"] for item in jmap(service, "x:Domain/get", {"properties": ["id", "name"]})["list"] if item["name"] == "example.com")
foreign_email = name + "@example.com"
jmap(service, "x:Account/set", {"create": {"receiver": {"@type": "User", "name": name, "domainId": foreign_domain, "roles": {"@type": "User"}, "credentials": {"0": {"@type": "Password", "secret": secrets.token_hex(24)}}}}})
domain = (ROOT / "config/domain-id").read_text().strip()
account = jmap(service, "x:Account/set", {"create": {"fixture": {"@type": "User", "name": name, "domainId": domain, "roles": {"@type": "User"}, "credentials": {"0": {"@type": "Password", "secret": password}}, "quotas": {"maxDiskQuota": 1073741824}}}})["created"]["fixture"]["id"]
email = name + "@iqwq.com"
# Seed only the explicitly named disposable database, with the app stopped.
# No concurrent SQLite writer or production credential is involved here.
subprocess.run(["docker", "stop", "mail-web-app-test"], check=True, stdout=subprocess.DEVNULL)
connection = sqlite3.connect(ROOT / "data/db/mail-web.sqlite")
user = uuid.uuid4()
connection.execute("PRAGMA foreign_keys=ON")
connection.execute("DELETE FROM outbound_reservations WHERE user_id=(SELECT id FROM platform_users WHERE email=?)", (admin.email,))
connection.execute("INSERT INTO platform_users(id,email,recovery_email,stalwart_id,status) VALUES (?,?,?,?,'active')", (user.bytes, email, name + "@example.net", account))
connection.commit()
names = []
for address, account_id in connection.execute("SELECT email,stalwart_id FROM platform_users WHERE stalwart_id IS NOT NULL"):
    names.extend([address, address.split("@")[0], account_id])
connection.close()
hook = (ROOT / "config/mta-hook-id").read_text().strip()
jmap(service, "x:MtaHook/set", {"update": {hook: {"enable": {"else": "!is_empty(authenticated_as) && contains(" + json.dumps(names) + ", to_lowercase(authenticated_as))"}}}})
jmap(service, "x:Action/set", {"create": {"reload": {"@type": "ReloadSettings"}}})
start()
ordinary = Actor(email, password)
ordinary.api("/admin/users", expected=403)
admin_profile = admin.api("/account")
assert admin_profile["quotaBytes"] == 1073741824
print("PASS: real login, account quota and operator boundary")

value = draft(admin.email, "Private draft " + name)
boundary = "mailweb" + uuid.uuid4().hex
attachment = b"Real attachment ownership and round-trip proof."
multipart = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="proof.txt"\r\nContent-Type: text/plain\r\n\r\n'.encode() + attachment + f"\r\n--{boundary}--\r\n".encode())
blob = admin.api("/attachments", "POST", multipart, content_type="multipart/form-data; boundary=" + boundary)
value["attachments"] = [{"blob_id": blob["blobId"], "name": "proof.txt", "type": "text/plain"}]
saved = admin.api("/drafts", "POST", value)["id"]
detail = admin.api("/messages/" + saved)
assert detail["subject"] == value["subject"] and detail["attachments"][0]["name"] == "proof.txt"
assert admin.api("/attachments/" + detail["attachments"][0]["blobId"] + "?message=" + saved) == attachment
ordinary.api("/messages/" + saved, expected=404)
ordinary.api("/attachments/" + blob["blobId"] + "?message=" + saved, expected=404)
ordinary.api("/drafts", "POST", {**draft(email, "Foreign attachment"), "attachments": value["attachments"]}, expected=403)
assert admin.api("/messages/" + saved)["subject"] == value["subject"]
print("PASS: persistent draft, streamed attachment round-trip and two-user isolation")

users = admin.api("/admin/users")["items"]
operator = next(item for item in users if item["email"] == admin.email)
admin.api("/admin/users/" + operator["id"], "PATCH", {"enabled": True, "quota_bytes": 1073741824, "hourly_recipients": 3, "daily_recipients": 4}, expected=202)
# A second local Stalwart domain exercises the platform's external-recipient
# policy without sending test messages onto the public Internet.
external = draft(foreign_email, "Quota test " + name)
key = uuid.uuid4().hex
submitted = admin.api("/submissions", "POST", {"idempotency_key": key, "draft": external})
assert submitted["status"] == "submitted", submitted
repeated = admin.api("/submissions", "POST", {"idempotency_key": key, "draft": external})
assert repeated["operationId"] == submitted["operationId"]
with database() as db:
    operator_account = db.execute("SELECT stalwart_id FROM platform_users WHERE email=?", (admin.email,)).fetchone()[0]

basic = "Basic " + base64.b64encode((admin.email + ":" + admin.password).encode()).decode()
boxes = jmap(basic, "Mailbox/get", {"accountId": operator_account})["list"]
draft_box = next(item["id"] for item in boxes if item["role"] == "drafts")
native = jmap(basic, "Email/set", {"accountId": operator_account, "create": {"native": {"mailboxIds": {draft_box: True}, "from": [{"email": admin.email}], "to": [{"email": foreign_email}], "subject": "Native JMAP quota " + name, "textBody": [{"partId": "t", "type": "text/plain"}], "bodyValues": {"t": {"value": "Native JMAP", "isTruncated": False, "isEncodingProblem": False}}}}})["created"]["native"]["id"]
identity = jmap(basic, "Identity/get", {"accountId": operator_account})["list"][0]["id"]
jmap(basic, "EmailSubmission/set", {"accountId": operator_account, "create": {"native": {"emailId": native, "identityId": identity}}})
with database() as db:
    count = db.execute("SELECT coalesce(sum(recipient_count),0) FROM outbound_reservations WHERE user_id=?", (uuid.UUID(operator["id"]).bytes,)).fetchone()[0]
assert count == 2, ("Webmail and native JMAP share counters", count)
print("PASS: Webmail/native JMAP shared count and no duplicate submission")

ip = subprocess.check_output(["docker", "inspect", "--format", '{{(index .NetworkSettings.Networks "mail-web-test").IPAddress}}', "mail-web-stalwart-test"], text=True).strip()
assert ip.startswith(("172.", "10.", "192.168."))


def smtp(authenticated=True):
    connection = (smtplib.SMTP_SSL(ip, 465, timeout=15, context=ssl._create_unverified_context())
                  if authenticated else smtplib.SMTP(ip, 25, timeout=15))
    with connection as server:
        server.ehlo()
        # Self-signed certificate only in this named, isolated test container.
        if server.has_extn("starttls"):
            server.starttls(context=ssl._create_unverified_context())
            server.ehlo()
        if authenticated:
            server.login(admin.email, admin.password)
        target = foreign_email if authenticated else ordinary.email
        sender = admin.email if authenticated else "sender@outside.invalid"
        server.sendmail(sender, [target], f"From: {sender}\r\nTo: {target}\r\nSubject: SMTP integration {name}\r\n\r\nReal SMTP quota check.\r\n")


subprocess.run(["docker", "stop", "mail-web-app-test"], check=True, stdout=subprocess.DEVNULL)
try:
    smtp()
    raise AssertionError("authenticated submission bypassed unavailable policy")
except smtplib.SMTPDataError as error:
    assert error.smtp_code == 451, error.smtp_code
smtp(authenticated=False)
start()
smtp()
try:
    smtp()
    raise AssertionError("SMTP bypassed the shared quota")
except smtplib.SMTPDataError as error:
    assert error.smtp_code == 451, error.smtp_code
with database() as db:
    count = db.execute("SELECT sum(recipient_count) FROM outbound_reservations WHERE user_id=?", (uuid.UUID(operator["id"]).bytes,)).fetchone()[0]
assert count == 3, count
print("PASS: SMTP shares durable quota; outage fails closed and external incoming remains accepted")
print("All real isolated platform integration checks passed.")
