"""Independent SEC-001/auth-v2 HTTP smoke with a disposable PostgreSQL cluster."""
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
ARTIFACT = ROOT / ".worktrees" / ("tkp-qa-sec001-" + secrets.token_hex(8))
ARTIFACT.mkdir(parents=True)
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
PG_PORT = API_PORT = 0
api = None
pg_started = False
passed = []


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


PG_PORT, API_PORT = free_port(), free_port()


def pg(name, *args):
    log_path = ARTIFACT / f"{name}-command.log"
    with log_path.open("ab") as log:
        result = subprocess.run(
            [str(PG / name), *map(str, args)], stdin=subprocess.DEVNULL,
            stdout=log, stderr=log, creationflags=FLAGS, timeout=60,
        )
    if result.returncode:
        raise RuntimeError(f"{name} failed; inspect {log_path}")


def sql_scalar(sql):
    result = subprocess.run(
        [str(PG / "psql"), "-h", "127.0.0.1", "-p", str(PG_PORT),
         "-U", "qa_owner", "-d", "qa_auth", "-At", "-v", "ON_ERROR_STOP=1",
         "-c", sql], capture_output=True, text=True, creationflags=FLAGS, timeout=20,
    )
    if result.returncode:
        raise RuntimeError("psql failed: " + result.stderr[-1000:])
    return result.stdout.strip()


def counts():
    return tuple(int(sql_scalar(f'SELECT COUNT(*) FROM "{table}";')) for table in
                 ("AspNetUsers", "AspNetRoles", "AspNetUserRoles"))


def request(path, method="GET", body=None, token=None):
    connection = http.client.HTTPConnection("127.0.0.1", API_PORT, timeout=8)
    headers = {}
    if body is not None:
        headers["Content-Type"] = "application/json"
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        connection.request(method, path, json.dumps(body) if body is not None else None, headers)
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


def stop_api():
    global api
    if api is not None:
        if api.poll() is None:
            api.terminate()
            try:
                api.wait(timeout=10)
            except subprocess.TimeoutExpired:
                api.kill()
                api.wait(timeout=5)
        api = None


def register_payload(email, role, password):
    return {
        "email": email, "password": password, "fullName": "QA Synthetic",
        "position": "QA", "role": role, "phone": "+70000000000",
    }


admin_email = "qa-admin@example.test"
admin_password = secrets.token_urlsafe(24) + "aA1!"
jwt_key = secrets.token_urlsafe(48)

try:
    pg("initdb", "-D", ARTIFACT / "data", "-U", "qa_owner", "--auth=trust",
       "--encoding=UTF8", "--no-locale")
    pg("pg_ctl", "-D", ARTIFACT / "data", "-l", ARTIFACT / "postgres.log",
       "-o", f"-h 127.0.0.1 -p {PG_PORT}", "-w", "start")
    pg_started = True
    pg("createdb", "-h", "127.0.0.1", "-p", PG_PORT, "-U", "qa_owner", "qa_auth")

    env = {k: v for k, v in os.environ.items() if not k.lower().startswith(
        ("jwt", "admin", "connectionstrings", "cors", "swagger", "allowedhosts",
         "urls", "dotnet_environment", "aspnetcore_environment", "aspnetcore_urls"))}
    env.update({
        "DOTNET_ENVIRONMENT": "Production", "ASPNETCORE_ENVIRONMENT": "Production",
        "ConnectionStrings__Tkp": f"Host=127.0.0.1;Port={PG_PORT};Database=qa_auth;Username=qa_owner",
        "Jwt__Key": jwt_key, "Jwt__Issuer": "qa-issuer", "Jwt__Audience": "qa-audience",
        "AllowedHosts": "127.0.0.1;localhost", "Cors__AllowedOrigins__0": "http://localhost:5187",
        "Admin__Enabled": "true", "Admin__Email": admin_email,
        "Admin__Password": admin_password, "URLS": f"http://127.0.0.1:{API_PORT}",
        "StaticFilesPath": str(ARTIFACT / "no-static-files"),
    })
    with (ARTIFACT / "api.log").open("wb") as log:
        api = subprocess.Popen(
            ["dotnet", str(ROOT / "backend/TkpApi/bin/Release/net8.0/TkpApi.dll")],
            cwd=ROOT / "backend/TkpApi", env=env, stdout=log, stderr=log,
            creationflags=FLAGS,
        )
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if api.poll() is not None:
            raise RuntimeError("API exited; inspect " + str(ARTIFACT / "api.log"))
        try:
            if request("/api/health")[0] == 200:
                break
        except OSError:
            pass
        time.sleep(.2)
    else:
        raise TimeoutError("API health timeout")

    baseline = counts()
    payload = register_payload("anon@example.test", "engineer", secrets.token_urlsafe(18) + "1")
    status, body, raw = request("/api/auth/register", "POST", payload)
    check("anonymous register is empty 401", status == 401 and body is None and raw == b"")
    check("anonymous register has no DB writes", counts() == baseline)
    status, body, raw = request("/api/auth/register", "POST", payload, "invalid.jwt.token")
    check("invalid JWT register is empty 401", status == 401 and body is None and raw == b"")
    check("invalid JWT has no DB writes", counts() == baseline)

    status, admin_login, _ = request("/api/auth/login", "POST", {"email": admin_email, "password": admin_password})
    check("login remains anonymous and expiresAt is unix-ms", status == 200 and isinstance(admin_login["expiresAt"], int))
    admin_token = admin_login["token"]
    check("bootstrap admin token has admin role", "admin" in admin_login["user"]["roles"])

    credentials = {}
    for role in ("manager", "engineer", "admin"):
        email = f"qa-created-{role}@example.test"
        password = secrets.token_urlsafe(18) + "1"
        status, result, _ = request("/api/auth/register", "POST", register_payload(email, role, password), admin_token)
        check(f"admin creates {role}", status == 200 and result["role"] == role and result["email"] == email)
        login_status, login, _ = request("/api/auth/login", "POST", {"email": email, "password": password})
        check(f"created {role} can log in", login_status == 200 and role in login["user"]["roles"])
        credentials[role] = (email, password, login["token"])

    for role in ("manager", "engineer"):
        before = counts()
        status, body, raw = request(
            "/api/auth/register", "POST",
            register_payload(f"forbidden-{role}@example.test", "engineer", secrets.token_urlsafe(18) + "1"),
            credentials[role][2],
        )
        check(f"{role} register is empty 403", status == 403 and body is None and raw == b"")
        check(f"{role} register has no DB writes", counts() == before)

    before = counts()
    status, result, _ = request(
        "/api/auth/register", "POST",
        register_payload("short@example.test", "engineer", "a1"), admin_token,
    )
    check("admin short password returns errors 400", status == 400 and isinstance(result.get("errors"), list))
    check("invalid password has no DB writes", counts() == before)

    before = counts()
    status, result, _ = request(
        "/api/auth/register", "POST",
        register_payload(credentials["engineer"][0], "engineer", secrets.token_urlsafe(18) + "1"), admin_token,
    )
    check("duplicate email returns errors 400", status == 400 and isinstance(result.get("errors"), list))
    check("duplicate email has no DB writes", counts() == before)

    status, current_admin, _ = request("/api/auth/me", token=admin_token)
    check("original admin JWT remains valid", status == 200 and current_admin["email"] == admin_email)
    print(json.dumps({"passed": len(passed), "artifact_directory": str(ARTIFACT)}), flush=True)
finally:
    stop_api()
    if pg_started or (ARTIFACT / "data/postmaster.pid").exists():
        pg("pg_ctl", "-D", ARTIFACT / "data", "-m", "fast", "-w", "stop")
