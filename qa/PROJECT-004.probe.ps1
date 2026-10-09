$ErrorActionPreference = 'Stop'

$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('qa_project004_' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'pgdata'
$pgLog = Join-Path $root 'postgres.log'
$apiOut = Join-Path $root 'api.out.log'
$apiErr = Join-Path $root 'api.err.log'
$pgPort = 55581
$apiPort = 55281
$db = 'qa_project004'
$base = "http://127.0.0.1:$apiPort"
$adminEmail = 'admin@project004.qa.test'
$adminPassword = 'Qa1!' + [Guid]::NewGuid().ToString('N')
$jwtKey = 'qa-project004-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
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
    $json = if ($text -and ($text.TrimStart().StartsWith('{') -or $text.TrimStart().StartsWith('['))) { $text | ConvertFrom-Json } else { $null }
    [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Text = $text }
}

function AddItem([string]$cabinetId, [string]$equipmentId, [string]$qty, [string]$token = '') {
    Request POST "/api/cabinets/$cabinetId/items?equipmentId=$equipmentId&qty=$qty" $null $token
}

function Equipment([string]$id, [string]$sku) {
    @{ id=$id; sku=$sku; name="$sku name"; brand='QA'; category='QA'; direction='nku'; unit='шт'; purchase=10; ratedCurrent=1; attrs=$null }
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
        $email = "$role@project004.qa.test"
        $reg = Request POST '/api/auth/register' @{ email=$email; password='RoleTest1'; fullName="QA $role"; role=$role } $admin
        Check ($reg.Status -eq 200) "$role created"
        $roleLogin = Request POST '/api/auth/login' @{ email=$email; password='RoleTest1' }
        Check ($roleLogin.Status -eq 200 -and $roleLogin.Json.token) "$role login"
        Set-Variable -Name $role -Value $roleLogin.Json.token
    }

    $project = @{
        id='qty-project'; number='QTY-001'; title='Quantity'; client='QA'; contact=''; direction='nku'; status='draft'; markup=15;
        cabinets=@(@{ id='qty-cabinet'; kind='nku'; name='Quantity cabinet'; hours=0; designHours=0; softwareHours=0; note=$null; items=@(); segments=@(); form='1' })
    }
    Check ((Request POST '/api/projects' $project $admin).Status -eq 201) 'fixture project created'
    foreach ($eq in @((Equipment 'eq-main' 'QTY-MAIN'), (Equipment 'eq-invalid-new' 'QTY-INVALID'), (Equipment 'eq-overflow' 'QTY-OVERFLOW'))) {
        Check ((Request POST '/api/catalog' $eq $engineer).Status -eq 201) "equipment $($eq.id) created"
    }

    $anon = AddItem 'qty-cabinet' 'eq-main' '0.125'
    Check ($anon.Status -eq 401) 'anonymous add item 401'
    $emptyCount = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT count(*) FROM project_items;'
    Check ([int]$emptyCount.Trim() -eq 0) 'anonymous request leaves items unchanged'

    foreach ($qty in @('0', '-0.001')) {
        $invalidNew = AddItem 'qty-cabinet' 'eq-invalid-new' $qty $engineer
        Check ($invalidNew.Status -eq 400 -and $invalidNew.Json.detail -eq 'Количество должно быть больше нуля') "new item qty $qty returns 400"
    }
    $invalidNewCount = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT count(*) FROM project_items WHERE "EqId"=''eq-invalid-new'';'
    Check ([int]$invalidNewCount.Trim() -eq 0) 'invalid new quantities create no row'

    $newPositive = AddItem 'qty-cabinet' 'eq-main' '0.125' $engineer
    Check ($newPositive.Status -eq 200 -and [decimal]$newPositive.Json[0].qty -eq [decimal]0.125) 'engineer positive fractional new item exact'
    $managerIncrement = AddItem 'qty-cabinet' 'eq-main' '0.375' $manager
    Check ($managerIncrement.Status -eq 200 -and [decimal]$managerIncrement.Json[0].qty -eq [decimal]0.500) 'manager positive fractional increment exact'
    $adminIncrement = AddItem 'qty-cabinet' 'eq-main' '1.250' $admin
    Check ($adminIncrement.Status -eq 200 -and [decimal]$adminIncrement.Json[0].qty -eq [decimal]1.750) 'admin positive fractional increment exact'

    foreach ($qty in @('0', '-2.5')) {
        $invalidExisting = AddItem 'qty-cabinet' 'eq-main' $qty $engineer
        Check ($invalidExisting.Status -eq 400 -and $invalidExisting.Json.detail -eq 'Количество должно быть больше нуля') "existing item qty $qty returns 400"
    }
    $storedQty = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT "Qty" FROM project_items WHERE "EqId"=''eq-main'';'
    Check ([decimal]$storedQty.Trim() -eq [decimal]1.750) 'invalid existing quantities leave exact DB value unchanged'

    Check ((AddItem 'missing-cabinet' 'eq-main' '0' $engineer).Status -eq 404) 'missing cabinet remains 404 despite invalid qty'
    Check ((AddItem 'qty-cabinet' 'missing-equipment' '-1' $engineer).Status -eq 404) 'missing equipment remains 404 despite invalid qty'
    Check ((AddItem 'qty-cabinet' 'eq-main' 'not-a-decimal' $engineer).Status -eq 400) 'malformed decimal binding remains 400'

    $overflow = AddItem 'qty-cabinet' 'eq-overflow' '1000000000' $engineer
    Check ($overflow.Status -eq 500) 'unrelated numeric database error remains 500'
    $overflowCount = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT count(*) FROM project_items WHERE "EqId"=''eq-overflow'';'
    Check ([int]$overflowCount.Trim() -eq 0) 'unrelated DB error rolls back new item'
    $mainAfter = & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tAc 'SELECT "Qty" FROM project_items WHERE "EqId"=''eq-main'';'
    Check ([decimal]$mainAfter.Trim() -eq [decimal]1.750) 'unrelated DB error leaves existing item unchanged'

    "PROJECT-004 PASS: $checks checks"
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
