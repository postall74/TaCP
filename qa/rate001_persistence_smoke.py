"""Disposable PostgreSQL/HTTP smoke for rates-persistence-v1."""
import http.client, json, os, pathlib, secrets, socket, subprocess, time

ROOT = pathlib.Path(__file__).resolve().parents[1]
PG = pathlib.Path(r"C:/Program Files/PostgreSQL/18/bin")
ART = ROOT / ".worktrees" / ("rate001-" + secrets.token_hex(6))
ART.mkdir(parents=True)
FLAGS = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
pg_port = 0
api = None
passed = []

def port():
    with socket.socket() as s: s.bind(("127.0.0.1", 0)); return s.getsockname()[1]
def run(args, log="commands.log", timeout=120, env=None, cwd=None):
    with (ART/log).open("ab") as out:
        r=subprocess.run(list(map(str,args)),cwd=cwd,env=env,stdout=out,stderr=out,creationflags=FLAGS,timeout=timeout)
    if r.returncode: raise RuntimeError(f"command failed ({r.returncode}); see {ART/log}")
def pg(name,*args): run([PG/name,*args],f"{name}.log")
def sql(db, statement, scalar=False):
    r=subprocess.run([str(PG/"psql.exe"),"-h","127.0.0.1","-p",str(pg_port),"-U","qa_owner","-d",db,"-At","-v","ON_ERROR_STOP=1","-c",statement],capture_output=True,text=True,creationflags=FLAGS,timeout=30)
    if r.returncode: raise RuntimeError(r.stderr[-1500:])
    return r.stdout.strip() if scalar else None
def check(name, value):
    if not value: raise AssertionError(name)
    passed.append(name); print("PASS",name,flush=True)
def req(api_port,path,method="GET",body=None,token=None):
    c=http.client.HTTPConnection("127.0.0.1",api_port,timeout=10); h={}
    if body is not None: h["Content-Type"]="application/json"
    if token: h["Authorization"]="Bearer "+token
    try:
        c.request(method,path,json.dumps(body) if body is not None else None,h); r=c.getresponse(); raw=r.read()
        return r.status,(json.loads(raw) if raw else None)
    finally: c.close()
def stop_api():
    global api
    if api and api.poll() is None:
        api.terminate()
        try: api.wait(10)
        except subprocess.TimeoutExpired: api.kill(); api.wait(5)
    api=None
def start_api(db,dll,label):
    global api
    p=port(); email=f"admin-{label}@qa.test"; password=secrets.token_urlsafe(20)+"aA1!"
    env={k:v for k,v in os.environ.items() if not k.lower().startswith(("jwt","admin","connectionstrings","urls","aspnetcore_environment","dotnet_environment"))}
    env.update({"DOTNET_ENVIRONMENT":"Development","ASPNETCORE_ENVIRONMENT":"Development","ConnectionStrings__Tkp":f"Host=127.0.0.1;Port={pg_port};Database={db};Username=qa_owner","Jwt__Key":secrets.token_urlsafe(48),"Jwt__Issuer":f"issuer-{label}","Jwt__Audience":f"aud-{label}","Admin__Enabled":"true","Admin__Email":email,"Admin__Password":password,"URLS":f"http://127.0.0.1:{p}","StaticFilesPath":str(ART/"none")})
    log=(ART/f"api-{label}.log").open("wb")
    api=subprocess.Popen(["dotnet",str(dll)],cwd=dll.parent,env=env,stdout=log,stderr=log,creationflags=FLAGS)
    end=time.monotonic()+45
    while time.monotonic()<end:
        if api.poll() is not None: raise RuntimeError(f"API {label} exited")
        try:
            if req(p,"/api/health")[0]==200: break
        except OSError: pass
        time.sleep(.2)
    else: raise TimeoutError(label)
    st,login=req(p,"/api/auth/login","POST",{"email":email,"password":password}); check(label+" admin login",st==200)
    return p,login["token"]

pg_port=port(); started=False
try:
    pg("initdb.exe","-D",ART/"data","-U","qa_owner","--auth=trust","--encoding=UTF8","--no-locale")
    pg("pg_ctl.exe","-D",ART/"data","-l",ART/"postgres.log","-o",f"-h 127.0.0.1 -p {pg_port}","-w","start"); started=True
    for db in ("rate_a","rate_b","rate_legacy"): pg("createdb.exe","-h","127.0.0.1","-p",pg_port,"-U","qa_owner",db)
    run(["dotnet","build",ROOT/"backend/TkpApi/TkpApi.csproj","-c","Release","--no-restore"],"build.log",180,cwd=ROOT)
    dll=ROOT/"backend/TkpApi/bin/Release/net8.0/TkpApi.dll"
    defaults={"design":1800,"production":1800,"software":2200,"smr":1800,"pnr":1800}
    a={"design":1234.56789,"production":-9.87654,"software":0,"smr":4567.12345,"pnr":9876.54321}
    b={"design":3100,"production":3200,"software":3300,"smr":3400,"pnr":3500}
    pa,ta=start_api("rate_a",dll,"a1"); check("fresh defaults A",req(pa,"/api/rates",token=ta)==(200,defaults)); check("PUT A",req(pa,"/api/rates","PUT",a,ta)==(200,a)); stop_api()
    pa,ta=start_api("rate_a",dll,"a2"); check("restart persists A",req(pa,"/api/rates",token=ta)==(200,a)); stop_api()
    pb,tb=start_api("rate_b",dll,"b1"); check("fresh defaults B",req(pb,"/api/rates",token=tb)==(200,defaults)); check("PUT B",req(pb,"/api/rates","PUT",b,tb)==(200,b)); stop_api()
    pa,ta=start_api("rate_a",dll,"a3"); check("tenant A isolated",req(pa,"/api/rates",token=ta)==(200,a)); stop_api()
    pb,tb=start_api("rate_b",dll,"b2"); check("tenant B isolated",req(pb,"/api/rates",token=tb)==(200,b)); stop_api()
    # Reproduce an EnsureCreated-era database: existing application tables, no
    # migration history and no rate table. Preserve an unrelated user row.
    pl,tl=start_api("rate_legacy",dll,"legacy-seed"); stop_api()
    users_before=sql("rate_legacy",'SELECT COUNT(*) FROM "AspNetUsers";',True)
    sql("rate_legacy",'DROP TABLE rate_cards; DROP TABLE "__EFMigrationsHistory";')
    pl,tl=start_api("rate_legacy",dll,"legacy-migrate")
    check("legacy migration seeds defaults",req(pl,"/api/rates",token=tl)==(200,defaults))
    # The second process intentionally bootstraps its own admin, so exactly one
    # new user is expected; every pre-existing user must remain.
    check("legacy migration preserves other data",int(sql("rate_legacy",'SELECT COUNT(*) FROM "AspNetUsers";',True))==int(users_before)+1)
    stop_api()
    print(json.dumps({"passed":len(passed),"artifact":str(ART)}),flush=True)
finally:
    stop_api()
    if started: pg("pg_ctl.exe","-D",ART/"data","-m","fast","-w","stop")
