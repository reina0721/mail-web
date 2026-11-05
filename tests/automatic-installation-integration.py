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
ROOT = PROJECT / "tests/runtime/automatic-installation"
SOURCE = PROJECT / "tests/runtime/platform"
NAME = "mail-web-auto-test"
ORIGIN = "http://127.0.0.1:19193"
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


def exercise(mode):
    global ROOT
    ROOT = PROJECT / ("tests/runtime/automatic-installation-" + mode)
    for directory in ["config", "secrets", "data", "logs"]:
        (ROOT / directory).mkdir(parents=True, exist_ok=True)
    shutil.copy2(SOURCE / "secrets/session.key", ROOT / "secrets/session.key")
    subprocess.run(["docker", "rm", "-f", NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    docker("run", "-d", "--pull", "never", "--user", "0:0", "--name", NAME,
           "--network", "mail-web-test", "-p", "127.0.0.1:19193:8080", "-e", "BIND_ADDR=0.0.0.0:8080",
           "-e", "ALLOW_INSECURE_TEST_UPSTREAM=true", "-e", "ALLOW_HTTP=true",
           "-e", "SESSION_KEY_FILE=/runtime/secrets/session.key", "-e", "SETUP_TOKEN_FILE=/runtime/secrets/setup.key",
           "-e", "RUNTIME_CONFIG_FILE=/runtime/config/runtime.enc", "-e", "DATABASE_PATH=/runtime/data/mail.sqlite",
           "-e", "LOG_DIR=/runtime/logs", "-e", "STAGING_DIR=/runtime/data/staging", "-v", str(ROOT) + ":/runtime", IMAGE)
    job = None
    try:
        initial = wait_ready()
        capability = (ROOT / "secrets/setup.key").read_text().strip()
        admin_password = (PROJECT / "tests/runtime/bootstrap.secret").read_text().strip()
        credentials = {"base": "http://mail-web-stalwart-test:8080", "username": "bootstrap", "password": admin_password}
        admin_key = None
        if mode == "new":
            # Exercise administrator API-key authorization independently of Basic.
            import base64
            def admin_rpc(method, arguments):
                payload = json.dumps({"using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"], "methodCalls": [[method, arguments, "t"]]}).encode()
                req = urllib.request.Request("http://127.0.0.1:19080/jmap/", data=payload, headers={"Content-Type": "application/json", "Authorization": "Basic " + base64.b64encode(("bootstrap:" + admin_password).encode()).decode()})
                with urllib.request.urlopen(req) as response:
                    return json.load(response)["methodResponses"][0][1]
            domain_id = next(d["id"] for d in admin_rpc("x:Domain/get", {"properties": ["id", "name"]})["list"] if d["name"] == "mail.example.com")
            permissions = {name: True for name in ["sysAccountGet", "sysAccountCreate", "sysAccountUpdate", "sysAccountQuery", "sysDomainGet", "sysDomainCreate", "sysDomainQuery", "sysMtaHookGet", "sysMtaHookCreate", "sysMtaHookUpdate", "sysActionCreate", "actionReloadSettings"]}
            account = admin_rpc("x:Account/set", {"create": {"admin": {"@type": "User", "name": "automatic-admin", "domainId": domain_id, "roles": {"@type": "User"}, "permissions": {"@type": "Merge", "enabledPermissions": permissions}, "credentials": {"0": {"@type": "Password", "secret": "Isolated-automation-admin-password"}}}}})
            assert "admin" in account["created"]
            data = json.dumps({"using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"], "methodCalls": [["x:ApiKey/set", {"create": {"key": {"description": "isolated automatic setup admin", "permissions": {"@type": "Inherit"}}}}, "k"]]}).encode()
            req = urllib.request.Request("http://127.0.0.1:19080/jmap/", data=data, headers={"Content-Type": "application/json", "Authorization": "Basic " + base64.b64encode(b"automatic-admin@mail.example.com:Isolated-automation-admin-password").decode()})
            with urllib.request.urlopen(req) as response:
                value = json.load(response)["methodResponses"][0][1]["created"]["key"]
                admin_key = value["secret"]
            credentials = {"base": credentials["base"], "apiKey": admin_key}
        path = "/installation/initialize/"
        assert request(path + "authorize", "POST", credentials)[0] == 401
        assert request(path + "authorize", "POST", credentials, capability, "https://attacker.example")[0] == 403
        code, authorized = request(path + "authorize", "POST", credentials, capability)
        assert code == 200, (code, authorized)
        assert not authorized["missingPermissions"], authorized["missingPermissions"]
        ticket = authorized["ticket"]
        domain = "auto-new.example.com" if mode == "new" else "mail.example.com"
        spec = {"brand": "Automatic Test Mail", "domain": domain, "publicOrigin": "http://" + NAME + ":8080", "createDomain": mode == "new", "operatorMode": "new" if mode == "new" else "existing", "operatorEmail": "owner@" + domain if mode == "new" else "operator-v2@mail.example.com", "recoveryEmail": "recovery@example.net", "cloudflareAccount": ""}
        password = "Isolated-operator-" + mode + "-password" if mode == "new" else (SOURCE / "secrets/operator.initial-password").read_text().strip()
        body = {"ticket": ticket, "spec": spec, "operatorPassword": password}
        assert request(path + "preflight", "POST", body, capability)[0] == 200
        assert not (ROOT / "config/runtime.enc").exists()
        assert request(path + "cancel", "POST", {}, capability)[0] == 200
        assert request(path + "preflight", "POST", body, capability)[0] == 401
        code, authorized = request(path + "authorize", "POST", credentials, capability)
        assert code == 200
        body["ticket"] = authorized["ticket"]
        code, started = request(path + "job", "POST", body, capability)
        assert code == 200, started
        assert request(path + "job", "POST", body, capability)[0] == 409
        for _ in range(100):
            try:
                code, current = request(path + "job", capability=capability)
                job = current["job"]
                assert admin_password not in json.dumps(job)
                assert password not in json.dumps(job)
                if job["status"] == "failed":
                    raise AssertionError(job)
                if job["status"] == "applying":
                    break
            except OSError:
                break
            time.sleep(0.15)
        else:
            raise AssertionError("Initialization did not finish remote creation")
        for secret in [admin_password, admin_key, password]:
            if secret:
                assert secret.encode() not in (ROOT / "config/initialization.enc").read_bytes()
        restart_after_save()
        # Requests now require the configured browser Origin, not the test client URL.
        for _ in range(60):
            code, result = request(path + "job", capability=capability, origin=spec["publicOrigin"])
            job = result["job"]
            if job["status"] == "completed":
                break
            assert job["status"] != "failed", job
            time.sleep(0.3)
        else:
            raise AssertionError("Callback activation did not complete")
        assert request("/installation")[1]["needsOperator"] is False
        view = request("/installation/config", capability=capability)[1]
        assert view["provisioningKeySet"] and view["notificationKeySet"] and view["hookSecretSet"]
        assert not view["policyVerified"]
        # Same operation cannot create a second set of resources after completion.
        code, reauthorized = request(path + "authorize", "POST", credentials, capability, spec["publicOrigin"])
        assert code == 200
        body["ticket"] = reauthorized["ticket"]
        code, repeated = request(path + "job", "POST", body, capability, spec["publicOrigin"])
        assert code == 200 and repeated["job"]["resources"] == job["resources"]
        print("PASS: automatic setup", mode, "authorization, cancellation, creation, encrypted capture, restart, callback activation and idempotence")
    finally:
        # Disable only the Hook created by this disposable installation, so the
        # following platform suite is not coupled to a stopped callback server.
        if job and job.get("resources", {}).get("hook"):
            import base64
            hook_id = job["resources"]["hook"]
            payload = {"using": ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"], "methodCalls": [["x:MtaHook/set", {"update": {hook_id: {"enable": {"else": "false"}}}}, "h"], ["x:Action/set", {"create": {"reload": {"@type": "ReloadSettings"}}}, "r"]]}
            admin_password = (PROJECT / "tests/runtime/bootstrap.secret").read_text().strip()
            cleanup = urllib.request.Request("http://127.0.0.1:19080/jmap/", data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "Authorization": "Basic " + base64.b64encode(("bootstrap:" + admin_password).encode()).decode()})
            with urllib.request.urlopen(cleanup) as response:
                response.read()
        subprocess.run(["docker", "stop", NAME], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


exercise("existing")
exercise("new")

