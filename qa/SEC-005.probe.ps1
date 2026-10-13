$ErrorActionPreference = 'Stop'
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('qa_sec005_' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'pgdata'; $pgLog = Join-Path $root 'postgres.log'
$apiOut = Join-Path $root 'api.out.log'; $apiErr = Join-Path $root 'api.err.log'
$pgPort = 55675; $apiPort = 55375; $db = 'qa_sec005'; $base = "http://127.0.0.1:$apiPort"
$adminEmail = 'admin@sec005.qa.test'; $adminPassword = 'Qa1!' + [Guid]::NewGuid().ToString('N')
$jwtKey = 'qa-sec005-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$apiProcess = $null; $checks = 0

function Check([bool]$ok, [string]$name) { if (-not $ok) { throw "FAIL: $name" }; $script:checks++; "PASS: $name" }
function Request([string]$method, [string]$path, $body = $null, [string]$token = '', [switch]$Raw) {
  $headers = @{}; if ($token) { $headers.Authorization = "Bearer $token" }
  $args = @{ Uri=$base+$path; Method=$method; Headers=$headers; TimeoutSec=20; SkipHttpErrorCheck=$true }
  if ($null -ne $body) {
    $args.ContentType = 'application/json'
    $args.Body = if ($Raw) { [string]$body } else { $body | ConvertTo-Json -Depth 30 -Compress }
  }
  $r = Invoke-WebRequest @args
  $status = [int]$r.StatusCode
  $text = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
  $json = if ($text -and ($text.TrimStart().StartsWith('{') -or $text.TrimStart().StartsWith('['))) { $text | ConvertFrom-Json } else { $null }
  [pscustomobject]@{ Status=$status; Json=$json; Text=$text }
}
function Sql([string]$query) { (($query | & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tA).Trim()) }
function Cabinet([string]$id, [string]$name) { @{ id=$id; kind='nku'; name=$name; hours=1; designHours=0; softwareHours=0; items=@(); segments=@(); form='1' } }
function Canonical($value) { $value | ConvertTo-Json -Depth 30 -Compress }

$routes = @(
  @{ Method='GET';  Path='/api/kits/systems'; Body=$null },
  @{ Method='POST'; Path='/api/kits/calculate'; Body=@{systemId='cqen-floor';h=2000;w=800;d=600;doors=2;joined=2;pedestal=$true;extraTraverses=1} },
  @{ Method='POST'; Path='/api/cabinets/thermal-calc'; Body=@{cabinet=@{id='thermal-cab';kind='nku';name='Thermal';hours=0;designHours=0;softwareHours=0;items=@(@{id='thermal-line';eqId='thermal-eq';sku='QF';name='QF';brand='QA';unit='шт';qty=2;purchase=10});segments=@();form='1'};catalog=@(@{id='thermal-eq';sku='QF';name='Breaker';brand='QA';category='Автоматический выключатель';direction='nku';unit='шт';purchase=10;ratedCurrent=16;attrs='3P'})} },
  @{ Method='POST'; Path='/api/cabinets/configure-empty'; Body=@{brand='DKC';h=2000;w=800;d=600;ip=54;mount='floor'} },
  @{ Method='POST'; Path='/api/cabinets/configure-preassembled'; Body=@{brand='EKF';h=2000;w=800;d=600;ip=54;items=@(@{id='pre-line';eqId=$null;sku='QA';name='QA item';brand='QA';unit='шт';qty=1;purchase=100})} },
  @{ Method='POST'; Path='/api/cabinets/assemble-side'; Body=@{name='Side QA';cabinets=@((Cabinet 'side-a' '2000x800x600 A'),(Cabinet 'side-b' '2000x1000x600 B'))} },
  @{ Method='POST'; Path='/api/cabinets/assemble-front-back'; Body=@{name='Front QA';cabinets=@((Cabinet 'front-a' '2000x800x600 A'),(Cabinet 'front-b' '2000x800x400 B'))} }
)

try {
  New-Item -ItemType Directory -Path $root | Out-Null
  $init = Start-Process "$pgBin\initdb.exe" -ArgumentList @('-D',$data,'-U','postgres','-A','trust','-E','UTF8','--no-locale') -RedirectStandardOutput (Join-Path $root 'init.out') -RedirectStandardError (Join-Path $root 'init.err') -PassThru -Wait -WindowStyle Hidden
  Check ($init.ExitCode -eq 0) 'isolated cluster initialized'
  & "$pgBin\pg_ctl.exe" start -D $data -o "-p $pgPort -h 127.0.0.1" -l $pgLog -W
  Check ($LASTEXITCODE -eq 0) 'PostgreSQL launch requested'
  for ($i=0; $i-lt 50; $i++) { & "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort -U postgres *> $null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Milliseconds 100 }
  Check ($LASTEXITCODE -eq 0) 'PostgreSQL ready'
  & "$pgBin\createdb.exe" -h 127.0.0.1 -p $pgPort -U postgres $db
  Check ($LASTEXITCODE -eq 0) 'database created'

  $env:ConnectionStrings__Tkp="Host=127.0.0.1;Port=$pgPort;Database=$db;Username=postgres"
  $env:Jwt__Key=$jwtKey; $env:Jwt__Issuer='tkp-api'; $env:Jwt__Audience='tkp-web'; $env:Jwt__ExpireMinutes='60'
  $env:Cors__AllowedOrigins__0='http://127.0.0.1:3000'; $env:AllowedHosts='localhost;127.0.0.1'
  $env:Admin__Enabled='true'; $env:Admin__Email=$adminEmail; $env:Admin__Password=$adminPassword
  $env:Swagger__Enabled='true'; $env:ASPNETCORE_URLS=$base; $env:ASPNETCORE_ENVIRONMENT='Production'
  $dll = Join-Path $PSScriptRoot '..\backend\TkpApi\bin\Release\net8.0\TkpApi.dll'
  $apiProcess = Start-Process dotnet -ArgumentList @($dll) -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru -WindowStyle Hidden
  $health = $null
  for ($i=0; $i-lt 100; $i++) { try { $health=Invoke-WebRequest "$base/api/health" -TimeoutSec 2; if ($health.StatusCode -eq 200) { break } } catch {}; Start-Sleep -Milliseconds 100 }
  Check ($health.StatusCode -eq 200) 'public health 200'
  Check ((Request POST '/api/auth/login' @{email='missing@sec005.qa.test';password='Wrong1!'}).Status -eq 401) 'public login reaches handler and returns credential 401'

  $login = Request POST '/api/auth/login' @{email=$adminEmail;password=$adminPassword}
  Check ($login.Status -eq 200 -and $login.Json.token) 'admin login'; $admin=$login.Json.token
  $tokens = @{ admin=$admin }
  foreach ($role in @('manager','engineer')) {
    $email="$role@sec005.qa.test"
    Check ((Request POST '/api/auth/register' @{email=$email;password='RoleTest1!';fullName="QA $role";role=$role} $admin).Status -eq 200) "$role created"
    $roleLogin=Request POST '/api/auth/login' @{email=$email;password='RoleTest1!'}
    Check ($roleLogin.Status -eq 200 -and $roleLogin.Json.token) "$role login"
    $tokens[$role]=$roleLogin.Json.token
  }
  $noStaffEmail='nostaff@sec005.qa.test'
  Check ((Request POST '/api/auth/register' @{email=$noStaffEmail;password='RoleTest1!';fullName='QA no staff';role='engineer'} $admin).Status -eq 200) 'temporary engineer created for no-role principal'
  [void](Sql "DELETE FROM `"AspNetUserRoles`" WHERE `"UserId`"=(SELECT `"Id`" FROM `"AspNetUsers`" WHERE `"NormalizedEmail`"='NOSTAFF@SEC005.QA.TEST');")
  $remainingRoles = Sql "SELECT count(*) FROM `"AspNetUserRoles`" WHERE `"UserId`"=(SELECT `"Id`" FROM `"AspNetUsers`" WHERE `"NormalizedEmail`"='NOSTAFF@SEC005.QA.TEST');"
  Check ($remainingRoles -eq '0') 'staff role removed in SQL fixture'
  $noStaffLogin=Request POST '/api/auth/login' @{email=$noStaffEmail;password='RoleTest1!'}
  Check ($noStaffLogin.Status -eq 200 -and $noStaffLogin.Json.token) 'authenticated no-role login'; $noStaff=$noStaffLogin.Json.token

  foreach ($route in $routes) {
    $body = if ($route.Method -eq 'POST') { '{bad json' } else { $null }
    Check ((Request $route.Method $route.Path $body '' -Raw).Status -eq 401) "anonymous blocked before handler: $($route.Method) $($route.Path)"
    Check ((Request $route.Method $route.Path $body 'invalid-token' -Raw).Status -eq 401) "invalid token blocked before handler: $($route.Method) $($route.Path)"
    Check ((Request $route.Method $route.Path $body $noStaff -Raw).Status -eq 403) "authenticated non-Staff forbidden before handler: $($route.Method) $($route.Path)"
  }

  $reference = @{}
  foreach ($role in @('admin','manager','engineer')) {
    foreach ($route in $routes) {
      $response = Request $route.Method $route.Path $route.Body $tokens[$role]
      Check ($response.Status -eq 200) "$role retains 200: $($route.Method) $($route.Path)"
      $key="$($route.Method) $($route.Path)"
      if ($role -eq 'admin') { $reference[$key]=$response.Json }
      elseif ($route.Path -eq '/api/cabinets/configure-empty') { Check ($response.Json.orderCode -eq 'CQE-2000-800-600-IP54-E' -and $response.Json.assemblyHours -eq 3.5) "$role empty-cabinet calculation compatible" }
      elseif ($route.Path -eq '/api/cabinets/configure-preassembled') { Check ($response.Json.orderCode -eq 'PRO-2000-800-600-IP54-P' -and $response.Json.assemblyHours -eq 5) "$role preassembled calculation compatible" }
      elseif ($route.Path -eq '/api/cabinets/assemble-side') { Check ($response.Json.totalWidth -eq 1800 -and $response.Json.totalDepth -eq 600 -and @($response.Json.cabinetIds).Count -eq 2) "$role side assembly calculation compatible" }
      elseif ($route.Path -eq '/api/cabinets/assemble-front-back') { Check ($response.Json.totalWidth -eq 800 -and $response.Json.totalDepth -eq 1000 -and @($response.Json.cabinetIds).Count -eq 2) "$role front/back assembly calculation compatible" }
      else { Check ((Canonical $response.Json) -eq (Canonical $reference[$key])) "$role response compatible with admin: $key" }
    }
  }
  Check (@($reference['GET /api/kits/systems']).Count -eq 3) 'kit systems contract contains three systems'
  Check ($reference['POST /api/kits/calculate'].lines.Count -ge 8 -and $reference['POST /api/kits/calculate'].hours -gt 0 -and $reference['POST /api/kits/calculate'].total -gt 0) 'kit calculation JSON and positive totals'
  Check ($reference['POST /api/cabinets/thermal-calc'].heatWatts -eq 21) 'thermal calculation remains 21 W'
  Check ($reference['POST /api/cabinets/assemble-side'].totalWidth -eq 1800 -and $reference['POST /api/cabinets/assemble-side'].totalDepth -eq 600) 'side assembly calculation compatible'
  Check ($reference['POST /api/cabinets/assemble-front-back'].totalWidth -eq 800 -and $reference['POST /api/cabinets/assemble-front-back'].totalDepth -eq 1000) 'front/back assembly calculation compatible'

  foreach ($route in ($routes | Where-Object Method -eq 'POST')) {
    Check ((Request POST $route.Path '{bad json' $admin -Raw).Status -eq 400) "Staff malformed JSON remains 400: $($route.Path)"
  }
  foreach ($path in @('/api/projects','/api/catalog','/api/rates')) {
    Check ((Request GET $path).Status -eq 401) "existing protected route anonymous 401: $path"
    Check ((Request GET $path $null $noStaff).Status -eq 403) "existing protected route no-role 403: $path"
    foreach ($role in @('admin','manager','engineer')) { Check ((Request GET $path $null $tokens[$role]).Status -eq 200) "existing protected route $role 200: $path" }
  }

  $swagger=Request GET '/swagger/v1/swagger.json'
  Check ($swagger.Status -eq 200) 'OpenAPI document public when explicitly enabled'
  Check ($swagger.Json.components.securitySchemes.Bearer.type -eq 'http' -and $swagger.Json.components.securitySchemes.Bearer.scheme -eq 'bearer') 'OpenAPI Bearer HTTP scheme metadata'
  Check (@($swagger.Json.security).Count -gt 0 -and $swagger.Json.security[0].PSObject.Properties.Name -contains 'Bearer') 'OpenAPI global Bearer requirement metadata'
  foreach ($route in $routes) {
    $pathNode=$swagger.Json.paths.PSObject.Properties[$route.Path].Value
    Check ($null -ne $pathNode -and $null -ne $pathNode.PSObject.Properties[$route.Method.ToLower()].Value) "OpenAPI operation published: $($route.Method) $($route.Path)"
  }
  "SEC-005 COMPLETE: $checks passing checks, 0 confirmed defects"
}
finally {
  if ($apiProcess -and -not $apiProcess.HasExited) { Stop-Process -Id $apiProcess.Id -Force; Wait-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue }
  if (Test-Path (Join-Path $data 'postmaster.pid')) { & "$pgBin\pg_ctl.exe" stop -D $data -m fast -W; for ($i=0; $i-lt 50; $i++) { & "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort -U postgres *> $null; if ($LASTEXITCODE -ne 0) { break }; Start-Sleep -Milliseconds 100 } }
  Remove-Item Env:ConnectionStrings__Tkp,Env:Jwt__Key,Env:Jwt__Issuer,Env:Jwt__Audience,Env:Jwt__ExpireMinutes,Env:Cors__AllowedOrigins__0,Env:AllowedHosts,Env:Admin__Enabled,Env:Admin__Email,Env:Admin__Password,Env:Swagger__Enabled,Env:ASPNETCORE_URLS,Env:ASPNETCORE_ENVIRONMENT -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 200; if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
