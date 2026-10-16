"""PROJECT-003 role matrix over real HTTP and disposable PostgreSQL."""

import http.client
import json
import os
import pathlib
import secrets
import socket
import subprocess
import time


ROOT = pathlib.Path(__file__).resolve().parents[1]
PG = pathlib.Path(r"C:/Program Files/PostgreSQL/18/bin")
ARTIFACT = ROOT.parents[1] / "qa-artifacts" / ("project003-" + secrets.token_hex(8))
ARTIFACT.mkdir(parents=True)
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
api = None
pg_started = False
passed = []


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


PG_PORT, API_PORT = free_port(), free_port()


def pg(name, *args, check=True):
    with (ARTIFACT / f"{name}.log").open("ab") as log:
        result = subprocess.run([str(PG / name), *map(str, args)], stdin=subprocess.DEVNULL,
                                stdout=log, stderr=log, creationflags=FLAGS, timeout=60)
    if check and result.returncode:
        raise RuntimeError(f"{name} failed; see {ARTIFACT / (name + '.log')}")


def scalar(query):
    result = subprocess.run(
        [str(PG / "psql"), "-h", "127.0.0.1", "-p", str(PG_PORT), "-U", "qa_owner",
         "-d", "qa_project003", "-At", "-v", "ON_ERROR_STOP=1", "-c", query],
        capture_output=True, text=True, creationflags=FLAGS, timeout=20)
    if result.returncode:
        raise RuntimeError(result.stderr[-1000:])
    return result.stdout.strip()


def counts():
    return tuple(int(scalar(f'SELECT count(*) FROM "{table}";')) for table in
                 ("projects", "project_cabinets", "project_items"))


def request(path, method="GET", body=None, token=None, raw_body=None):
    connection = http.client.HTTPConnection("127.0.0.1", API_PORT, timeout=10)
    headers = {"Content-Type": "application/json"} if body is not None or raw_body is not None else {}
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        payload = raw_body if raw_body is not None else (json.dumps(body) if body is not None else None)
        connection.request(method, path, payload, headers)
        response = connection.getresponse()
        raw = response.read()
        parsed = json.loads(raw) if raw else None
        return response.status, parsed, raw
    finally:
        connection.close()


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    passed.append(name)
    print("PASS " + name, flush=True)


def project(role, status, suffix):
    return {
        "id": f"qa-{role}-{status}-{suffix}", "number": f"QA-{role}-{status}-{suffix}",
        "title": "PROJECT-003", "client": "QA", "contact": "qa@example.test",
        "direction": "nku", "status": status, "createdAt": 1760000000000,
        "updatedAt": 1760000000000, "markup": 15, "workMarkup": 25,
        "discount": 0, "vatRate": 20, "showWorkLines": True, "tzzPct": 1,
        "thirdParty": 0, "extraCosts": 0, "unforeseenPct": 2, "tripCosts": 0,
        "transportPct": 0, "smrCost": 0, "smrSell": 0, "pnrCost": 0,
        "pnrSell": 0, "validDays": 30, "notes": "", "versions": [],
        "cabinets": [{
            "id": f"cab-{role}-{status}-{suffix}", "kind": "ШУ", "name": "QA cabinet",
            "hours": 1, "designHours": 2, "softwareHours": 3,
            "items": [{"id": f"item-{role}-{status}-{suffix}", "eqId": None,
                       "sku": "QA", "name": "QA item", "brand": "QA", "unit": "шт",
                       "qty": 1, "purchase": 100}],
        }],
    }


def stop_api():
    global api
    if api is not None and api.poll() is None:
        api.terminate()
        try:
            api.wait(timeout=10)
        except subprocess.TimeoutExpired:
            api.kill()
            api.wait(timeout=5)


admin_email = "qa-admin@example.test"
admin_password = secrets.token_urlsafe(24) + "aA1!"
jwt_key = secrets.token_urlsafe(48)

try:
    pg("initdb", "-D", ARTIFACT / "data", "-U", "qa_owner", "--auth=trust", "--encoding=UTF8", "--no-locale")
    pg("pg_ctl", "-D", ARTIFACT / "data", "-l", ARTIFACT / "postgres.log",
       "-o", f"-h 127.0.0.1 -p {PG_PORT}", "-w", "start")
    pg_started = True
    pg("createdb", "-h", "127.0.0.1", "-p", PG_PORT, "-U", "qa_owner", "qa_project003")

    env = {k: v for k, v in os.environ.items() if not k.lower().startswith(
        ("jwt", "admin", "connectionstrings", "cors", "swagger", "allowedhosts", "urls",
         "dotnet_environment", "aspnetcore_environment", "aspnetcore_urls"))}
    env.update({
        "DOTNET_ENVIRONMENT": "Production", "ASPNETCORE_ENVIRONMENT": "Production",
        "ConnectionStrings__Tkp": f"Host=127.0.0.1;Port={PG_PORT};Database=qa_project003;Username=qa_owner",
        "Jwt__Key": jwt_key, "Jwt__Issuer": "qa-issuer", "Jwt__Audience": "qa-audience",
        "AllowedHosts": "127.0.0.1;localhost", "Cors__AllowedOrigins__0": "http://localhost:5187",
        "Admin__Enabled": "true", "Admin__Email": admin_email, "Admin__Password": admin_password,
        "URLS": f"http://127.0.0.1:{API_PORT}", "StaticFilesPath": str(ARTIFACT / "no-static"),
    })
    with (ARTIFACT / "api.log").open("wb") as log:
        api = subprocess.Popen(["dotnet", str(ROOT / "backend/TkpApi/bin/Release/net8.0/TkpApi.dll")],
                               cwd=ROOT / "backend/TkpApi", env=env, stdout=log, stderr=log,
                               creationflags=FLAGS)
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if api.poll() is not None:
            raise RuntimeError("API exited; see " + str(ARTIFACT / "api.log"))
        try:
            if request("/api/health")[0] == 200:
                break
        except OSError:
            pass
        time.sleep(.2)
    else:
        raise TimeoutError("API startup timeout")

    status, login, _ = request("/api/auth/login", "POST", {"email": admin_email, "password": admin_password})
    check("admin login", status == 200)
    tokens = {"admin": login["token"]}
    for role in ("manager", "engineer"):
        password = secrets.token_urlsafe(20) + "1"
        email = f"qa-{role}@example.test"
        payload = {"email": email, "password": password, "fullName": "QA", "position": "QA", "role": role}
        check(f"create {role}", request("/api/auth/register", "POST", payload, tokens["admin"])[0] == 200)
        status, result, _ = request("/api/auth/login", "POST", {"email": email, "password": password})
        check(f"login {role}", status == 200)
        tokens[role] = result["token"]

    baseline = counts()
    check("anonymous create is 401", request("/api/projects", "POST", project("anon", "draft", "1"))[0] == 401)
    check("anonymous creates no graph", counts() == baseline)

    malformed_before = counts()
    check("malformed JSON is 400", request("/api/projects", "POST", token=tokens["engineer"], raw_body="{bad")[0] == 400)
    check("malformed JSON creates no graph", counts() == malformed_before)

    for status_name in ("draft", "calc", "sent"):
        before = counts()
        status, body, _ = request("/api/projects", "POST", project("engineer", status_name, "ok"), tokens["engineer"])
        check(f"engineer {status_name} is 201", status == 201 and body["status"] == status_name)
        after = counts()
        check(f"engineer {status_name} persists project and children",
              after == (before[0] + 1, before[1] + 1, before[2] + 1))

    for status_name in ("won", "lost"):
        before = counts()
        status, body, _ = request("/api/projects", "POST", project("engineer", status_name, "denied"), tokens["engineer"])
        check(f"engineer {status_name} is 403", status == 403 and body.get("title") == "Forbidden")
        check(f"engineer {status_name} creates no graph", counts() == before)

    for role in ("manager", "admin"):
        for status_name in ("draft", "calc", "sent", "won", "lost"):
            before = counts()
            status, body, _ = request("/api/projects", "POST", project(role, status_name, "ok"), tokens[role])
            check(f"{role} {status_name} is 201", status == 201 and body["status"] == status_name)
            after = counts()
            check(f"{role} {status_name} persists full graph",
                  after == (before[0] + 1, before[1] + 1, before[2] + 1))

    # Database regression: duplicate PK still fails and cannot add another child graph.
    duplicate = project("admin", "draft", "ok")
    before = counts()
    status, _, _ = request("/api/projects", "POST", duplicate, tokens["admin"])
    check("duplicate project remains a server error", status == 500)
    check("duplicate project leaves graph unchanged", counts() == before)

    print(json.dumps({"passed": len(passed), "artifact_directory": str(ARTIFACT)}), flush=True)
finally:
    stop_api()
    if pg_started or (ARTIFACT / "data/postmaster.pid").exists():
        pg("pg_ctl", "-D", ARTIFACT / "data", "-m", "fast", "-w", "stop", check=False)
