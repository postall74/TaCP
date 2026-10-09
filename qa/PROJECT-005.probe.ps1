$ErrorActionPreference = 'Stop'

$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('qa_project005_' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'pgdata'
$pgLog = Join-Path $root 'postgres.log'
$apiOut = Join-Path $root 'api.out.log'
$apiErr = Join-Path $root 'api.err.log'
$pgPort = 55591
$apiPort = 55291
$db = 'qa_project005'
$base = "http://127.0.0.1:$apiPort"
$adminEmail = 'admin@project005.qa.test'
$adminPassword = 'Qa1!' + [Guid]::NewGuid().ToString('N')
$jwtKey = 'qa-project005-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
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
    if ($null -ne $body) {
        $args.ContentType = 'application/json'
        $args.Body = if ($path.EndsWith('/cabinets')) {
            ConvertTo-Json -InputObject @($body) -Depth 20 -Compress
        } else {
            $body | ConvertTo-Json -Depth 20 -Compress
        }
    }
    $r = Invoke-WebRequest @args
    $text = if ($r.Content -is [byte[]]) { [Text.Encoding]::UTF8.GetString($r.Content) } else { [string]$r.Content }
    $json = if ($text -and ($text.TrimStart().StartsWith('{') -or $text.TrimStart().StartsWith('['))) { $text | ConvertFrom-Json } else { $null }
    [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Text = $text }
}

function Cabinet([string]$id, [string]$label, [string]$itemId = '', [string]$segmentId = '') {
    $items = if ($itemId) { @(@{ id=$itemId; eqId=$null; sku="$label-SKU"; name="$label item"; brand='QA'; unit='шт'; qty=1.25; purchase=12.34 }) } else { @() }
    $segments = if ($segmentId) { @(@{ id=$segmentId; kind='custom'; name="$label segment"; partitions=1 }) } else { @() }
    @{ id=$id; kind='nku'; name="$label cabinet"; hours=1; designHours=2; softwareHours=3; note=$null; items=@($items); segments=@($segments); form='1' }
}

function ConcurrentBatches([string]$project1, $body1, [string]$project2, $body2, [string]$token) {
    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(20)
    $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $token)
    $m1 = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, "$base/api/projects/$project1/cabinets")
    $m2 = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::Post, "$base/api/projects/$project2/cabinets")
    $m1.Content = [System.Net.Http.StringContent]::new((ConvertTo-Json -InputObject @($body1) -Depth 20 -Compress), [Text.Encoding]::UTF8, 'application/json')
    $m2.Content = [System.Net.Http.StringContent]::new((ConvertTo-Json -InputObject @($body2) -Depth 20 -Compress), [Text.Encoding]::UTF8, 'application/json')
    try {
        $t1 = $client.SendAsync($m1); $t2 = $client.SendAsync($m2)
        [Threading.Tasks.Task]::WaitAll(@($t1, $t2))
        @([int]$t1.Result.StatusCode, [int]$t2.Result.StatusCode)
    }
    finally { $m1.Dispose(); $m2.Dispose(); $client.Dispose() }
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
    $env:Jwt__Issuer = 'tkp-api'; $env:Jwt__Audience = 'tkp-web'; $env:Jwt__ExpireMinutes = '60'
    $env:Cors__AllowedOrigins__0 = 'http://127.0.0.1:3000'; $env:AllowedHosts = 'localhost;127.0.0.1'
    $env:Admin__Enabled = 'true'; $env:Admin__Email = $adminEmail; $env:Admin__Password = $adminPassword
    $env:ASPNETCORE_URLS = $base; $env:ASPNETCORE_ENVIRONMENT = 'Production'
    $dll = Join-Path $PSScriptRoot '..\backend\TkpApi\bin\Release\net8.0\TkpApi.dll'
    $api = Start-Process dotnet -ArgumentList @($dll) -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru -WindowStyle Hidden
    for ($i=0; $i -lt 100; $i++) { try { $health = Invoke-WebRequest "$base/api/health" -TimeoutSec 2; if ($health.StatusCode -eq 200) { break } } catch {}; Start-Sleep -Milliseconds 100 }
    Check ($health.StatusCode -eq 200) 'API started'

    $login = Request POST '/api/auth/login' @{ email=$adminEmail; password=$adminPassword }
    Check ($login.Status -eq 200 -and $login.Json.token) 'admin login'; $admin = $login.Json.token
    foreach ($role in @('manager', 'engineer')) {
        $email = "$role@project005.qa.test"
        Check ((Request POST '/api/auth/register' @{ email=$email; password='RoleTest1'; fullName="QA $role"; role=$role } $admin).Status -eq 200) "$role created"
        $roleLogin = Request POST '/api/auth/login' @{ email=$email; password='RoleTest1' }
        Check ($roleLogin.Status -eq 200 -and $roleLogin.Json.token) "$role login"
        Set-Variable -Name $role -Value $roleLogin.Json.token
    }
    foreach ($id in @('batch-p1','batch-p2','batch-p3')) {
        $p = @{ id=$id; number="NUM-$id"; title=$id; client='QA'; contact=''; direction='nku'; status='draft'; markup=15; cabinets=@() }
        Check ((Request POST '/api/projects' $p $admin).Status -eq 201) "project $id created"
    }

    $valid = @((Cabinet 'valid-a' 'valid-a' 'item-valid-a'), (Cabinet 'valid-b' 'valid-b' 'item-valid-b'))
    $validResult = Request POST '/api/projects/batch-p1/cabinets' $valid $engineer
    Check ($validResult.Status -eq 200 -and @($validResult.Json).Count -eq 2) 'engineer valid multi-batch with items 200'
    $validRows = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT (SELECT count(*) FROM project_cabinets WHERE "Id" IN (''valid-a'',''valid-b'')) || '':'' || (SELECT count(*) FROM project_items WHERE "Id" IN (''item-valid-a'',''item-valid-b''));'
    Check ($validRows.Trim() -eq '2:2') 'valid multi-batch persists two cabinets and two items'

    $emptyRaw = Invoke-WebRequest -Uri ($base + '/api/projects/batch-p1/cabinets') -Method POST `
        -Headers @{ Authorization = "Bearer $manager" } -ContentType 'application/json' -Body '[]' `
        -SkipHttpErrorCheck -TimeoutSec 15
    $emptyJson = ([string]$emptyRaw.Content) | ConvertFrom-Json
    Check ([int]$emptyRaw.StatusCode -eq 200 -and @($emptyJson).Count -eq 2) 'empty batch remains 200 without changes'
    $case = Request POST '/api/projects/batch-p1/cabinets' @((Cabinet 'VALID-A' 'case-sensitive')) $admin
    Check ($case.Status -eq 200) 'case-variant cabinet ID remains valid 200'

    $beforeP2 = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT "UpdatedAt"::text FROM projects WHERE "Id"=''batch-p2'';'
    $existing = Request POST '/api/projects/batch-p2/cabinets' @((Cabinet 'new-before-existing' 'new'), (Cabinet 'valid-a' 'duplicate')) $manager
    Check ($existing.Status -eq 409 -and $existing.Json.detail -eq 'Шкаф с таким идентификатором уже существует') 'existing cabinet ID returns 409'
    $afterP2 = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT "UpdatedAt"::text FROM projects WHERE "Id"=''batch-p2'';'
    $existingRejected = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT count(*) FROM project_cabinets WHERE "Id"=''new-before-existing'';'
    Check ($beforeP2.Trim() -eq $afterP2.Trim() -and [int]$existingRejected.Trim() -eq 0) 'existing-ID rejection changes neither project nor batch'

    $intra = Request POST '/api/projects/batch-p2/cabinets' @((Cabinet 'intra-dup' 'first' 'item-intra-first'), (Cabinet 'intra-dup' 'second' 'item-intra-second')) $engineer
    Check ($intra.Status -eq 409 -and $intra.Json.detail -eq 'Шкаф с таким идентификатором уже существует') 'intra-batch duplicate returns 409'
    $intraRows = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT (SELECT count(*) FROM project_cabinets WHERE "Id"=''intra-dup'') + (SELECT count(*) FROM project_items WHERE "Id" LIKE ''item-intra-%'');'
    Check ([int]$intraRows.Trim() -eq 0) 'intra-batch rejection persists no cabinet or item'

    Check ((Request POST '/api/projects/missing-project/cabinets' @((Cabinet 'missing-project-cab' 'missing')) $engineer).Status -eq 404) 'missing project returns 404'
    Check ((Request POST '/api/projects/batch-p2/cabinets' @((Cabinet 'anon-cab' 'anonymous'))).Status -eq 401) 'anonymous batch returns 401'
    Check ((Request POST '/api/projects/batch-p2/cabinets' @((Cabinet 'manager-valid' 'manager')) $manager).Status -eq 200) 'manager Staff valid batch 200'
    Check ((Request POST '/api/projects/batch-p2/cabinets' @((Cabinet 'admin-valid' 'admin')) $admin).Status -eq 200) 'admin Staff valid batch 200'

    $raceBody1 = @((Cabinet 'race-same-id' 'race-one'))
    $raceBody2 = @((Cabinet 'race-same-id' 'race-two'))
    $raceStatuses = ConcurrentBatches 'batch-p2' $raceBody1 'batch-p3' $raceBody2 $admin
    Check (@($raceStatuses | Where-Object { $_ -eq 200 }).Count -eq 1 -and @($raceStatuses | Where-Object { $_ -eq 409 }).Count -eq 1) 'concurrent same cabinet ID gives one 200 and one 409'
    $raceCount = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT count(*) FROM project_cabinets WHERE "Id"=''race-same-id'';'
    Check ([int]$raceCount.Trim() -eq 1) 'concurrent same ID stores one cabinet'

    $nestedItem = Request POST '/api/projects/batch-p2/cabinets' @((Cabinet 'nested-item-error-cab' 'nested-item-error' 'item-valid-a')) $engineer
    Check ($nestedItem.Status -eq 500) 'nested item primary-key conflict remains 500'
    $nestedCabCount = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT count(*) FROM project_cabinets WHERE "Id"=''nested-item-error-cab'';'
    Check ([int]$nestedCabCount.Trim() -eq 0) 'nested item PK error rolls back cabinet'

    Check ((Request POST '/api/projects/batch-p2/cabinets' @((Cabinet 'segment-source-cab' 'segment-source' '' 'shared-segment')) $admin).Status -eq 200) 'segment error fixture created'
    $segmentError = Request POST '/api/projects/batch-p3/cabinets' @((Cabinet 'segment-error-cab' 'segment-error' '' 'shared-segment')) $manager
    Check ($segmentError.Status -eq 500) 'unrelated nested segment DB conflict remains 500'
    $segmentCabCount = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT count(*) FROM project_cabinets WHERE "Id"=''segment-error-cab'';'
    Check ([int]$segmentCabCount.Trim() -eq 0) 'unrelated DB error rolls back cabinet'

    "PROJECT-005 PASS: $checks checks"
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
