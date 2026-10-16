"""AUTH-TYPES-001 response-shape verification over disposable PostgreSQL and HTTP."""

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
ARTIFACT = ROOT.parents[1] / "qa-artifacts" / ("auth-types-001-" + secrets.token_hex(8))
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


def request(path, method="GET", body=None, token=None):
    connection = http.client.HTTPConnection("127.0.0.1", API_PORT, timeout=10)
    headers = {"Content-Type": "application/json"} if body is not None else {}
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        connection.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = connection.getresponse()
        raw = response.read()
        return response.status, json.loads(raw) if raw else None
    finally:
        connection.close()


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    passed.append(name)
    print("PASS " + name, flush=True)


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
    pg("createdb", "-h", "127.0.0.1", "-p", PG_PORT, "-U", "qa_owner", "qa_auth_types")

    env = {k: v for k, v in os.environ.items() if not k.lower().startswith(
        ("jwt", "admin", "connectionstrings", "cors", "swagger", "allowedhosts", "urls",
         "dotnet_environment", "aspnetcore_environment", "aspnetcore_urls"))}
    env.update({
        "DOTNET_ENVIRONMENT": "Production", "ASPNETCORE_ENVIRONMENT": "Production",
        "ConnectionStrings__Tkp": f"Host=127.0.0.1;Port={PG_PORT};Database=qa_auth_types;Username=qa_owner",
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

    status, login = request("/api/auth/login", "POST", {"email": admin_email, "password": admin_password})
    check("login status", status == 200)
    check("login exact top-level shape", set(login) == {"token", "expiresAt", "user"})
    check("expiresAt is unix-ms integer", isinstance(login["expiresAt"], int) and login["expiresAt"] > 1_000_000_000_000)
    check("login user is full AuthUser", set(login["user"]) == {"id", "email", "fullName", "position", "phone", "roles"})
    token = login["token"]

    status, me = request("/api/auth/me", token=token)
    check("login to me status", status == 200)
    check("login user equals me", me == login["user"])

    email = "engineer@example.test"
    password = secrets.token_urlsafe(20) + "1"
    register_request = {
        "email": email, "password": password, "fullName": "Тестовый инженер",
        "position": "Инженер", "role": "engineer", "phone": "+70000000000",
    }
    status, registered = request("/api/auth/register", "POST", register_request, token)
    check("admin register status", status == 200)
    check("register exact short shape", set(registered) == {"id", "email", "fullName", "role"})
    check("register values", registered["email"] == email and registered["fullName"] == "Тестовый инженер"
          and registered["role"] == "engineer")

    status, user_list = request("/api/auth/users", token=token)
    listed = next(user for user in user_list if user["id"] == registered["id"])
    check("register to users status", status == 200)
    check("users expands registered DTO to AuthUser", set(listed) == {"id", "email", "fullName", "position", "phone", "roles"})
    check("registered user matches users", listed["email"] == registered["email"]
          and listed["fullName"] == registered["fullName"] and listed["roles"] == [registered["role"]]
          and listed["position"] == register_request["position"] and listed["phone"] == register_request["phone"])

    print(json.dumps({"passed": len(passed), "artifact_directory": str(ARTIFACT)}), flush=True)
finally:
    stop_api()
    if pg_started or (ARTIFACT / "data/postmaster.pid").exists():
        pg("pg_ctl", "-D", ARTIFACT / "data", "-m", "fast", "-w", "stop", check=False)
