$ErrorActionPreference = 'Stop'

$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('qa_project002_' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'pgdata'
$pgLog = Join-Path $root 'postgres.log'
$apiOut = Join-Path $root 'api.out.log'
$apiErr = Join-Path $root 'api.err.log'
$pgPort = 55561
$apiPort = 55261
$db = 'qa_project002'
$base = "http://127.0.0.1:$apiPort"
$adminEmail = 'admin@project002.qa.test'
$adminPassword = 'Qa1!' + [Guid]::NewGuid().ToString('N')
$jwtKey = 'qa-project002-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
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
    $json = if ($r.Content -and $r.Headers.'Content-Type' -match 'json') { $r.Content | ConvertFrom-Json } else { $null }
    [pscustomobject]@{ Status = [int]$r.StatusCode; Json = $json; Text = $r.Content }
}

function New-Project([string]$id, [string]$number, [string]$label) {
    @{
        id=$id; number=$number; title="$label title"; client="$label client"; contact="$label contact";
        direction='nku'; status='draft'; markup=15; workMarkup=25; discount=0; vatRate=20;
        showWorkLines=$true; notes="$label notes";
        cabinets=@(@{
            id="cab-$id-$label"; kind='nku'; name="$label cabinet"; hours=1; designHours=2;
            softwareHours=3; note="$label cabinet note"; segments=@(); form='1';
            items=@(@{ id="item-$id-$label"; eqId=$null; sku="$label-SKU"; name="$label item"; brand='QA'; unit='шт'; qty=2; purchase=123.45 })
        })
    }
}

function ConcurrentJson([string]$method, [string]$path1, $body1, [string]$path2, $body2, [string]$token) {
    $client = [System.Net.Http.HttpClient]::new()
    $client.Timeout = [TimeSpan]::FromSeconds(20)
    $client.DefaultRequestHeaders.Authorization = [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $token)
    $m1 = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($method), $base + $path1)
    $m2 = [System.Net.Http.HttpRequestMessage]::new([System.Net.Http.HttpMethod]::new($method), $base + $path2)
    $m1.Content = [System.Net.Http.StringContent]::new(($body1 | ConvertTo-Json -Depth 20 -Compress), [Text.Encoding]::UTF8, 'application/json')
    $m2.Content = [System.Net.Http.StringContent]::new(($body2 | ConvertTo-Json -Depth 20 -Compress), [Text.Encoding]::UTF8, 'application/json')
    try {
        $t1 = $client.SendAsync($m1)
        $t2 = $client.SendAsync($m2)
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
        $email = "$role@project002.qa.test"
        $reg = Request POST '/api/auth/register' @{ email=$email; password='RoleTest1'; fullName="QA $role"; role=$role } $admin
        Check ($reg.Status -eq 200) "$role created"
        $roleLogin = Request POST '/api/auth/login' @{ email=$email; password='RoleTest1' }
        Check ($roleLogin.Status -eq 200 -and $roleLogin.Json.token) "$role login"
        Set-Variable -Name $role -Value $roleLogin.Json.token
    }

    $a = New-Project 'project-a' 'NUM-A' 'original-a'
    $b = New-Project 'project-b' 'NUM-B' 'original-b'
    Check ((Request POST '/api/projects' $a).Status -eq 401) 'anonymous POST 401'
    Check ((Request PUT '/api/projects/project-a' $a).Status -eq 401) 'anonymous PUT 401'
    Check ((Request POST '/api/projects' $a $engineer).Status -eq 201) 'engineer Staff POST 201'
    Check ((Request POST '/api/projects' $b $manager).Status -eq 201) 'manager Staff POST 201'

    $duplicatePost = New-Project 'project-duplicate-number' 'NUM-A' 'duplicate'
    $dupPostResult = Request POST '/api/projects' $duplicatePost $admin
    Check ($dupPostResult.Status -eq 409 -and $dupPostResult.Json.detail -eq 'Проект с таким номером уже существует') 'duplicate POST exact number 409 detail'

    $own = New-Project 'project-a' 'NUM-A' 'own-update'
    $ownResult = Request PUT '/api/projects/project-a' $own $engineer
    Check ($ownResult.Status -eq 200) 'PUT keeps own number 200'
    $duplicatePut = New-Project 'project-a' 'NUM-B' 'rejected-update'
    $dupPutResult = Request PUT '/api/projects/project-a' $duplicatePut $engineer
    Check ($dupPutResult.Status -eq 409 -and $dupPutResult.Json.detail -eq 'Проект с таким номером уже существует') 'duplicate PUT exact number 409 detail'
    $afterRejected = Request GET '/api/projects/project-a' $null $engineer
    Check ($afterRejected.Json.number -eq 'NUM-A' -and $afterRejected.Json.title -eq 'own-update title' -and $afterRejected.Json.client -eq 'own-update client') 'duplicate PUT rolls back scalar fields'
    Check (@($afterRejected.Json.cabinets).Count -eq 1 -and $afterRejected.Json.cabinets[0].id -eq 'cab-project-a-own-update' -and $afterRejected.Json.cabinets[0].items[0].id -eq 'item-project-a-own-update') 'duplicate PUT rolls back nested cabinets/items'

    $unique = New-Project 'project-a' 'Case-001' 'unique-update'
    Check ((Request PUT '/api/projects/project-a' $unique $engineer).Status -eq 200) 'unique rename PUT 200'
    $caseVariant = New-Project 'project-case' 'case-001' 'case-variant'
    Check ((Request POST '/api/projects' $caseVariant $admin).Status -eq 201) 'case-variant number POST 201'

    $race1 = New-Project 'race-post-1' 'RACE-POST' 'race-post-1'
    $race2 = New-Project 'race-post-2' 'RACE-POST' 'race-post-2'
    $postStatuses = ConcurrentJson 'POST' '/api/projects' $race1 '/api/projects' $race2 $admin | Sort-Object
    Check ($postStatuses.Count -eq 2 -and $postStatuses[0] -eq 201 -and $postStatuses[1] -eq 409) 'concurrent exact POST gives one 201 and one 409'
    $projects = Request GET '/api/projects' $null $engineer
    Check (@($projects.Json | Where-Object number -eq 'RACE-POST').Count -eq 1) 'concurrent exact POST stores one project'

    $c = New-Project 'project-c' 'NUM-C' 'original-c'
    $d = New-Project 'project-d' 'NUM-D' 'original-d'
    Check ((Request POST '/api/projects' $c $manager).Status -eq 201) 'race PUT project C created'
    Check ((Request POST '/api/projects' $d $admin).Status -eq 201) 'race PUT project D created'
    $cRace = New-Project 'project-c' 'RACE-PUT' 'race-c'
    $dRace = New-Project 'project-d' 'RACE-PUT' 'race-d'
    $putStatuses = ConcurrentJson 'PUT' '/api/projects/project-c' $cRace '/api/projects/project-d' $dRace $admin
    Check (@($putStatuses | Where-Object { $_ -eq 200 }).Count -eq 1 -and @($putStatuses | Where-Object { $_ -eq 409 }).Count -eq 1) 'concurrent exact PUT gives one 200 and one 409'
    $cAfter = (Request GET '/api/projects/project-c' $null $engineer).Json
    $dAfter = (Request GET '/api/projects/project-d' $null $engineer).Json
    $winner = @($cAfter, $dAfter | Where-Object number -eq 'RACE-PUT')
    $loser = @($cAfter, $dAfter | Where-Object number -ne 'RACE-PUT')
    Check ($winner.Count -eq 1 -and $loser.Count -eq 1) 'concurrent PUT stores unique number once'
    $expectedLoser = if ($loser[0].id -eq 'project-c') { 'original-c' } else { 'original-d' }
    Check ($loser[0].title -eq "$expectedLoser title" -and $loser[0].client -eq "$expectedLoser client") 'race-losing PUT rolls back scalar fields'
    Check ($loser[0].cabinets[0].id -eq "cab-$($loser[0].id)-$expectedLoser" -and $loser[0].cabinets[0].items[0].id -eq "item-$($loser[0].id)-$expectedLoser") 'race-losing PUT rolls back nested cabinets/items'

    $pkConflict = New-Project 'project-a' 'UNRELATED-UNIQUE-NUMBER' 'pk-conflict'
    $unrelated = Request POST '/api/projects' $pkConflict $admin
    Check ($unrelated.Status -eq 500) 'unrelated projects primary-key 23505 remains 500'
    $aAfter500 = Request GET '/api/projects/project-a' $null $engineer
    Check ($aAfter500.Status -eq 200 -and $aAfter500.Json.number -eq 'Case-001' -and $aAfter500.Json.title -eq 'unique-update title') 'unrelated 23505 leaves existing project unchanged'

    "PROJECT-002 PASS: $checks checks"
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
