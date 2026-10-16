"""DOOR-001/002/003 migration and HTTP gate on disposable PostgreSQL 18."""

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
ARTIFACT = ROOT.parents[1] / "qa-artifacts" / ("door-001-003-" + secrets.token_hex(8))
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


def run(command, name, env=None, timeout=120):
    with (ARTIFACT / f"{name}.log").open("ab") as log:
        result = subprocess.run(command, cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
                                stdout=log, stderr=log, creationflags=FLAGS, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"{name} failed; see {ARTIFACT / (name + '.log')}")


def pg(name, *args, check=True):
    try:
        run([str(PG / name), *map(str, args)], name, timeout=60)
    except RuntimeError:
        if check:
            raise


def sql(query):
    result = subprocess.run(
        [str(PG / "psql"), "-h", "127.0.0.1", "-p", str(PG_PORT), "-U", "qa_owner",
         "-d", "qa_door", "-At", "-v", "ON_ERROR_STOP=1", "-c", query],
        capture_output=True, text=True, creationflags=FLAGS, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr[-1200:])
    return result.stdout.strip()


def request(path, method="GET", body=None, token=None):
    connection = http.client.HTTPConnection("127.0.0.1", API_PORT, timeout=10)
    headers = {"Content-Type": "application/json"} if body is not None else {}
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
        connection.request(method, path, payload, headers)
        response = connection.getresponse()
        raw = response.read()
        return response.status, json.loads(raw) if raw else None, raw
    finally:
        connection.close()


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    passed.append(name)
    print("PASS " + name, flush=True)


def layout(label="Сеть 1"):
    return {"schema": "cabinet-door-layout-v1", "doorCount": 2, "labelSide": "below", "elements": [
        {"id": "lamp-0", "kind": "lamp", "tone": "green", "label": label, "door": 0, "x": 250, "y": 180},
        {"id": "stop-0", "kind": "emergency-stop", "label": "", "door": 1, "x": 500, "y": 700},
    ]}


def normalize_stored_layout(value):
    value = json.loads(json.dumps(value))
    for element in value.get("elements", []):
        if element.get("tone", object()) is None:
            element.pop("tone")
    return value


def project(project_id, number, cabinet_id, door_layout=None):
    cabinet = {"id": cabinet_id, "kind": "АВР", "name": "QA cabinet", "hours": 0,
               "designHours": 0, "softwareHours": 0, "items": [], "segments": []}
    if door_layout is not None:
        cabinet["doorLayout"] = door_layout
    return {
        "id": project_id, "number": number, "title": "Door QA", "client": "QA", "contact": "",
        "direction": "nku", "status": "draft", "createdAt": 1760000000000, "updatedAt": 1760000000000,
        "markup": 15, "workMarkup": 25, "discount": 0, "vatRate": 20, "showWorkLines": True,
        "tzzPct": 1, "thirdParty": 0, "extraCosts": 0, "unforeseenPct": 2, "tripCosts": 0,
        "transportPct": 0, "smrCost": 0, "smrSell": 0, "pnrCost": 0, "pnrSell": 0,
        "validDays": 30, "notes": "", "cabinets": [cabinet], "versions": [],
    }


def login(email, password):
    return request("/api/auth/login", "POST", {"email": email, "password": password})


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
    pg("createdb", "-h", "127.0.0.1", "-p", PG_PORT, "-U", "qa_owner", "qa_door")

    env = {k: v for k, v in os.environ.items() if not k.lower().startswith(
        ("jwt", "admin", "connectionstrings", "cors", "swagger", "allowedhosts", "urls",
         "dotnet_environment", "aspnetcore_environment", "aspnetcore_urls"))}
    env.update({
        "DOTNET_ENVIRONMENT": "Production", "ASPNETCORE_ENVIRONMENT": "Production",
        "ConnectionStrings__Tkp": f"Host=127.0.0.1;Port={PG_PORT};Database=qa_door;Username=qa_owner",
        "Jwt__Key": jwt_key, "Jwt__Issuer": "qa-issuer", "Jwt__Audience": "qa-audience",
        "AllowedHosts": "127.0.0.1;localhost", "Cors__AllowedOrigins__0": "http://localhost:5187",
        "Admin__Enabled": "true", "Admin__Email": admin_email, "Admin__Password": admin_password,
        "URLS": f"http://127.0.0.1:{API_PORT}", "StaticFilesPath": str(ARTIFACT / "no-static"),
    })

    ef = ["dotnet", "ef", "database", "update", "--project", "backend/TkpApi/TkpApi.csproj",
          "--configuration", "Release", "--no-build"]
    run(ef[:4] + ["AddCabinetSegmentsPersistence"] + ef[4:], "migration-baseline", env)
    check("baseline has no door_layout", sql("SELECT count(*) FROM information_schema.columns WHERE table_name='project_cabinets' AND column_name='door_layout';") == "0")
    run(ef, "migration-up-1", env)
    check("up adds nullable jsonb door_layout", sql("SELECT data_type||':'||is_nullable FROM information_schema.columns WHERE table_name='project_cabinets' AND column_name='door_layout';") == "jsonb:YES")
    run(ef[:4] + ["AddCabinetSegmentsPersistence"] + ef[4:], "migration-down", env)
    check("down removes door_layout", sql("SELECT count(*) FROM information_schema.columns WHERE table_name='project_cabinets' AND column_name='door_layout';") == "0")
    run(ef, "migration-up-2", env)
    check("second up restores door_layout", sql("SELECT udt_name||':'||is_nullable FROM information_schema.columns WHERE table_name='project_cabinets' AND column_name='door_layout';") == "jsonb:YES")

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

    status, admin_login, _ = login(admin_email, admin_password)
    check("admin login", status == 200)
    admin_token = admin_login["token"]
    user_email = "norole@example.test"
    user_password = secrets.token_urlsafe(20) + "1"
    register = {"email": user_email, "password": user_password, "fullName": "No Role", "position": "", "role": "engineer"}
    check("create authorization fixture", request("/api/auth/register", "POST", register, admin_token)[0] == 200)
    user_id = sql(f'''SELECT "Id" FROM "AspNetUsers" WHERE "NormalizedEmail"='{user_email.upper()}';''')
    sql(f'''DELETE FROM "AspNetUserRoles" WHERE "UserId"='{user_id}';''')
    status, no_role_login, _ = login(user_email, user_password)
    check("no-role login", status == 200 and no_role_login["user"]["roles"] == [])
    no_role_token = no_role_login["token"]

    main_project = project("door-project", "DOOR-1", "door-cabinet")
    check("create legacy-shaped project", request("/api/projects", "POST", main_project, admin_token)[0] == 201)
    path = "/api/projects/door-project/cabinets/door-cabinet/door-layout"
    before = sql("SELECT coalesce(door_layout::text,'null') FROM project_cabinets WHERE \"Id\"='door-cabinet';")
    check("anonymous layout PUT is 401", request(path, "PUT", layout())[0] == 401)
    check("anonymous writes nothing", sql("SELECT coalesce(door_layout::text,'null') FROM project_cabinets WHERE \"Id\"='door-cabinet';") == before)
    check("authenticated no-role PUT is 403", request(path, "PUT", layout(), no_role_token)[0] == 403)
    check("forbidden writes nothing", sql("SELECT coalesce(door_layout::text,'null') FROM project_cabinets WHERE \"Id\"='door-cabinet';") == before)
    check("unknown project is 404", request("/api/projects/missing/cabinets/door-cabinet/door-layout", "PUT", layout(), admin_token)[0] == 404)
    check("unknown cabinet is 404", request("/api/projects/door-project/cabinets/missing/door-layout", "PUT", layout(), admin_token)[0] == 404)

    expected = layout()
    status, saved, _ = request(path, "PUT", expected, admin_token)
    check("layout PUT is 200 exact DTO", status == 200 and saved == expected)
    stored = json.loads(sql("SELECT door_layout::text FROM project_cabinets WHERE \"Id\"='door-cabinet';"))
    check("jsonb stores contract object", isinstance(stored, dict)
          and stored["schema"] == expected["schema"] and len(stored["elements"]) == 2)
    status, fetched, _ = request("/api/projects/door-project", token=admin_token)
    check("project GET roundtrip", status == 200 and fetched["cabinets"][0]["doorLayout"] == expected)

    stable_json = sql("SELECT door_layout::text FROM project_cabinets WHERE \"Id\"='door-cabinet';")
    invalid = layout(); invalid["doorCount"] = 3
    status, error, _ = request(path, "PUT", invalid, admin_token)
    check("invalid layout is 400", status == 400 and error["cabinetId"] == "door-cabinet")
    check("400 is atomic", sql("SELECT door_layout::text FROM project_cabinets WHERE \"Id\"='door-cabinet';") == stable_json)

    status, versions, _ = request("/api/projects/door-project/versions?label=door-snapshot", "POST", token=admin_token)
    check("save version with layout", status == 200 and versions[0]["snapshot"]["cabinets"][0]["doorLayout"] == expected)
    snapshot_cabinets = versions[0]["snapshot"]["cabinets"]
    check("clear layout", request(path, "DELETE", token=admin_token)[0] == 204)
    status, cleared, _ = request("/api/projects/door-project", token=admin_token)
    check("clear persisted", status == 200 and cleared["cabinets"][0].get("doorLayout") is None)
    cleared["cabinets"] = snapshot_cabinets
    status, restored, _ = request("/api/projects/door-project", "PUT", cleared, admin_token)
    check("restore snapshot through full project PUT", status == 200 and restored["cabinets"][0]["doorLayout"] == expected)
    restored_stored = json.loads(sql("SELECT door_layout::text FROM project_cabinets WHERE \"Id\"='door-cabinet';"))
    check("restored jsonb persisted", restored_stored["schema"] == expected["schema"]
          and len(restored_stored["elements"]) == 2)

    old_project = project("old-project", "DOOR-OLD", "old-cabinet")
    check("old project without layout is accepted", request("/api/projects", "POST", old_project, admin_token)[0] == 201)
    status, old_versions, _ = request("/api/projects/old-project/versions?label=legacy", "POST", token=admin_token)
    old_version_id = old_versions[0]["id"]
    legacy_snapshot = {"cabinets": [{"Id": "old-cabinet", "Kind": "AVR", "Name": "Legacy", "Hours": 0,
                                     "DesignHours": 0, "SoftwareHours": 0, "Items": [], "Segments": []}],
                       "calc": {"eqBase": 0, "total": 0}, "legacyExtension": True}
    legacy_sql = json.dumps(legacy_snapshot, ensure_ascii=False).replace("'", "''")
    sql(f'''UPDATE project_versions SET "Snapshot"='{legacy_sql}'::jsonb WHERE "Id"='{old_version_id}';''')
    status, old_fetched, _ = request("/api/projects/old-project", token=admin_token)
    legacy = old_fetched["versions"][0]["snapshot"]
    check("old project reads null layout", status == 200 and old_fetched["cabinets"][0].get("doorLayout") is None)
    check("legacy version casing normalized", "cabinets" in legacy and legacy["cabinets"][0]["id"] == "old-cabinet")
    check("legacy version without layout remains valid", "doorLayout" not in legacy["cabinets"][0] and legacy["legacyExtension"] is True)

    future = layout(); future["schema"] = "cabinet-door-layout-v2"; future_sql = json.dumps(future).replace("'", "''")
    sql(f'''UPDATE project_cabinets SET door_layout='{future_sql}'::jsonb WHERE "Id"='door-cabinet';''')
    future_before = sql("SELECT door_layout::text FROM project_cabinets WHERE \"Id\"='door-cabinet';")
    status, conflict, _ = request(path, "PUT", expected, admin_token)
    check("future persisted schema PUT is 409", status == 409 and conflict["schema"] == "cabinet-door-layout-v2")
    check("409 PUT is atomic", sql("SELECT door_layout::text FROM project_cabinets WHERE \"Id\"='door-cabinet';") == future_before)
    check("future persisted schema DELETE is 409", request(path, "DELETE", token=admin_token)[0] == 409)
    check("409 DELETE is atomic", sql("SELECT door_layout::text FROM project_cabinets WHERE \"Id\"='door-cabinet';") == future_before)

    print(json.dumps({"passed": len(passed), "artifact_directory": str(ARTIFACT)}), flush=True)
finally:
    stop_api()
    if pg_started or (ARTIFACT / "data/postmaster.pid").exists():
        pg("pg_ctl", "-D", ARTIFACT / "data", "-m", "fast", "-w", "stop", check=False)
