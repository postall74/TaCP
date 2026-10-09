$ErrorActionPreference = 'Stop'

$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('qa_csv_' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'pgdata'
$pgLog = Join-Path $root 'postgres.log'
$apiOut = Join-Path $root 'api.out.log'
$apiErr = Join-Path $root 'api.err.log'
$pgPort = 55551
$apiPort = 55251
$db = 'qa_csv'
$base = "http://127.0.0.1:$apiPort"
$adminEmail = 'admin@csv.qa.test'
$adminPassword = 'Qa1!' + [Guid]::NewGuid().ToString('N')
$jwtKey = 'qa-csv-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$api = $null
$checks = 0

function Check([bool]$ok, [string]$name) {
    if (-not $ok) { throw "FAIL: $name" }
    $script:checks++
    "PASS: $name"
}

function RequestJson([string]$method, [string]$path, $body = $null, [string]$token = '') {
    $headers = @{}
    if ($token) { $headers.Authorization = "Bearer $token" }
    $args = @{ Uri = $base + $path; Method = $method; Headers = $headers; SkipHttpErrorCheck = $true; TimeoutSec = 10 }
    if ($null -ne $body) { $args.ContentType = 'application/json'; $args.Body = ($body | ConvertTo-Json -Depth 10 -Compress) }
    $r = Invoke-WebRequest @args
    $json = if ($r.Content) { $r.Content | ConvertFrom-Json } else { $null }
    [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Text = $r.Content }
}

function ImportCsv([string]$csv, [string]$token = '') {
    $headers = @{}
    if ($token) { $headers.Authorization = "Bearer $token" }
    $r = Invoke-WebRequest -Uri ($base + '/api/catalog/import') -Method POST -Headers $headers `
        -ContentType 'text/csv; charset=utf-8' -Body $csv -SkipHttpErrorCheck -TimeoutSec 10
    $json = if ($r.Content) { $r.Content | ConvertFrom-Json } else { $null }
    [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Text = $r.Content }
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
    $env:Admin__FullName = 'QA Admin'
    $env:ASPNETCORE_URLS = $base
    $env:ASPNETCORE_ENVIRONMENT = 'Production'
    $dll = Join-Path $PSScriptRoot '..\backend\TkpApi\bin\Release\net8.0\TkpApi.dll'
    $api = Start-Process dotnet -ArgumentList @($dll) -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru -WindowStyle Hidden
    for ($i=0; $i -lt 100; $i++) { try { $health = Invoke-WebRequest "$base/api/health" -TimeoutSec 2; if ($health.StatusCode -eq 200) { break } } catch {}; Start-Sleep -Milliseconds 100 }
    Check ($health.StatusCode -eq 200) 'API started'

    $login = RequestJson POST '/api/auth/login' @{ email=$adminEmail; password=$adminPassword }
    Check ($login.Status -eq 200 -and $login.Json.token) 'admin login'
    $admin = $login.Json.token
    foreach ($role in @('manager', 'engineer')) {
        $email = "$role@csv.qa.test"
        $reg = RequestJson POST '/api/auth/register' @{ email=$email; password='RoleTest1'; fullName="QA $role"; role=$role } $admin
        Check ($reg.Status -eq 200) "$role created"
        $roleLogin = RequestJson POST '/api/auth/login' @{ email=$email; password='RoleTest1' }
        Check ($roleLogin.Status -eq 200 -and $roleLogin.Json.token) "$role login"
        Set-Variable -Name $role -Value $roleLogin.Json.token
    }

    $core = @"
SKU;name;brand;category;direction;unit;purchase;attrs
SKU-001;Позиция SKU;QA;Категория;нку;шт;10.25;one
ABC-SKU-42;Позиция ABC;QA;Категория;асу;шт;20.50;two
"@
    $anon = ImportCsv $core
    Check ($anon.Status -eq 401) 'anonymous import 401'
    $denied = ImportCsv $core $engineer
    Check ($denied.Status -eq 403) 'engineer import 403'
    $first = ImportCsv $core $admin
    Check ($first.Status -eq 200) 'admin import allowed'
    Check ($first.Json.added -eq 2 -and $first.Json.updated -eq 0 -and $first.Json.skipped -eq 0) 'EN exact header skipped; SKU substrings added 2/0/0'

    $repeat = @"
АрТиКуЛ;наименование;бренд;категория;направление;ед;закупка;характеристики
sku-001;Позиция SKU обновлена;QA2;Категория 2;обогрев;компл;11.75;updated-one
abc-sku-42;Позиция ABC обновлена;QA2;Категория 2;нку;шт;21.75;updated-two
"@
    $second = ImportCsv $repeat $manager
    Check ($second.Status -eq 200) 'manager import allowed'
    Check ($second.Json.added -eq 0 -and $second.Json.updated -eq 2 -and $second.Json.skipped -eq 0) 'RU exact header skipped; case-insensitive update 0/2/0'

    $edge = @"
артикул;наименование;бренд;категория;направление;ед;закупка;характеристики
МОЙ-АРТИКУЛ-7;Кириллический артикул;QA;Категория;нку;шт;30.125;кириллица
битая;строка
"@
    $third = ImportCsv $edge $manager
    Check ($third.Status -eq 200) 'Cyrillic and malformed fixture accepted'
    Check ($third.Json.added -eq 1 -and $third.Json.updated -eq 0 -and $third.Json.skipped -eq 1) 'Cyrillic substring added and malformed skipped 1/0/1'

    $catalog = RequestJson GET '/api/catalog' $null $engineer
    Check ($catalog.Status -eq 200) 'engineer can read catalog'
    $sku1 = @($catalog.Json | Where-Object { $_.sku -ieq 'SKU-001' })[0]
    $sku2 = @($catalog.Json | Where-Object { $_.sku -ieq 'ABC-SKU-42' })[0]
    $cyr = @($catalog.Json | Where-Object { $_.sku -eq 'МОЙ-АРТИКУЛ-7' })[0]
    Check ($sku1.name -eq 'Позиция SKU обновлена' -and [decimal]$sku1.purchase -eq [decimal]11.75) 'SKU-001 update-by-SKU persisted'
    Check ($sku2.name -eq 'Позиция ABC обновлена' -and [decimal]$sku2.purchase -eq [decimal]21.75) 'ABC-SKU-42 update-by-SKU persisted'
    Check ($cyr.name -eq 'Кириллический артикул' -and [decimal]$cyr.purchase -eq [decimal]30.13) 'Cyrillic SKU persisted with catalog precision'
    "CSV-001 PASS: $checks checks"
}
finally {
    if ($api -and -not $api.HasExited) { Stop-Process -Id $api.Id -Force }
    if (Test-Path (Join-Path $data 'postmaster.pid')) {
        & "$pgBin\pg_ctl.exe" stop -D $data -m fast -W
        for ($i=0; $i -lt 50; $i++) { & "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort -U postgres *> $null; if ($LASTEXITCODE -ne 0) { break }; Start-Sleep -Milliseconds 100 }
    }
    Remove-Item Env:ConnectionStrings__Tkp,Env:Jwt__Key,Env:Jwt__Issuer,Env:Jwt__Audience,Env:Jwt__ExpireMinutes,Env:Cors__AllowedOrigins__0,Env:AllowedHosts,Env:Admin__Enabled,Env:Admin__Email,Env:Admin__Password,Env:Admin__FullName,Env:ASPNETCORE_URLS,Env:ASPNETCORE_ENVIRONMENT -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 200
    if (Test-Path $root) { Remove-Item -LiteralPath $root -Recurse -Force }
}
