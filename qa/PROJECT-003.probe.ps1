$ErrorActionPreference = 'Stop'

$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('qa_project003_' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'pgdata'
$pgLog = Join-Path $root 'postgres.log'
$apiOut = Join-Path $root 'api.out.log'
$apiErr = Join-Path $root 'api.err.log'
$pgPort = 55571
$apiPort = 55271
$db = 'qa_project003'
$base = "http://127.0.0.1:$apiPort"
$adminEmail = 'admin@project003.qa.test'
$adminPassword = 'Qa1!' + [Guid]::NewGuid().ToString('N')
$jwtKey = 'qa-project003-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$api = $null
$checks = 0

function Check([bool]$ok, [string]$name) {
    if (-not $ok) { throw "FAIL: $name" }
    $script:checks++
    "PASS: $name"
}

function Request([string]$method, [string]$path, $body = $null, [string]$token = '') {
    $headers = @{}
    if ($token) { $headers.Authorization = "Bearer $token" }
    $args = @{ Uri = $base + $path; Method = $method; Headers = $headers; SkipHttpErrorCheck = $true; TimeoutSec = 15 }
    if ($null -ne $body) { $args.ContentType = 'application/json'; $args.Body = ($body | ConvertTo-Json -Depth 20 -Compress) }
    $r = Invoke-WebRequest @args
    $text = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
    $json = if ($text -and $text.TrimStart().StartsWith('{')) { $text | ConvertFrom-Json } else { $null }
    [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Text = $text }
}

function RawJson([string]$json, [string]$token) {
    $headers = @{ Authorization = "Bearer $token" }
    $r = Invoke-WebRequest -Uri ($base + '/api/projects') -Method POST -Headers $headers `
        -ContentType 'application/json' -Body $json -SkipHttpErrorCheck -TimeoutSec 15
    [pscustomobject]@{ Status = [int]$r.StatusCode; Text = $r.Content }
}

function New-Project([string]$id, [string]$status, [string]$label) {
    @{
        id=$id; number="NUM-$id"; title="$label title"; client='QA'; contact='QA';
        direction='nku'; status=$status; markup=15; workMarkup=25; discount=0; vatRate=20;
        showWorkLines=$true; notes="$label notes";
        cabinets=@(@{
            id="cab-$id"; kind='nku'; name="$label cabinet"; hours=1; designHours=2;
            softwareHours=3; note=$null; segments=@(); form='1';
            items=@(@{ id="item-$id"; eqId=$null; sku="$label-SKU"; name="$label item"; brand='QA'; unit='шт'; qty=1; purchase=10 })
        })
    }
}

try {
    New-Item -ItemType Directory -Path $root | Out-Null
    $init = Start-Process "$pgBin\initdb.exe" -ArgumentList @('-D', $data, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale') -RedirectStandardOutput (Join-Path $root 'init.out.log') -RedirectStandardError (Join-Path $root 'init.err.log') -PassThru -Wait -WindowStyle Hidden
    Check ($init.ExitCode -eq 0) 'isolated cluster initialized'
    & "$pgBin\pg_ctl.exe" start -D $data -o "-p $pgPort -h 127.0.0.1" -l $pgLog -W
    Check ($LASTEXITCODE -eq 0) 'isolated PostgreSQL launch requested'
    for ($i=0; $i -lt 50; $i++) { & "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort -U postgres *> $null; if ($LASTEXITCODE -eq 0) { break }; Start-Sleep -Milliseconds 100 }
    Check ($LASTEXITCODE -eq 0) 'isolated PostgreSQL ready'
    & "$pgBin\createdb.exe" -h 127.0.0.1 -p $pgPort -U postgres $db
    Check ($LASTEXITCODE -eq 0) 'isolated database created'

    $env:ConnectionStrings__Tkp = "Host=127.0.0.1;Port=$pgPort;Database=$db;Username=postgres"
    $env:Jwt__Key = $jwtKey
    $env:Jwt__Issuer = 'tkp-api'
    $env:Jwt__Audience = 'tkp-web'
    $env:Jwt__ExpireMinutes = '60'
    $env:Cors__AllowedOrigins__0 = 'http://127.0.0.1:3000'
    $env:AllowedHosts = 'localhost;127.0.0.1'
    $env:Admin__Enabled = 'true'
    $env:Admin__Email = $adminEmail
    $env:Admin__Password = $adminPassword
    $env:ASPNETCORE_URLS = $base
    $env:ASPNETCORE_ENVIRONMENT = 'Production'
    $dll = Join-Path $PSScriptRoot '..\backend\TkpApi\bin\Release\net8.0\TkpApi.dll'
    $api = Start-Process dotnet -ArgumentList @($dll) -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru -WindowStyle Hidden
    for ($i=0; $i -lt 100; $i++) { try { $health = Invoke-WebRequest "$base/api/health" -TimeoutSec 2; if ($health.StatusCode -eq 200) { break } } catch {}; Start-Sleep -Milliseconds 100 }
    Check ($health.StatusCode -eq 200) 'API started'

    $login = Request POST '/api/auth/login' @{ email=$adminEmail; password=$adminPassword }
    Check ($login.Status -eq 200 -and $login.Json.token) 'admin login'
    $admin = $login.Json.token
    foreach ($role in @('manager', 'engineer')) {
        $email = "$role@project003.qa.test"
        $reg = Request POST '/api/auth/register' @{ email=$email; password='RoleTest1'; fullName="QA $role"; role=$role } $admin
        Check ($reg.Status -eq 200) "$role created"
        $roleLogin = Request POST '/api/auth/login' @{ email=$email; password='RoleTest1' }
        Check ($roleLogin.Status -eq 200 -and $roleLogin.Json.token) "$role login"
        Set-Variable -Name $role -Value $roleLogin.Json.token
    }

    $anonymous = Request POST '/api/projects' (New-Project 'anonymous-won' 'won' 'anonymous')
    Check ($anonymous.Status -eq 401) 'anonymous create 401'

    $denyDetail = 'Решение «выиграно/проиграно» принимает менеджер или администратор (вы — Инженер)'
    foreach ($status in @('won', 'lost')) {
        $id = "engineer-denied-$status"
        $denied = Request POST '/api/projects' (New-Project $id $status "denied-$status") $engineer
        Check ($denied.Status -eq 403 -and $denied.Json.detail -eq $denyDetail) "engineer $status 403 with exact detail"
    }
    $deniedRows = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc @'
SELECT
 (SELECT count(*) FROM projects WHERE "Id" IN ('engineer-denied-won','engineer-denied-lost')) +
 (SELECT count(*) FROM project_cabinets WHERE "Id" IN ('cab-engineer-denied-won','cab-engineer-denied-lost')) +
 (SELECT count(*) FROM project_items WHERE "Id" IN ('item-engineer-denied-won','item-engineer-denied-lost'));
'@
    Check ($LASTEXITCODE -eq 0 -and [int]$deniedRows.Trim() -eq 0) 'engineer denied creates zero project/cabinet/item rows'

    foreach ($status in @('draft', 'calc', 'sent')) {
        $id = "engineer-$status"
        $created = Request POST '/api/projects' (New-Project $id $status $id) $engineer
        Check ($created.Status -eq 201 -and $created.Json.status -eq $status) "engineer $status 201"
    }
    foreach ($role in @('manager', 'admin')) {
        $token = Get-Variable -Name $role -ValueOnly
        foreach ($status in @('draft', 'calc', 'sent', 'won', 'lost')) {
            $id = "$role-$status"
            $created = Request POST '/api/projects' (New-Project $id $status $id) $token
            Check ($created.Status -eq 201 -and $created.Json.status -eq $status) "$role $status 201"
        }
    }

    $malformed = RawJson '{' $engineer
    Check ($malformed.Status -eq 400) 'malformed JSON remains 400'

    $original = New-Project 'db-error-project' 'draft' 'db-original'
    Check ((Request POST '/api/projects' $original $engineer).Status -eq 201) 'DB error fixture created'
    $duplicateId = New-Project 'db-error-project' 'draft' 'db-conflict'
    $duplicateId.number = 'UNIQUE-DB-ERROR-NUMBER'
    $dbError = Request POST '/api/projects' $duplicateId $admin
    Check ($dbError.Status -eq 500) 'unrelated primary-key 23505 remains 500'
    $afterError = Request GET '/api/projects/db-error-project' $null $engineer
    Check ($afterError.Status -eq 200 -and $afterError.Json.title -eq 'db-original title' -and $afterError.Json.cabinets[0].id -eq 'cab-db-error-project') 'unrelated DB error leaves original graph unchanged'

    "PROJECT-003 PASS: $checks checks"
}
finally {
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force }
    if (Test-Path (Join-Path $data 'postmaster.pid')) {
        & "$pgBin\pg_ctl.exe" stop -D $data -m fast -W
        for ($i=0; $i -lt 50; $i++) { & "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort -U postgres *> $null; if ($LASTEXITCODE -ne 0) { break }; Start-Sleep -Milliseconds 100 }
    }
    Remove-Item Env:ConnectionStrings__Tkp,Env:Jwt__Key,Env:Jwt__Issuer,Env:Jwt__Audience,Env:Jwt__ExpireMinutes,Env:Cors__AllowedOrigins__0,Env:AllowedHosts,Env:Admin__Enabled,Env:Admin__Email,Env:Admin__Password,Env:ASPNETCORE_URLS,Env:ASPNETCORE_ENVIRONMENT -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 200
    if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
