"""CORE-005 independent HTTP smoke. Requires PostgreSQL bin and built Release API.
Creates a fresh loopback-only cluster; stops only owned processes in finally.
Run: python qa/runtime_config_smoke.py --pg-bin <PostgreSQL/bin>
"""
import argparse, http.client, json, os, pathlib, secrets, socket, subprocess, time

parser = argparse.ArgumentParser()
parser.add_argument('--pg-bin', required=True)
args = parser.parse_args()
root = pathlib.Path(__file__).resolve().parents[1]
pg = pathlib.Path(args.pg_bin)
(root / '.worktrees').mkdir(exist_ok=True)
artifact = root / '.worktrees' / ('tkp-qa-core005-' + secrets.token_hex(8))
artifact.mkdir()
flags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
api = None
pg_started = False
checks = []

def free_port():
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        return sock.getsockname()[1]

pg_port, api_port = free_port(), free_port()
def run_pg(name, *arguments):
    log_path = artifact / (name + '-command.log')
    with log_path.open('ab') as command_log:
        result = subprocess.run([str(pg / name), *map(str, arguments)], stdin=subprocess.DEVNULL, stdout=command_log, stderr=command_log, creationflags=flags, timeout=45)
    if result.returncode:
        raise RuntimeError(name + ' failed; inspect ' + str(log_path))

def request(path, method='GET', body=None, headers=None):
    connection = http.client.HTTPConnection('127.0.0.1', api_port, timeout=5)
    h = dict(headers or {})
    if body is not None: h['Content-Type'] = 'application/json'
    try:
        connection.request(method, path, body=json.dumps(body) if body is not None else None, headers=h)
        response = connection.getresponse()
        return response.status, dict((k.lower(), v) for k, v in response.getheaders()), response.read()
    finally:
        connection.close()

def check(name, condition):
    if not condition: raise AssertionError(name)
    checks.append(name)
    print('PASS ' + name, flush=True)

def stop_api():
    global api
    if api is not None:
        if api.poll() is None:
            api.terminate()
            try: api.wait(timeout=10)
            except subprocess.TimeoutExpired:
                api.kill(); api.wait(timeout=5)
        api = None

jwt = secrets.token_urlsafe(48)
password = secrets.token_urlsafe(24) + 'aA1!'
email = 'qa-bootstrap@example.test'
def start_api(environment='Production', enabled=True, supplied_password=None, supplied_email=email):
    global api
    env = {k:v for k,v in os.environ.items() if not k.lower().startswith(('jwt', 'admin', 'connectionstrings', 'cors', 'swagger', 'allowedhosts', 'urls', 'dotnet_environment', 'aspnetcore_environment', 'aspnetcore_urls'))}
    env.update({
        'DOTNET_ENVIRONMENT': environment, 'ASPNETCORE_ENVIRONMENT': environment,
        'ConnectionStrings__Tkp': f'Host=127.0.0.1;Port={pg_port};Database=qa_runtime;Username=qa_owner',
        'Jwt__Key': jwt, 'Jwt__Issuer': 'qa-issuer', 'Jwt__Audience': 'qa-audience',
        'AllowedHosts': '127.0.0.1;localhost', 'Cors__AllowedOrigins__0': 'http://localhost:5187',
        'Admin__Enabled': str(enabled).lower(), 'Admin__Email': supplied_email,
        'Admin__Password': supplied_password or password, 'URLS': f'http://127.0.0.1:{api_port}',
        'StaticFilesPath': str(artifact / 'no-static-files'),
    })
    # Development must use its documented issuer/audience/origin defaults.
    if environment == 'Development':
        for key in ['Jwt__Issuer', 'Jwt__Audience', 'AllowedHosts', 'Cors__AllowedOrigins__0']:
            env.pop(key)
    log = open(artifact / ('api-' + str(len(checks)) + '.log'), 'wb')
    try:
        api = subprocess.Popen(['dotnet', str(root / 'backend/TkpApi/bin/Release/net8.0/TkpApi.dll')], cwd=root / 'backend/TkpApi', env=env, stdout=log, stderr=log, creationflags=flags)
    finally: log.close()
    until = time.monotonic() + 45
    while time.monotonic() < until:
        if api.poll() is not None: raise RuntimeError('API exited before health; inspect local logs at ' + str(artifact))
        try:
            if request('/api/health')[0] == 200: return
        except (OSError, http.client.HTTPException): pass
        time.sleep(.2)
    raise TimeoutError('API health timeout')

try:
    run_pg('initdb', '-D', artifact / 'data', '-U', 'qa_owner', '--auth=trust', '--encoding=UTF8', '--no-locale')
    run_pg('pg_ctl', '-D', artifact / 'data', '-l', artifact / 'postgres.log', '-o', f'-h 127.0.0.1 -p {pg_port}', '-w', 'start')
    pg_started = True
    run_pg('createdb', '-h', '127.0.0.1', '-p', pg_port, '-U', 'qa_owner', 'qa_runtime')
    start_api()
    check('production health', request('/api/health')[0] == 200)
    check('production Swagger disabled', request('/swagger/index.html')[0] == 404)
    check('allowed origin', request('/api/health', headers={'Origin':'http://localhost:5187'})[1].get('access-control-allow-origin') == 'http://localhost:5187')
    check('foreign origin rejected', 'access-control-allow-origin' not in request('/api/health', headers={'Origin':'https://foreign.example.test'})[1])
    check('foreign host rejected', request('/api/health', headers={'Host':'foreign.example.test'})[0] == 400)
    status, _, content = request('/api/auth/login', 'POST', {'email':email, 'password':password})
    check('bootstrap admin can log in', status == 200 and 'admin' in json.loads(content)['user']['roles'])
    stop_api()
    changed_password = secrets.token_urlsafe(24) + 'aA1!'
    start_api(supplied_password=changed_password)
    check('bootstrap preserves existing password', request('/api/auth/login', 'POST', {'email':email, 'password':password})[0] == 200)
    check('bootstrap does not replace password', request('/api/auth/login', 'POST', {'email':email, 'password':changed_password})[0] == 401)
    stop_api()
    run_pg('psql', '-h', '127.0.0.1', '-p', pg_port, '-U', 'qa_owner', '-d', 'qa_runtime', '-v', 'ON_ERROR_STOP=1', '-c', '''UPDATE "AspNetUserRoles" SET "RoleId" = (SELECT "Id" FROM "AspNetRoles" WHERE "Name" = 'engineer') WHERE "UserId" = (SELECT "Id" FROM "AspNetUsers" WHERE "Email" = 'qa-bootstrap@example.test');''')
    start_api()
    status, _, content = request('/api/auth/login', 'POST', {'email':email, 'password':password})
    check('bootstrap preserves existing role', status == 200 and json.loads(content)['user']['roles'] == ['engineer'])
    stop_api()
    start_api(environment='Development', enabled=False, supplied_email='disabled@example.test')
    check('Development Swagger enabled', request('/swagger/index.html')[0] == 200)
    check('Development default CORS', request('/api/health', headers={'Origin':'http://localhost:3000'})[1].get('access-control-allow-origin') == 'http://localhost:3000')
    check('disabled bootstrap creates no user', request('/api/auth/login', 'POST', {'email':'disabled@example.test', 'password':password})[0] == 401)
    print(json.dumps({'passed': len(checks), 'artifact_directory':str(artifact)}), flush=True)
finally:
    stop_api()
    if pg_started or (artifact / 'data/postmaster.pid').exists(): run_pg('pg_ctl', '-D', artifact / 'data', '-m', 'fast', '-w', 'stop')




