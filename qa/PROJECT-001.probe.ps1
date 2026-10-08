$ErrorActionPreference = 'Stop'

$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('qa_project_' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'pgdata'
$pgLog = Join-Path $root 'postgres.log'
$apiOut = Join-Path $root 'api.out.log'
$apiErr = Join-Path $root 'api.err.log'
$pgPort = 55531
$apiPort = 55231
$db = 'qa_project'
$base = "http://127.0.0.1:$apiPort"
$adminEmail = 'admin@project.qa.test'
$adminPassword = 'Qa1!' + [Guid]::NewGuid().ToString('N')
$jwtKey = 'qa-project-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$api = $null
$pg = $null
$checks = 0

function Check([bool]$ok, [string]$name) {
    if (-not $ok) { throw "FAIL: $name" }
    $script:checks++
    "PASS: $name"
}

function Request([string]$method, [string]$path, $body = $null, [string]$token = '') {
    $headers = @{}
    if ($token) { $headers.Authorization = "Bearer $token" }
    $args = @{ Uri = $base + $path; Method = $method; Headers = $headers; SkipHttpErrorCheck = $true; TimeoutSec = 10 }
    if ($null -ne $body) { $args.ContentType = 'application/json'; $args.Body = ($body | ConvertTo-Json -Depth 20 -Compress) }
    $r = Invoke-WebRequest @args
    $json = if ($r.Content) { $r.Content | ConvertFrom-Json } else { $null }
    [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Text = $r.Content }
}

try {
    New-Item -ItemType Directory -Path $root | Out-Null
    $init = Start-Process "$pgBin\initdb.exe" -ArgumentList @('-D', $data, '-U', 'postgres', '-A', 'trust', '-E', 'UTF8', '--no-locale') -RedirectStandardOutput (Join-Path $root 'init.out.log') -RedirectStandardError (Join-Path $root 'init.err.log') -PassThru -Wait -WindowStyle Hidden
    Check ($init.ExitCode -eq 0) 'isolated cluster initialized'
    $startCommand = '"' + "$pgBin\pg_ctl.exe" + '" start -D "' + $data + '" -o "-p ' + $pgPort + ' -h 127.0.0.1" -l "' + $pgLog + '" -w'
    & runas.exe /trustlevel:0x20000 $startCommand | Out-Null
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
    $env:Admin__FullName = 'QA Admin'
    $env:ASPNETCORE_URLS = $base
    $env:ASPNETCORE_ENVIRONMENT = 'Production'
    $dll = Join-Path $PSScriptRoot '..\backend\TkpApi\bin\Release\net8.0\TkpApi.dll'
    $api = Start-Process dotnet -ArgumentList @($dll) -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru -WindowStyle Hidden
    for ($i=0; $i -lt 100; $i++) { try { $h = Invoke-WebRequest "$base/api/health" -TimeoutSec 2; if ($h.StatusCode -eq 200) { break } } catch {}; Start-Sleep -Milliseconds 100 }
    Check ($h.StatusCode -eq 200) 'API started'

    $login = Request POST '/api/auth/login' @{ email=$adminEmail; password=$adminPassword }
    Check ($login.Status -eq 200 -and $login.Json.token) 'admin login'
    $admin = $login.Json.token
    $reg = Request POST '/api/auth/register' @{ email='engineer@project.qa.test'; password='Engineer1'; fullName='QA Engineer'; role='engineer' } $admin
    Check ($reg.Status -eq 200) 'engineer created'
    $engLogin = Request POST '/api/auth/login' @{ email='engineer@project.qa.test'; password='Engineer1' }
    Check ($engLogin.Status -eq 200 -and $engLogin.Json.token) 'engineer login'
    $engineer = $engLogin.Json.token

    $projectId = 'qa-project-001'
    $cabinetId = 'qa-cabinet-001'
    $project = @{ id=$projectId; number=('QA-' + [Guid]::NewGuid().ToString('N')); title='Segments lifecycle'; client='QA'; contact=''; direction='nku'; status='draft'; cabinets=@(@{ id=$cabinetId; kind='nku'; name='Cabinet'; hours=0; designHours=0; softwareHours=0; items=@(); segments=@(@{id='qa-seg-input';kind='input';name='Input';partitions=1},@{id='qa-seg-bus';kind='busbar';name='Bus';partitions=0}); form='2b' }) }
    $anon = Request POST '/api/projects' $project
    Check ($anon.Status -eq 401) 'anonymous project POST 401'
    $create = Request POST '/api/projects' $project $engineer
    Check ($create.Status -eq 201) 'engineer project POST 201'

    $get = Request GET "/api/projects/$projectId" $null $engineer
    Check ($get.Status -eq 200) 'GET project 200'
    Check ($get.Json.cabinets.Count -eq 1 -and $get.Json.cabinets[0].segments.Count -eq 2) 'GET includes two segments'
    $inputSegment = @($get.Json.cabinets[0].segments | Where-Object id -eq 'qa-seg-input')[0]
    $busSegment = @($get.Json.cabinets[0].segments | Where-Object id -eq 'qa-seg-bus')[0]
    Check ($inputSegment.kind -eq 'input' -and $busSegment.partitions -eq 0) 'segment fields preserved including zero'
    $list = Request GET '/api/projects' $null $engineer
    $listed = @($list.Json | Where-Object id -eq $projectId)[0]
    Check ($list.Status -eq 200 -and $listed.cabinets[0].segments.Count -eq 2) 'list includes cabinet segments'

    $project.cabinets[0].segments = @(@{id='qa-seg-control';kind='control';name='Control';partitions=3})
    $put1 = Request PUT "/api/projects/$projectId" $project $engineer
    Check ($put1.Status -eq 200) 'PUT changes segments 200'
    $put2 = Request PUT "/api/projects/$projectId" $project $engineer
    Check ($put2.Status -eq 200) 'repeated PUT 200'
    $afterRepeat = Request GET "/api/projects/$projectId" $null $engineer
    Check ($afterRepeat.Json.cabinets[0].segments.Count -eq 1 -and $afterRepeat.Json.cabinets[0].segments[0].id -eq 'qa-seg-control') 'repeated PUT is idempotent'

    $project.cabinets[0].segments = @()
    $emptyPut = Request PUT "/api/projects/$projectId" $project $engineer
    Check ($emptyPut.Status -eq 200) 'PUT empty segments 200'
    $afterEmpty = Request GET "/api/projects/$projectId" $null $engineer
    Check (@($afterEmpty.Json.cabinets[0].segments).Count -eq 0) 'empty segments persisted'

    $project.cabinets[0].segments = $null
    $nullPut = Request PUT "/api/projects/$projectId" $project $engineer
    Check ($nullPut.Status -eq 200) 'PUT null segments 200'
    $afterNull = Request GET "/api/projects/$projectId" $null $engineer
    Check ($null -eq $afterNull.Json.cabinets[0].segments -or @($afterNull.Json.cabinets[0].segments).Count -eq 0) 'null segments read as null or empty'

    $anonGet = Request GET "/api/projects/$projectId"
    Check ($anonGet.Status -eq 401) 'anonymous GET 401'
    $engDelete = Request DELETE "/api/projects/$projectId" $null $engineer
    Check ($engDelete.Status -eq 403) 'engineer DELETE project 403'
    $adminDelete = Request DELETE "/api/projects/$projectId" $null $admin
    Check ($adminDelete.Status -eq 204) 'admin DELETE project 204'
    $gone = Request GET "/api/projects/$projectId" $null $admin
    Check ($gone.Status -eq 404) 'deleted project GET 404'
    $orphan = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT count(*) FROM cabinet_segments;'
    Check ($LASTEXITCODE -eq 0 -and [int]$orphan -eq 0) 'no orphan segment rows after project delete'
    "PROJECT-001 PASS: $checks checks"
}
finally {
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force }
    if (Test-Path (Join-Path $data 'postmaster.pid')) {
        $stopCommand = '"' + "$pgBin\pg_ctl.exe" + '" stop -D "' + $data + '" -m fast -w'
        & runas.exe /trustlevel:0x20000 $stopCommand | Out-Null
        for ($i=0; $i -lt 50; $i++) { & "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort -U postgres *> $null; if ($LASTEXITCODE -ne 0) { break }; Start-Sleep -Milliseconds 100 }
    }
    Remove-Item Env:ConnectionStrings__Tkp,Env:Jwt__Key,Env:Jwt__ExpireMinutes,Env:Cors__AllowedOrigins__0,Env:AllowedHosts,Env:Admin__Password -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 200
    if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
