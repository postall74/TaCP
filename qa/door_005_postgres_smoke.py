"""DOOR-005 isolated PostgreSQL migration, HTTP, JSONB and authorization gate."""

import copy
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
ARTIFACT = ROOT.parents[1] / "qa-artifacts" / ("door-005-" + secrets.token_hex(8))
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


def run(command, name, env=None, timeout=180):
    with (ARTIFACT / f"{name}.log").open("ab") as log:
        result = subprocess.run(command, cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
                                stdout=log, stderr=log, creationflags=FLAGS, timeout=timeout)
    if result.returncode:
        raise RuntimeError(f"{name} failed; see {ARTIFACT / (name + '.log')}")


def pg(name, *args, check=True):
    try:
        run([str(PG / name), *map(str, args)], name, timeout=90)
    except RuntimeError:
        if check:
            raise


def sql(query):
    result = subprocess.run(
        [str(PG / "psql"), "-h", "127.0.0.1", "-p", str(PG_PORT), "-U", "qa_owner",
         "-d", "qa_door5", "-At", "-v", "ON_ERROR_STOP=1", "-c", query],
        capture_output=True, text=True, creationflags=FLAGS, timeout=30)
    if result.returncode:
        raise RuntimeError(result.stderr[-1600:])
    return result.stdout.strip()


def request(path, method="GET", body=None, token=None):
    conn = http.client.HTTPConnection("127.0.0.1", API_PORT, timeout=15)
    headers = {"Content-Type": "application/json"} if body is not None else {}
    if token:
        headers["Authorization"] = "Bearer " + token
    try:
        payload = json.dumps(body, ensure_ascii=False).encode() if body is not None else None
        conn.request(method, path, payload, headers)
        response = conn.getresponse()
        raw = response.read()
        return response.status, json.loads(raw) if raw else None
    finally:
        conn.close()


def check(name, condition):
    if not condition:
        raise AssertionError(name)
    passed.append(name)
    print("PASS " + name, flush=True)


def layout(doors=2):
    elements = [{"id": "lamp-0", "kind": "lamp", "tone": "green", "label": "Сеть", "door": 0, "x": 0, "y": 1000}]
    if doors == 2:
        elements.append({"id": "stop-0", "kind": "emergency-stop", "label": "", "door": 1, "x": 500, "y": 500})
    return {"schema": "cabinet-door-layout-v1", "doorCount": doors, "labelSide": "below", "elements": elements}


def geometry_two():
    return json.loads((ROOT / "backend/TkpApi/cabinet-door-geometry-v1.fixture.json").read_text(encoding="utf-8"))


def geometry_one():
    return {"schema": "cabinet-door-geometry-v1", "units": "mm", "view": "outside-front", "leaves": [{
        "door": 0, "originXmm": 0, "originYmm": 0, "widthMm": 1, "heightMm": 1,
        "placement": {"leftMm": 0, "topMm": 0, "widthMm": 1, "heightMm": 1},
    }]}


def geometry_boundary():
    return {"schema": "cabinet-door-geometry-v1", "units": "mm", "view": "outside-front", "leaves": [
        {"door": 0, "originXmm": 0, "originYmm": 0, "widthMm": 5000, "heightMm": 10000,
         "placement": {"leftMm": 0, "topMm": 0, "widthMm": 5000, "heightMm": 10000}},
        {"door": 1, "originXmm": 5000, "originYmm": 0, "widthMm": 5000, "heightMm": 10000,
         "placement": {"leftMm": 0, "topMm": 0, "widthMm": 5000, "heightMm": 10000}},
    ]}


def cabinet(cid, door_layout=None, geometry=None):
    value = {"id": cid, "kind": "АВР", "name": cid, "hours": 0, "designHours": 0,
             "softwareHours": 0, "items": [], "segments": []}
    if door_layout is not None:
        value["doorLayout"] = door_layout
    if geometry is not None:
        value["doorGeometry"] = geometry
    return value


def project(pid, number, cabinets):
    return {"id": pid, "number": number, "title": "Door geometry QA", "client": "QA", "contact": "",
            "direction": "nku", "status": "draft", "createdAt": 1760000000000, "updatedAt": 1760000000000,
            "markup": 15, "workMarkup": 25, "discount": 0, "vatRate": 20, "showWorkLines": True,
            "tzzPct": 1, "thirdParty": 0, "extraCosts": 0, "unforeseenPct": 2, "tripCosts": 0,
            "transportPct": 0, "smrCost": 0, "smrSell": 0, "pnrCost": 0, "pnrSell": 0,
            "validDays": 30, "notes": "", "cabinets": cabinets, "versions": []}


def by_id(items, item_id):
    return next(item for item in items if item["id"] == item_id)


def stop_api():
    global api
    if api is not None and api.poll() is None:
        api.terminate()
        try:
            api.wait(timeout=10)
        except subprocess.TimeoutExpired:
            api.kill(); api.wait(timeout=5)
    api = None


def start_api(env, suffix):
    global api
    with (ARTIFACT / f"api-{suffix}.log").open("wb") as log:
        api = subprocess.Popen(["dotnet", str(ROOT / "backend/TkpApi/bin/Release/net8.0/TkpApi.dll")],
                               cwd=ROOT / "backend/TkpApi", env=env, stdout=log, stderr=log, creationflags=FLAGS)
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if api.poll() is not None:
            raise RuntimeError(f"API exited; see api-{suffix}.log")
        try:
            if request("/api/health")[0] == 200:
                return
        except OSError:
            pass
        time.sleep(.2)
    raise TimeoutError("API startup timeout")


admin_email = "door5-admin@example.test"
admin_password = secrets.token_urlsafe(24) + "aA1!"

try:
    pg("initdb", "-D", ARTIFACT / "data", "-U", "qa_owner", "--auth=trust", "--encoding=UTF8", "--no-locale")
    pg("pg_ctl", "-D", ARTIFACT / "data", "-l", ARTIFACT / "postgres.log", "-o", f"-h 127.0.0.1 -p {PG_PORT}", "-w", "start")
    pg_started = True
    pg("createdb", "-h", "127.0.0.1", "-p", PG_PORT, "-U", "qa_owner", "qa_door5")

    env = {k: v for k, v in os.environ.items() if not k.lower().startswith(
        ("jwt", "admin", "connectionstrings", "cors", "swagger", "allowedhosts", "urls", "dotnet_environment", "aspnetcore_environment"))}
    env.update({
        "DOTNET_ENVIRONMENT": "Production", "ASPNETCORE_ENVIRONMENT": "Production",
        "ConnectionStrings__Tkp": f"Host=127.0.0.1;Port={PG_PORT};Database=qa_door5;Username=qa_owner",
        "Jwt__Key": secrets.token_urlsafe(48), "Jwt__Issuer": "qa", "Jwt__Audience": "qa",
        "AllowedHosts": "127.0.0.1;localhost", "Cors__AllowedOrigins__0": "http://localhost:5187",
        "Admin__Enabled": "true", "Admin__Email": admin_email, "Admin__Password": admin_password,
        "URLS": f"http://127.0.0.1:{API_PORT}", "StaticFilesPath": str(ARTIFACT / "no-static"),
    })
    ef = ["dotnet", "ef", "database", "update", "--project", "backend/TkpApi/TkpApi.csproj", "--configuration", "Release", "--no-build"]
    baseline = "20261015181034_AddCabinetDoorLayout"
    run(ef[:4] + [baseline] + ef[4:], "migration-baseline", env)
    check("clean baseline has no door_geometry", sql("SELECT count(*) FROM information_schema.columns WHERE table_name='project_cabinets' AND column_name='door_geometry';") == "0")
    run(ef, "migration-clean-up", env)
    check("clean up adds nullable jsonb", sql("SELECT data_type||':'||is_nullable FROM information_schema.columns WHERE table_name='project_cabinets' AND column_name='door_geometry';") == "jsonb:YES")

    start_api(env, "legacy-seed")
    status, login_body = request("/api/auth/login", "POST", {"email": admin_email, "password": admin_password})
    check("admin login for legacy seed", status == 200)
    admin_token = login_body["token"]
    legacy_project = project("legacy-project", "D5-LEGACY", [cabinet("legacy-cab")])
    check("create legacy row without geometry", request("/api/projects", "POST", legacy_project, admin_token)[0] == 201)
    stop_api()
    run(ef[:4] + [baseline] + ef[4:], "migration-down", env)
    check("down removes door_geometry", sql("SELECT count(*) FROM information_schema.columns WHERE table_name='project_cabinets' AND column_name='door_geometry';") == "0")
    run(ef, "migration-up-again", env)
    check("up-down-up restores nullable jsonb", sql("SELECT udt_name||':'||is_nullable FROM information_schema.columns WHERE table_name='project_cabinets' AND column_name='door_geometry';") == "jsonb:YES")
    check("legacy row receives null without backfill", sql("SELECT coalesce(door_geometry::text,'null') FROM project_cabinets WHERE \"Id\"='legacy-cab';") == "null")

    start_api(env, "gate")
    status, login_body = request("/api/auth/login", "POST", {"email": admin_email, "password": admin_password})
    admin_token = login_body["token"]
    user_email, user_password = "door5-norole@example.test", secrets.token_urlsafe(20) + "1A!"
    registration = {"email": user_email, "password": user_password, "fullName": "No Role", "position": "", "role": "engineer"}
    check("create authorization fixture", request("/api/auth/register", "POST", registration, admin_token)[0] == 200)
    user_id = sql(f'''SELECT "Id" FROM "AspNetUsers" WHERE "NormalizedEmail"='{user_email.upper()}';''')
    sql(f'''DELETE FROM "AspNetUserRoles" WHERE "UserId"='{user_id}';''')
    status, no_role = request("/api/auth/login", "POST", {"email": user_email, "password": user_password})
    check("no-role login", status == 200 and no_role["user"]["roles"] == [])
    no_role_token = no_role["token"]

    fixture = geometry_two()
    main = project("door5-project", "D5-1", [cabinet("cab-two", layout(2)), cabinet("cab-one")])
    check("POST project with geometry omitted", request("/api/projects", "POST", main, admin_token)[0] == 201)
    path = "/api/projects/door5-project/cabinets/cab-two/door-geometry"
    before = sql("SELECT coalesce(door_geometry::text,'null') FROM project_cabinets WHERE \"Id\"='cab-two';")
    check("anonymous PUT is 401", request(path, "PUT", fixture)[0] == 401)
    check("401 is atomic", sql("SELECT coalesce(door_geometry::text,'null') FROM project_cabinets WHERE \"Id\"='cab-two';") == before)
    check("no-role PUT is 403", request(path, "PUT", fixture, no_role_token)[0] == 403)
    check("403 is atomic", sql("SELECT coalesce(door_geometry::text,'null') FROM project_cabinets WHERE \"Id\"='cab-two';") == before)
    check("missing project is 404", request("/api/projects/missing/cabinets/cab-two/door-geometry", "PUT", fixture, admin_token)[0] == 404)
    check("missing cabinet is 404", request("/api/projects/door5-project/cabinets/missing/door-geometry", "PUT", fixture, admin_token)[0] == 404)

    status, saved = request(path, "PUT", fixture, admin_token)
    check("fixture addressed PUT exact", status == 200 and saved == fixture)
    check("JSONB exact fixture", json.loads(sql("SELECT door_geometry::text FROM project_cabinets WHERE \"Id\"='cab-two';")) == fixture)
    status, fetched = request("/api/projects/door5-project", token=admin_token)
    check("project GET geometry roundtrip", status == 200 and by_id(fetched["cabinets"], "cab-two")["doorGeometry"] == fixture)

    one_path = "/api/projects/door5-project/cabinets/cab-one/door-geometry"
    check("one-door minimum boundary accepted", request(one_path, "PUT", geometry_one(), admin_token)[0] == 200)
    check("two-door maximum boundary accepted", request(path, "PUT", geometry_boundary(), admin_token)[0] == 200)
    check("restore contract fixture", request(path, "PUT", fixture, admin_token)[0] == 200)

    stable = sql("SELECT door_geometry::text FROM project_cabinets WHERE \"Id\"='cab-two';")
    invalids = []
    def bad(change):
        value = copy.deepcopy(fixture); change(value); invalids.append(value)
    bad(lambda g: g.update(schema="cabinet-door-geometry-v2"))
    bad(lambda g: g.update(units="cm")); bad(lambda g: g.update(view="inside-front"))
    bad(lambda g: g.update(leaves=[])); bad(lambda g: g["leaves"].append(copy.deepcopy(g["leaves"][1])))
    bad(lambda g: g["leaves"][1].update(door=0)); bad(lambda g: g["leaves"][1].update(door=2))
    bad(lambda g: g["leaves"][0].update(originXmm=-1)); bad(lambda g: g["leaves"][0].update(widthMm=0))
    bad(lambda g: g["leaves"][0].update(widthMm=10001)); bad(lambda g: g["leaves"][0].update(originXmm=9500, widthMm=600))
    bad(lambda g: g["leaves"][0]["placement"].update(leftMm=-1))
    bad(lambda g: g["leaves"][0]["placement"].update(widthMm=0))
    bad(lambda g: g["leaves"][0]["placement"].update(leftMm=200, widthMm=700))
    bad(lambda g: g["leaves"][1].update(originXmm=700))
    for index, invalid in enumerate(invalids):
        status, _ = request(path, "PUT", invalid, admin_token)
        check(f"invalid geometry {index + 1} is atomic 400", status == 400 and sql("SELECT door_geometry::text FROM project_cabinets WHERE \"Id\"='cab-two';") == stable)

    mismatch = geometry_one()
    check("layout/geometry door mismatch is 400", request(path, "PUT", mismatch, admin_token)[0] == 400)
    check("mismatch is atomic", sql("SELECT door_geometry::text FROM project_cabinets WHERE \"Id\"='cab-two';") == stable)
    bad_layout = layout(1)
    layout_path = "/api/projects/door5-project/cabinets/cab-two/door-layout"
    check("DOOR-001 layout incompatible with geometry is 400", request(layout_path, "PUT", bad_layout, admin_token)[0] == 400)
    check("layout 400 preserves geometry", sql("SELECT door_geometry::text FROM project_cabinets WHERE \"Id\"='cab-two';") == stable)
    status, layout_saved = request(layout_path, "PUT", layout(2), admin_token)
    check("DOOR-001 valid layout remains exact", status == 200 and layout_saved == layout(2))

    status, full = request("/api/projects/door5-project", token=admin_token)
    by_id(full["cabinets"], "cab-two").pop("doorGeometry", None)
    by_id(full["cabinets"], "cab-two")["name"] = "old client rename"
    status, omitted = request("/api/projects/door5-project", "PUT", full, admin_token)
    check("full PUT omission preserves geometry", status == 200 and by_id(omitted["cabinets"], "cab-two")["doorGeometry"] == fixture)

    status, versions = request("/api/projects/door5-project/versions?label=geometry-snapshot", "POST", token=admin_token)
    snapshot_geometry = by_id(versions[0]["snapshot"]["cabinets"], "cab-two")["doorGeometry"]
    check("version captures geometry", status == 200 and snapshot_geometry == fixture)
    check("addressed DELETE clears geometry", request(path, "DELETE", token=admin_token)[0] == 204)
    status, after_delete = request("/api/projects/door5-project", token=admin_token)
    check("DELETE persisted null", status == 200 and by_id(after_delete["cabinets"], "cab-two").get("doorGeometry") is None)
    check("version snapshot remains immutable", by_id(after_delete["versions"][0]["snapshot"]["cabinets"], "cab-two")["doorGeometry"] == fixture)

    check("restore geometry before project atomicity", request(path, "PUT", fixture, admin_token)[0] == 200)
    status, full = request("/api/projects/door5-project", token=admin_token)
    before_all = sql("SELECT \"Id\"||':'||coalesce(door_geometry::text,'null') FROM project_cabinets WHERE \"ProjectId\"='door5-project' ORDER BY \"Id\";")
    by_id(full["cabinets"], "cab-two")["doorGeometry"]["leaves"][0]["widthMm"] = 0
    by_id(full["cabinets"], "cab-one")["name"] = "must not persist"
    check("invalid full project write is 400", request("/api/projects/door5-project", "PUT", full, admin_token)[0] == 400)
    check("full project 400 has no partial SQL mutation", sql("SELECT \"Id\"||':'||coalesce(door_geometry::text,'null') FROM project_cabinets WHERE \"ProjectId\"='door5-project' ORDER BY \"Id\";") == before_all)

    future = copy.deepcopy(fixture); future["schema"] = "cabinet-door-geometry-v2"
    future_sql = json.dumps(future).replace("'", "''")
    sql(f'''UPDATE project_cabinets SET door_geometry='{future_sql}'::jsonb WHERE "Id"='cab-two';''')
    future_before = sql("SELECT door_geometry::text FROM project_cabinets WHERE \"Id\"='cab-two';")
    check("persisted future schema addressed PUT is 409", request(path, "PUT", fixture, admin_token)[0] == 409)
    check("future PUT is atomic", sql("SELECT door_geometry::text FROM project_cabinets WHERE \"Id\"='cab-two';") == future_before)
    check("persisted future schema DELETE is 409", request(path, "DELETE", token=admin_token)[0] == 409)
    check("future DELETE is atomic", sql("SELECT door_geometry::text FROM project_cabinets WHERE \"Id\"='cab-two';") == future_before)
    status, future_project = request("/api/projects/door5-project", token=admin_token)
    future_project["title"] = "blocked mutation"
    check("persisted future schema full PUT is 409", request("/api/projects/door5-project", "PUT", future_project, admin_token)[0] == 409)
    check("future full PUT is atomic", sql("SELECT door_geometry::text FROM project_cabinets WHERE \"Id\"='cab-two';") == future_before)

    status, legacy_get = request("/api/projects/legacy-project", token=admin_token)
    check("legacy project reads null geometry", status == 200 and legacy_get["cabinets"][0].get("doorGeometry") is None)
    status, legacy_versions = request("/api/projects/legacy-project/versions?label=legacy", "POST", token=admin_token)
    legacy_snapshot_cabinet = legacy_versions[0]["snapshot"]["cabinets"][0]
    check("legacy snapshot has no geometry", status == 200 and legacy_snapshot_cabinet.get("doorGeometry") is None)

    print(json.dumps({"passed": len(passed), "artifact_directory": str(ARTIFACT)}), flush=True)
finally:
    stop_api()
    if pg_started or (ARTIFACT / "data/postmaster.pid").exists():
        pg("pg_ctl", "-D", ARTIFACT / "data", "-m", "fast", "-w", "stop", check=False)
