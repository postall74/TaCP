$ErrorActionPreference = 'Stop'

$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('qa_version_' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'pgdata'
$pgLog = Join-Path $root 'postgres.log'
$apiOut = Join-Path $root 'api.out.log'
$apiErr = Join-Path $root 'api.err.log'
$pgPort = 55541
$apiPort = 55241
$db = 'qa_version'
$base = "http://127.0.0.1:$apiPort"
$adminEmail = 'admin@version.qa.test'
$adminPassword = 'Qa1!' + [Guid]::NewGuid().ToString('N')
$jwtKey = 'qa-version-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
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

    $anonList = Request GET '/api/projects'
    Check ($anonList.Status -eq 401) 'anonymous project list 401'
    $login = Request POST '/api/auth/login' @{ email=$adminEmail; password=$adminPassword }
    Check ($login.Status -eq 200 -and $login.Json.token) 'admin login'
    $admin = $login.Json.token
    $reg = Request POST '/api/auth/register' @{ email='engineer@version.qa.test'; password='Engineer1'; fullName='QA Engineer'; role='engineer' } $admin
    Check ($reg.Status -eq 200) 'engineer created'
    $engLogin = Request POST '/api/auth/login' @{ email='engineer@version.qa.test'; password='Engineer1' }
    Check ($engLogin.Status -eq 200 -and $engLogin.Json.token) 'engineer login'
    $engineer = $engLogin.Json.token

    $projectId = 'qa-version-project'
    $item = @{
        id='item-new'; eqId=$null; sku='QA-NEW'; name='New item'; brand='QA';
        unit='шт'; qty=0.125; purchase=1234.5678
    }
    $cabinet = @{
        id='cab-new'; kind='nku'; name='New cabinet'; hours=0;
        designHours=1.25; softwareHours=2.5; note=$null; items=@($item)
    }
    $project = @{
        id=$projectId; number='QA-VERSION'; title='Version snapshot'; client='QA'; contact='';
        direction='nku'; status='draft'; markup=15; cabinets=@($cabinet)
    }
    $create = Request POST '/api/projects' $project $engineer
    Check ($create.Status -eq 201) 'engineer project POST 201'
    $anonVersion = Request POST "/api/projects/$projectId/versions?label=Anonymous"
    Check ($anonVersion.Status -eq 401) 'anonymous version POST 401'
    $newVersion = Request POST "/api/projects/$projectId/versions?label=New" $null $engineer
    Check ($newVersion.Status -eq 200) 'engineer version POST 200'
    $new = @($newVersion.Json)[0]
    Check ($new.snapshot.cabinets[0].id -eq 'cab-new' -and $new.snapshot.cabinets[0].name -eq 'New cabinet') 'new snapshot cabinet camelCase id/name'
    Check ($new.snapshot.cabinets[0].items[0].id -eq 'item-new' -and $new.snapshot.cabinets[0].items[0].qty -eq 0.125) 'new snapshot item camelCase id/items/qty'
    Check ([decimal]$new.snapshot.cabinets[0].items[0].purchase -eq [decimal]1234.57) 'new snapshot preserves database purchase precision'
    Check ($null -eq $new.snapshot.cabinets[0].note -and $null -eq $new.snapshot.cabinets[0].items[0].eqId) 'new snapshot null fields'
    $newCabinetKeys = @($new.snapshot.cabinets[0].PSObject.Properties.Name)
    $newItemKeys = @($new.snapshot.cabinets[0].items[0].PSObject.Properties.Name)
    Check ('Id' -cnotin $newCabinetKeys -and 'Items' -cnotin $newCabinetKeys -and 'Id' -cnotin $newItemKeys -and 'Purchase' -cnotin $newItemKeys) 'new snapshot has no known PascalCase fields'

    $legacy = '{"cabinets":[{"Id":"cab-legacy","Kind":"nku","Name":"Legacy cabinet","Hours":0,"DesignHours":1.125,"SoftwareHours":2.25,"Note":null,"Items":[{"Id":"item-legacy","EqId":null,"Sku":"QA-LEGACY","Name":"Legacy item","Brand":"QA","Unit":"шт","Qty":0.375,"Purchase":9876.54321,"ItemExtension":{"KeepCase":true}}],"CabinetExtension":{"KeepCase":"yes"}}],"calc":{"eqBase":3703.70370375,"total":4259.2592593125},"RootExtension":{"KeepCase":"root"}}'
    $legacyB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($legacy))
    $insert = "INSERT INTO project_versions (`"Id`",`"ProjectId`",`"Ts`",`"Label`",`"Snapshot`") VALUES ('version-legacy','$projectId',CURRENT_TIMESTAMP,'Legacy',convert_from(decode('$legacyB64','base64'),'UTF8')::jsonb);"
    & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -v ON_ERROR_STOP=1 -c $insert | Out-Null
    Check ($LASTEXITCODE -eq 0) 'legacy PascalCase snapshot inserted'
    $before = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc "SELECT md5(`"Snapshot`"::text) FROM project_versions WHERE `"Id`"='version-legacy';"

    $detail = Request GET "/api/projects/$projectId" $null $engineer
    Check ($detail.Status -eq 200) 'project detail 200'
    $legacyResponse = @($detail.Json.versions | Where-Object id -eq 'version-legacy')[0]
    Check ($legacyResponse.snapshot.cabinets[0].id -eq 'cab-legacy' -and $legacyResponse.snapshot.cabinets[0].name -eq 'Legacy cabinet') 'legacy cabinet normalized'
    Check ($legacyResponse.snapshot.cabinets[0].items[0].id -eq 'item-legacy' -and $legacyResponse.snapshot.cabinets[0].items[0].qty -eq 0.375) 'legacy item normalized'
    Check ([decimal]$legacyResponse.snapshot.cabinets[0].items[0].purchase -eq [decimal]9876.54321) 'legacy purchase precision preserved'
    Check ($null -eq $legacyResponse.snapshot.cabinets[0].note -and $null -eq $legacyResponse.snapshot.cabinets[0].items[0].eqId) 'legacy null fields preserved'
    Check ($legacyResponse.snapshot.RootExtension.KeepCase -eq 'root' -and $legacyResponse.snapshot.cabinets[0].CabinetExtension.KeepCase -eq 'yes' -and $legacyResponse.snapshot.cabinets[0].items[0].ItemExtension.KeepCase) 'extension keys and values unchanged'
    $list = Request GET '/api/projects' $null $engineer
    $listedLegacy = @((@($list.Json | Where-Object id -eq $projectId)[0]).versions | Where-Object id -eq 'version-legacy')[0]
    Check ($list.Status -eq 200 -and $listedLegacy.snapshot.cabinets[0].items[0].name -eq 'Legacy item') 'project list normalizes legacy snapshot'
    $after = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc "SELECT md5(`"Snapshot`"::text) FROM project_versions WHERE `"Id`"='version-legacy';"
    Check ($LASTEXITCODE -eq 0 -and $before.Trim() -eq $after.Trim()) 'stored legacy JSON unchanged after list/detail reads'
    $missing = Request GET '/api/projects/missing-version-project' $null $engineer
    Check ($missing.Status -eq 404) 'missing project detail 404'
    $missingVersion = Request POST '/api/projects/missing-version-project/versions?label=Missing' $null $engineer
    Check ($missingVersion.Status -eq 404) 'missing project version POST 404'
    "VERSION-001 PASS: $checks checks"
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
