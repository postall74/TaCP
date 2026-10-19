"""Independent ADMIN-006/user-admin-v3 HTTP smoke on disposable PostgreSQL."""

import http.client
import json
import os
import pathlib
import secrets
import socket
import subprocess
import threading
import time


ROOT = pathlib.Path(__file__).resolve().parents[1]
PG = pathlib.Path(r"C:/Program Files/PostgreSQL/18/bin")
ARTIFACT = ROOT.parent / "qa-artifacts" / ("admin006-" + secrets.token_hex(8))
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


def pg(name, *args, check=True):
    log_path = ARTIFACT / f"{name}-command.log"
    with log_path.open("ab") as log:
        result = subprocess.run(
            [str(PG / name), *map(str, args)], stdin=subprocess.DEVNULL,
            stdout=log, stderr=log, creationflags=FLAGS, timeout=60,
        )
    if check and result.returncode:
        raise RuntimeError(f"{name} failed; inspect {log_path}")
    return result


def sql(sql_text):
    result = subprocess.run(
        [str(PG / "psql"), "-h", "127.0.0.1", "-p", str(PG_PORT),
         "-U", "qa_owner", "-d", "qa_admin006", "-At", "-v", "ON_ERROR_STOP=1",
         "-c", sql_text], capture_output=True, text=True,
        creationflags=FLAGS, timeout=20,
    )
    if result.returncode:
        raise RuntimeError("psql failed: " + result.stderr[-1000:])
    return result.stdout.strip()


def request(path, method="GET", body=None, token=None):
    connection = http.client.HTTPConnection("127.0.0.1", API_PORT, timeout=10)
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


def login(email, password):
    return request("/api/auth/login", "POST", {"email": email, "password": password})


def register(token, email, password, role="engineer"):
    return request("/api/auth/register", "POST", {
        "email": email, "password": password, "fullName": "QA User",
        "position": "QA", "phone": "+70000000000", "role": role,
    }, token)


def users(token):
    status, body, _ = request("/api/auth/users", token=token)
    check("admin list users", status == 200 and isinstance(body, list))
    return body


def find_user(token, email):
    return next(user for user in users(token) if user["email"].lower() == email.lower())


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


admin_email = "qa-admin@example.test"
admin_password = secrets.token_urlsafe(24) + "aA1!"
user_password = secrets.token_urlsafe(24) + "aA1!"
jwt_key = secrets.token_urlsafe(48)

try:
    pg("initdb", "-D", ARTIFACT / "data", "-U", "qa_owner", "--auth=trust",
       "--encoding=UTF8", "--no-locale")
    pg("pg_ctl", "-D", ARTIFACT / "data", "-l", ARTIFACT / "postgres.log",
       "-o", f"-h 127.0.0.1 -p {PG_PORT}", "-w", "start")
    pg_started = True
    pg("createdb", "-h", "127.0.0.1", "-p", PG_PORT, "-U", "qa_owner", "qa_admin006")

    env = {k: v for k, v in os.environ.items() if not k.lower().startswith(
        ("jwt", "admin", "connectionstrings", "cors", "swagger", "allowedhosts",
         "urls", "dotnet_environment", "aspnetcore_environment", "aspnetcore_urls"))}
    env.update({
        "DOTNET_ENVIRONMENT": "Production", "ASPNETCORE_ENVIRONMENT": "Production",
        "ConnectionStrings__Tkp": f"Host=127.0.0.1;Port={PG_PORT};Database=qa_admin006;Username=qa_owner",
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

    status, admin_login, _ = login(admin_email, admin_password)
    check("bootstrap admin login", status == 200 and "admin" in admin_login["user"]["roles"])
    admin_token = admin_login["token"]

    original_email = "qa-engineer@example.test"
    status, created, _ = register(admin_token, original_email, user_password)
    check("register regression", status == 200 and created["email"] == original_email)
    engineer = find_user(admin_token, original_email)
    user_id = engineer["id"]
    status, engineer_login, _ = login(original_email, user_password)
    check("original user login", status == 200 and "engineer" in engineer_login["user"]["roles"])
    engineer_token = engineer_login["token"]

    update_path = f"/api/auth/users/{user_id}"
    before = engineer.copy()
    for label, email in (("blank", "   "), ("invalid", "not-an-email")):
        status, body, _ = request(update_path, "PUT", {"fullName": "MUST ROLLBACK", "email": email}, admin_token)
        check(f"{label} email is 400 errors", status == 400 and isinstance(body.get("errors"), list))
        after = find_user(admin_token, original_email)
        check(f"{label} failure is atomic", after["fullName"] == before["fullName"] and after["email"] == original_email)

    duplicate_email = "duplicate@example.test"
    duplicate_password = secrets.token_urlsafe(24) + "aA1!"
    check("create duplicate target", register(admin_token, duplicate_email, duplicate_password)[0] == 200)
    for label, email in (("exact duplicate", duplicate_email), ("case duplicate", duplicate_email.upper())):
        status, body, _ = request(update_path, "PUT", {"phone": "MUST ROLLBACK", "email": email}, admin_token)
        check(f"{label} is 400 errors", status == 400 and isinstance(body.get("errors"), list))
        after = find_user(admin_token, original_email)
        check(f"{label} is atomic", after["phone"] == before["phone"] and after["email"] == original_email)

    for label, payload in (("omitted", {"position": "Omitted email"}),
                           ("null", {"position": "Null email", "email": None})):
        status, body, _ = request(update_path, "PUT", payload, admin_token)
        check(f"{label} email update 200", status == 200 and body["email"] == original_email)
        check(f"{label} preserves login", login(original_email, user_password)[0] == 200)

    case_email = original_email.upper()
    status, body, _ = request(update_path, "PUT", {"email": case_email}, admin_token)
    check("case-only email update", status == 200 and body["email"] == case_email)
    check("case-only login", login(case_email, user_password)[0] == 200)

    new_email = " qa-engineer-new@example.test "
    status, body, _ = request(update_path, "PUT", {
        "email": new_email, "fullName": "Updated Name", "position": "Updated Position",
        "phone": "+79999999999",
    }, admin_token)
    check("email and profile update 200", status == 200 and body["email"] == new_email.strip()
          and body["fullName"] == "Updated Name" and body["roles"] == ["engineer"])
    check("old login rejected", login(case_email, user_password)[0] == 401)
    status, new_login, _ = login(new_email.strip(), user_password)
    check("new login keeps id and role", status == 200 and new_login["user"]["id"] == user_id
          and new_login["user"]["roles"] == ["engineer"])

    # Existing JWT identifies by immutable id and remains valid after email/login change.
    status, me, _ = request("/api/auth/me", token=engineer_token)
    check("existing JWT remains valid", status == 200 and me["email"] == new_email.strip())
    status, me, _ = request("/api/auth/me", "PUT", {"fullName": "Self Profile", "email": "ignored@example.test"}, engineer_token)
    check("me regression cannot change email", status == 200 and me["fullName"] == "Self Profile"
          and me["email"] == new_email.strip())

    check("anonymous update 401", request(update_path, "PUT", {"fullName": "x"})[0] == 401)
    check("engineer update 403", request(update_path, "PUT", {"fullName": "x"}, engineer_token)[0] == 403)
    manager_email = "qa-manager@example.test"
    manager_password = secrets.token_urlsafe(24) + "aA1!"
    check("create manager", register(admin_token, manager_email, manager_password, "manager")[0] == 200)
    manager_token = login(manager_email, manager_password)[1]["token"]
    check("manager update 403", request(update_path, "PUT", {"fullName": "x"}, manager_token)[0] == 403)
    check("unknown user 404", request("/api/auth/users/missing-user", "PUT", {"fullName": "x"}, admin_token)[0] == 404)

    # Deterministic stale ConcurrencyStamp: hold an uncommitted external update.
    concurrency_email = new_email.strip()
    sql_text = ("BEGIN; UPDATE \"AspNetUsers\" SET \"ConcurrencyStamp\" = gen_random_uuid()::text "
                f"WHERE \"Id\" = '{user_id}'; SELECT pg_sleep(2); COMMIT;")
    locker = subprocess.Popen(
        [str(PG / "psql"), "-h", "127.0.0.1", "-p", str(PG_PORT), "-U", "qa_owner",
         "-d", "qa_admin006", "-v", "ON_ERROR_STOP=1", "-c", sql_text],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=FLAGS,
    )
    time.sleep(.4)
    status, body, _ = request(update_path, "PUT", {"fullName": "MUST ROLLBACK", "email": "race@example.test"}, admin_token)
    locker.wait(timeout=10)
    check("concurrency conflict is 409 errors", status == 409 and isinstance(body.get("errors"), list))
    after = find_user(admin_token, concurrency_email)
    check("concurrency conflict is atomic", after["fullName"] == "Self Profile" and after["email"] == concurrency_email)

    status, role_result, _ = request(update_path + "/role", "PUT", {"role": "manager"}, admin_token)
    check("role endpoint regression", status == 200 and role_result["roles"] == ["manager"])
    status, role_login, _ = login(concurrency_email, user_password)
    check("role visible after login", status == 200 and role_login["user"]["roles"] == ["manager"])

    disposable_email = "qa-delete@example.test"
    disposable_password = secrets.token_urlsafe(24) + "aA1!"
    check("register delete target", register(admin_token, disposable_email, disposable_password)[0] == 200)
    disposable_id = find_user(admin_token, disposable_email)["id"]
    check("delete endpoint regression", request(f"/api/auth/users/{disposable_id}", "DELETE", token=admin_token)[0] == 204)
    check("deleted user cannot login", login(disposable_email, disposable_password)[0] == 401)

    print(json.dumps({"passed": len(passed), "artifact_directory": str(ARTIFACT)}), flush=True)
finally:
    stop_api()
    if pg_started or (ARTIFACT / "data/postmaster.pid").exists():
        pg("pg_ctl", "-D", ARTIFACT / "data", "-m", "fast", "-w", "stop", check=False)
