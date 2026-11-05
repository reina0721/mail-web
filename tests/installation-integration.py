"""Fresh setup against the disposable real Stalwart; never uses production data."""
import http.cookiejar
import json
import os
from pathlib import Path
import shutil
import subprocess
import time
import urllib.error
import urllib.request

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT / "tests/runtime/installation"
SOURCE = PROJECT / "tests/runtime/platform"
NAME = "mail-web-setup-test"
ORIGIN = "http://127.0.0.1:19192"
IMAGE = os.environ.get("MAIL_WEB_TEST_IMAGE", "mail-web:ci")

def docker(*args):
    return subprocess.check_output(["docker", *args], text=True).strip()

def request(path, method="GET", body=None, capability=None, origin=ORIGIN, opener=None, csrf=None):
    headers = {"Origin": origin}
    if capability:
        headers["Authorization"] = "Bearer " + capability
    if csrf:
        headers["X-CSRF-Token"] = csrf
    data = None if body is None else json.dumps(body).encode()
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(ORIGIN + "/api/v1" + path, data=data, headers=headers, method=method)
    try:
        open_request = opener.open if opener else urllib.request.urlopen
        with open_request(req, timeout=20) as response:
            payload = response.read()
            return response.status, json.loads(payload) if payload else None
    except urllib.error.HTTPError as error:
        return error.code, json.loads(error.read())

def wait_ready():
    for _ in range(60):
        try:
            code, value = request("/installation")
            if code == 200:
                return value
        except OSError:
            pass
        time.sleep(0.5)
    raise AssertionError("Fresh installation did not become ready")

def restart_after_save():
    for _ in range(40):
        if docker("inspect", "--format", "{{.State.Running}}", NAME) == "false":
            break
        time.sleep(0.25)
    else:
        raise AssertionError("Configuration save did not shut down the old process")
    docker("start", NAME)
    return wait_ready()

for directory in ["config", "secrets", "data", "logs"]:
    (ROOT / directory).mkdir(parents=True, exist_ok=True)
shutil.copy2(SOURCE / "secrets/session.key", ROOT / "secrets/session.key")
subprocess.run(["docker", "rm", "-f", NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
docker("run", "-d", "--pull", "never", "--user", "0:0", "--name", NAME,
       "--network", "mail-web-test", "-p", "127.0.0.1:19192:8080",
       "-e", "BIND_ADDR=0.0.0.0:8080", "-e", "ALLOW_INSECURE_TEST_UPSTREAM=true",
       "-e", "SESSION_KEY_FILE=/runtime/secrets/session.key",
       "-e", "SETUP_TOKEN_FILE=/runtime/secrets/setup.key",
       "-e", "RUNTIME_CONFIG_FILE=/runtime/config/runtime.enc",
       "-e", "DATABASE_PATH=/runtime/data/mail.sqlite", "-e", "LOG_DIR=/runtime/logs",
       "-e", "STAGING_DIR=/runtime/data/staging", "-v", str(ROOT) + ":/runtime", IMAGE)
try:
    initial = wait_ready()
    assert initial["configured"] is False and initial["domain"] == "" and initial["needsOperator"]
    capability = (ROOT / "secrets/setup.key").read_text().strip()
    assert request("/installation/config")[0] == 401
    assert request("/installation/config", capability="0" * 64)[0] == 401
    service_key = (SOURCE / "secrets/provisioning.key").read_text().strip()
    settings = {"brand": "Independent Test Mail", "domain": "mail.example.com", "publicOrigin": ORIGIN,
                "stalwartUrl": "http://mail-web-stalwart-test:8080", "provisioningKey": service_key}
    probe = {"stalwartUrl": settings["stalwartUrl"], "provisioningKey": service_key,
             "domain": "mail.example.com", "publicOrigin": ORIGIN}
    assert request("/installation/discover", "POST", probe)[0] == 401
    assert request("/installation/discover", "POST", probe, capability, "https://attacker.example")[0] == 403
    code, found = request("/installation/discover", "POST", probe, capability)
    assert code == 200, (code, found)
    assert found["persisted"] is False and found["sections"]["accounts"] == "ready"
    assert any(d["name"] == "mail.example.com" for d in found["domains"])
    assert any(a["email"] == "operator-v2@mail.example.com" for a in found["accounts"])
    assert all(a["email"].endswith("@mail.example.com") for a in found["accounts"])
    assert not any(a["name"] == "mail-web-service" for a in found["accounts"])
    assert service_key not in json.dumps(found)
    assert (SOURCE / "secrets/mta-hook.key").read_text().strip() not in json.dumps(found)
    assert not (ROOT / "config/runtime.enc").exists()
    assert request("/installation")[1]["instanceId"] == initial["instanceId"]
    assert request("/installation/config", "PUT", settings, capability, "https://attacker.example")[0] == 403
    wrong_domain = dict(settings, domain="not-configured.example")
    assert request("/installation/config", "PUT", wrong_domain, capability)[0] == 400
    assert not (ROOT / "config/runtime.enc").exists()
    code, saved = request("/installation/config", "PUT", settings, capability)
    assert code == 200 and saved["saved"] and saved["restartRequired"]
    assert service_key.encode() not in (ROOT / "config/runtime.enc").read_bytes()
    current = restart_after_save()
    assert current["configured"] and current["instanceId"] != initial["instanceId"]
    assert current["brand"] == settings["brand"] and current["domain"] == "mail.example.com"
    moved = {"stalwartUrl": "https://different.example.com", "domain": "mail.example.com"}
    assert request("/installation/discover", "POST", moved, capability)[0] == 400
    assert request("/installation/config", "PUT", dict(settings, stalwartUrl=moved["stalwartUrl"], provisioningKey=None), capability)[0] == 400
    assert request("/installation/discover", "POST", dict(probe, provisioningKey=None), capability)[0] == 200
    code, view = request("/installation/config", capability=capability)
    assert code == 200 and view["provisioningKeySet"] and not view["settings"].get("provisioningKey")
    password = (SOURCE / "secrets/operator.initial-password").read_text().strip()
    assert request("/installation/operator", "POST", {"email": "operator-v2@mail.example.com", "password": password,
                   "recovery": "installation-recovery@example.net"}, capability)[0] == 204
    assert request("/installation")[1]["needsOperator"] is False
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    assert request("/auth/login", "POST", {"email": "operator-v2@mail.example.com", "password": password}, opener=opener)[0] == 204
    csrf = next(cookie.value for cookie in jar if cookie.name == "mail_csrf")
    assert request("/installation/config", opener=opener)[0] == 200
    event_stream = opener.open(ORIGIN + "/api/v1/events", timeout=20)
    assert b"event: sync" in event_stream.readline()
    update = dict(view["settings"], brand="Renamed Test Mail")
    assert request("/installation/config", "PUT", update, opener=opener, csrf=csrf)[0] == 200
    current = restart_after_save()
    event_stream.close()
    assert current["brand"] == "Renamed Test Mail"
    assert request("/installation/config", opener=opener)[1]["provisioningKeySet"]
    assert request("/auth/session", opener=opener)[0] == 200
    assert request("/installation/config", "PUT", dict(update, domain="another.example"), opener=opener, csrf=csrf)[0] == 409
    assert request("/auth/logout", "POST", opener=opener, csrf=csrf)[0] == 204
    print("PASS: fresh setup, capability/origin guards, real domain validation, encrypted restart, ordinary operator enrollment, HTTP session/CSRF and configuration update")
finally:
    subprocess.run(["docker", "stop", NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
