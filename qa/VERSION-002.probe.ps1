$ErrorActionPreference = 'Stop'
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('qa_version002_' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'pgdata'; $pgLog = Join-Path $root 'postgres.log'
$apiOut = Join-Path $root 'api.out.log'; $apiErr = Join-Path $root 'api.err.log'
$pgPort = 55685; $apiPort = 55385; $db = 'qa_version002'; $base = "http://127.0.0.1:$apiPort"
$adminEmail = 'admin@version002.qa.test'; $adminPassword = 'Qa1!' + [Guid]::NewGuid().ToString('N')
$jwtKey = 'qa-version002-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$apiProcess = $null; $checks = 0

function Check([bool]$ok, [string]$name) { if (-not $ok) { throw "FAIL: $name" }; $script:checks++; "PASS: $name" }
function Request([string]$method, [string]$path, $body = $null, [string]$token = '', [switch]$Raw) {
  $headers=@{}; if($token){$headers.Authorization="Bearer $token"}
  $args=@{Uri=$base+$path;Method=$method;Headers=$headers;TimeoutSec=20;SkipHttpErrorCheck=$true}
  if($null-ne$body){$args.ContentType='application/json';$args.Body=if($Raw){[string]$body}else{$body|ConvertTo-Json -Depth 40 -Compress}}
  $r=Invoke-WebRequest @args;$status=[int]$r.StatusCode;$text=if($r.Content-is[byte[]]){[Text.Encoding]::UTF8.GetString($r.Content)}else{[string]$r.Content}
  $json=if($text-and($text.TrimStart().StartsWith('{')-or$text.TrimStart().StartsWith('['))){$text|ConvertFrom-Json}else{$null}
  [pscustomobject]@{Status=$status;Json=$json;Text=$text}
}
function Sql([string]$query){(($query|& "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tA).Trim())}
function Segment([string]$id,[string]$kind,[string]$name,[int]$partitions){@{id=$id;kind=$kind;name=$name;partitions=$partitions}}
function Item([string]$id,[decimal]$qty,[decimal]$purchase){@{id=$id;eqId=$null;sku=$id;name="Item $id";brand='QA';unit='шт';qty=$qty;purchase=$purchase}}
function Cabinet([string]$id,[string]$name,$segments,[AllowNull()][string]$form,[array]$items=@()){
  @{id=$id;kind='nku';name=$name;hours=3;designHours=2;softwareHours=1;note="note-$id";items=$items;segments=$segments;form=$form}
}
function Project([string]$id,[string]$number,$cabinets=@(),$versions=@()){
  @{id=$id;number=$number;title="Project $id";client='QA';contact='contact';direction='nku';status='draft';markup=20;workMarkup=25;discount=0;vatRate=20;showWorkLines=$true;tzzPct=1;thirdParty=0;extraCosts=0;unforeseenPct=2;tripCosts=0;transportPct=0;smrCost=0;smrSell=0;pnrCost=0;pnrSell=0;validDays=30;notes='live-notes';cabinets=$cabinets;versions=$versions}
}
function InsertLegacy([string]$id,[string]$label,$snapshot){
  $json=$snapshot|ConvertTo-Json -Depth 40 -Compress
  $b64=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
  [void](Sql "INSERT INTO project_versions (`"Id`",`"Ts`",`"Label`",`"Snapshot`",`"ProjectId`") VALUES ('$id','2025-01-02T03:04:05Z','$label',convert_from(decode('$b64','base64'),'UTF8')::jsonb,'version-root');")
}

try {
  New-Item -ItemType Directory -Path $root|Out-Null
  $init=Start-Process "$pgBin\initdb.exe" -ArgumentList @('-D',$data,'-U','postgres','-A','trust','-E','UTF8','--no-locale') -RedirectStandardOutput (Join-Path $root 'init.out') -RedirectStandardError (Join-Path $root 'init.err') -PassThru -Wait -WindowStyle Hidden
  Check ($init.ExitCode-eq 0) 'isolated cluster initialized'
  & "$pgBin\pg_ctl.exe" start -D $data -o "-p $pgPort -h 127.0.0.1" -l $pgLog -W;Check ($LASTEXITCODE-eq 0) 'PostgreSQL launch requested'
  for($i=0;$i-lt 50;$i++){& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort -U postgres *> $null;if($LASTEXITCODE-eq 0){break};Start-Sleep -Milliseconds 100};Check ($LASTEXITCODE-eq 0) 'PostgreSQL ready'
  & "$pgBin\createdb.exe" -h 127.0.0.1 -p $pgPort -U postgres $db;Check ($LASTEXITCODE-eq 0) 'database created'
  $env:ConnectionStrings__Tkp="Host=127.0.0.1;Port=$pgPort;Database=$db;Username=postgres";$env:Jwt__Key=$jwtKey;$env:Jwt__Issuer='tkp-api';$env:Jwt__Audience='tkp-web';$env:Jwt__ExpireMinutes='60'
  $env:Cors__AllowedOrigins__0='http://127.0.0.1:3000';$env:AllowedHosts='localhost;127.0.0.1';$env:Admin__Enabled='true';$env:Admin__Email=$adminEmail;$env:Admin__Password=$adminPassword;$env:ASPNETCORE_URLS=$base;$env:ASPNETCORE_ENVIRONMENT='Production'
  $dll=Join-Path $PSScriptRoot '..\backend\TkpApi\bin\Release\net8.0\TkpApi.dll';$apiProcess=Start-Process dotnet -ArgumentList @($dll) -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru -WindowStyle Hidden
  $health=$null;for($i=0;$i-lt 100;$i++){try{$health=Invoke-WebRequest "$base/api/health" -TimeoutSec 2;if($health.StatusCode-eq 200){break}}catch{};Start-Sleep -Milliseconds 100};Check ($health.StatusCode-eq 200) 'API started'
  $login=Request POST '/api/auth/login' @{email=$adminEmail;password=$adminPassword};Check ($login.Status-eq 200-and$login.Json.token) 'admin login';$tokens=@{admin=$login.Json.token}
  foreach($role in @('manager','engineer')){$email="$role@version002.qa.test";Check ((Request POST '/api/auth/register' @{email=$email;password='RoleTest1!';fullName="QA $role";role=$role} $tokens.admin).Status-eq 200) "$role created";$rl=Request POST '/api/auth/login' @{email=$email;password='RoleTest1!'};Check ($rl.Status-eq 200-and$rl.Json.token) "$role login";$tokens[$role]=$rl.Json.token}
  $noStaffEmail='nostaff@version002.qa.test';Check ((Request POST '/api/auth/register' @{email=$noStaffEmail;password='RoleTest1!';fullName='No role';role='engineer'} $tokens.admin).Status-eq 200) 'no-role fixture created'
  [void](Sql "DELETE FROM `"AspNetUserRoles`" WHERE `"UserId`"=(SELECT `"Id`" FROM `"AspNetUsers`" WHERE `"NormalizedEmail`"='NOSTAFF@VERSION002.QA.TEST');")
  $nr=Request POST '/api/auth/login' @{email=$noStaffEmail;password='RoleTest1!'};Check ($nr.Status-eq 200-and$nr.Json.token) 'no-role login';$noStaff=$nr.Json.token

  $cabMulti=Cabinet 'cab-multi' 'Multi cabinet' @((Segment 'seg-case' 'input' 'Input' 1),(Segment 'SEG-CASE' 'custom' 'Upper case' 4)) '4b' @((Item 'item-a' 2 100))
  $cabEmpty=Cabinet 'cab-empty' 'Empty cabinet' @() '1' @((Item 'item-b' 1 50))
  $cabNull=Cabinet 'cab-null' 'Null cabinet' $null $null @()
  $project=Project 'version-root' 'NUM-VERSION-002' @($cabMulti,$cabEmpty,$cabNull)
  $created=Request POST '/api/projects' $project $tokens.admin;Check ($created.Status-eq 201) 'project fixture created'

  Check ((Request POST '/api/projects/version-root/versions?label=anonymous').Status-eq 401) 'anonymous version create 401'
  Check ((Request POST '/api/projects/version-root/versions?label=invalid' $null 'invalid-token').Status-eq 401) 'invalid token version create 401'
  Check ((Request POST '/api/projects/version-root/versions?label=no-role' $null $noStaff).Status-eq 403) 'authenticated non-Staff version create 403'
  Check ((Request POST '/api/projects/missing/versions?label=missing' $null $tokens.admin).Status-eq 404) 'missing project version create 404'

  $roleIndex=0
  foreach($role in @('admin','manager','engineer')){
    $roleIndex++;$label="Role $role label"
    $saved=Request POST ("/api/projects/version-root/versions?label="+[Uri]::EscapeDataString($label)) $null $tokens[$role]
    Check ($saved.Status-eq 200) "$role version create 200"
    $v=@($saved.Json|Where-Object label -eq $label)[0]
    Check ($v.label-eq$label-and$v.ts-is[long]-and$v.id) "$role version metadata contract"
    Check ($null-ne$v.snapshot.cabinets-and$null-ne$v.snapshot.calc) "$role snapshot response shape"
    $cabinetPropertyNames=@($v.snapshot.cabinets[0].PSObject.Properties.Name)
    Check (@($v.snapshot.cabinets).Count -eq 3) "$role cabinet count response"
    Check (($cabinetPropertyNames -ccontains 'id') -and -not ($cabinetPropertyNames -ccontains 'Id')) "$role camelCase cabinet response"
    $multi=@($v.snapshot.cabinets|Where-Object id -eq 'cab-multi')[0];$empty=@($v.snapshot.cabinets|Where-Object id -eq 'cab-empty')[0];$nullCab=@($v.snapshot.cabinets|Where-Object id -eq 'cab-null')[0]
    $segmentIds=@($multi.segments.id)
    Check ($multi.form-eq'4b'-and@($multi.segments).Count-eq 2-and($segmentIds-ccontains'seg-case')-and($segmentIds-ccontains'SEG-CASE')) "$role multiple/case segments and form response"
    Check (@($empty.segments).Count-eq 0-and$empty.form-eq'1') "$role empty segments response"
    Check (@($nullCab.segments).Count-eq0-and[string]::IsNullOrEmpty($nullCab.form)) "$role null segments/form remains frontend-compatible"
    Check ($multi.items[0].id-eq'item-a'-and$v.snapshot.calc.eqBase-eq250-and$v.snapshot.calc.total-eq300) "$role items and calc response"
  }
  Start-Sleep -Milliseconds 300
  $versionCreateLogs=((Get-Content $apiOut -Raw -ErrorAction SilentlyContinue)+' '+(Get-Content $apiErr -Raw -ErrorAction SilentlyContinue))
  Check ($versionCreateLogs-notmatch'MultipleCollectionIncludeWarning') 'version-create query emits no MultipleCollectionIncludeWarning'

  $rawSql=Sql "SELECT count(*) FROM project_versions v, jsonb_array_elements(v.`"Snapshot`"->'cabinets') c WHERE v.`"Label`"='Role admin label' AND c->>'id'='cab-multi' AND c ? 'segments' AND c ? 'form' AND jsonb_array_length(c->'segments')=2;"
  Check ($rawSql-eq'1') 'jsonb stores camelCase segments/form'
  Check ((Sql "SELECT count(*) FROM project_versions WHERE `"ProjectId`"='version-root';")-eq'3') 'three role versions persisted'

  $reloaded=Request GET '/api/projects/version-root' $null $tokens.manager;Check ($reloaded.Status-eq 200-and@($reloaded.Json.versions).Count-eq 3) 'reload through new scoped DbContext returns versions'
  $restoreVersion=@($reloaded.Json.versions|Where-Object label -eq 'Role admin label')[0]
  $restorePatch=Project 'ignored-body-id' 'NUM-VERSION-002' $restoreVersion.snapshot.cabinets @()
  $restorePatch.title='Restored through frontend-compatible PUT';$restorePatch.notes='restored-live-project'
  $restored=Request PUT '/api/projects/version-root' $restorePatch $tokens.engineer;Check ($restored.Status-eq 200) 'frontend-compatible restore PUT 200'
  Check ($restored.Json.id-eq'version-root'-and$restored.Json.title-eq'Restored through frontend-compatible PUT'-and$restored.Json.notes-eq'restored-live-project') 'restore updates live project scalars with route id'
  $restoredMulti=@($restored.Json.cabinets|Where-Object id -eq 'cab-multi')[0]
  $restoredSegmentIds=@($restoredMulti.segments.id)
  Check ($restoredMulti.form-eq'4b'-and@($restoredMulti.segments).Count-eq2-and($restoredSegmentIds-ccontains'seg-case')-and($restoredSegmentIds-ccontains'SEG-CASE')) 'restore preserves segments/form'
  Check ((Sql "SELECT count(*) FROM cabinet_segments WHERE `"CabinetId`"='cab-multi' AND `"Id`" IN ('seg-case','SEG-CASE');")-eq'2') 'restore persists case-distinct segments in SQL'
  Check ((Sql "SELECT count(*) FROM project_versions WHERE `"ProjectId`"='version-root';")-eq'3') 'restore does not alter version rows'

  $legacyPascal=@{cabinets=@(@{Id='legacy-p';Kind='nku';Name='Legacy Pascal';Hours=1;DesignHours=2;SoftwareHours=3;Note='P';Items=@(@{Id='legacy-item-p';EqId=$null;Sku='LP';Name='Legacy item';Brand='QA';Unit='шт';Qty=2;Purchase=11});Form='2a'});calc=@{eqBase=22;total=26.4};extension=@{marker='keep-p'}}
  $legacyCamel=@{cabinets=@(@{id='legacy-c';kind='nku';name='Legacy Camel';hours=1;designHours=2;softwareHours=3;note='C';items=@();form='1'});calc=@{eqBase=0;total=0};extension=@{marker='keep-c'}}
  InsertLegacy 'legacy-p-version' 'Legacy Pascal' $legacyPascal;InsertLegacy 'legacy-c-version' 'Legacy Camel' $legacyCamel
  InsertLegacy 'legacy-malformed-version' 'Legacy malformed' 'malformed-scalar'
  [void](Sql "INSERT INTO project_versions (`"Id`",`"Ts`",`"Label`",`"Snapshot`",`"ProjectId`") VALUES ('legacy-null-version','2025-01-02T03:04:06Z','Legacy null',NULL,'version-root');")
  $legacyHashBefore=Sql "SELECT string_agg(`"Id`" || ':' || md5(`"Snapshot`"::text),',' ORDER BY `"Id`") FROM project_versions WHERE `"Id`" LIKE 'legacy-%';"
  $legacyRead=Request GET '/api/projects/version-root' $null $tokens.engineer;Check ($legacyRead.Status-eq 200) 'legacy versions GET 200'
  $lp=@($legacyRead.Json.versions|Where-Object id -eq 'legacy-p-version')[0];$lc=@($legacyRead.Json.versions|Where-Object id -eq 'legacy-c-version')[0]
  $lm=@($legacyRead.Json.versions|Where-Object id -eq 'legacy-malformed-version')[0];$ln=@($legacyRead.Json.versions|Where-Object id -eq 'legacy-null-version')[0]
  Check ($lp.snapshot.cabinets[0].id-eq'legacy-p'-and$lp.snapshot.cabinets[0].items[0].id-eq'legacy-item-p'-and$lp.snapshot.cabinets[0].form-eq'2a') 'legacy PascalCase cabinet/item normalized for frontend'
  Check ($null-eq$lp.snapshot.cabinets[0].segments-and$lp.snapshot.calc.eqBase-eq22-and$lp.snapshot.extension.marker-eq'keep-p') 'legacy PascalCase missing segments remains compatible'
  Check ($lc.snapshot.cabinets[0].id-eq'legacy-c'-and$null-eq$lc.snapshot.cabinets[0].segments-and$lc.snapshot.extension.marker-eq'keep-c') 'legacy camelCase missing segments remains compatible'
  Check ($lm.snapshot-eq'malformed-scalar'-and$null-eq$ln.snapshot) 'malformed scalar and null legacy snapshots remain readable'
  $legacyHashAfter=Sql "SELECT string_agg(`"Id`" || ':' || md5(`"Snapshot`"::text),',' ORDER BY `"Id`") FROM project_versions WHERE `"Id`" LIKE 'legacy-%';"
  Check ($legacyHashAfter-eq$legacyHashBefore) 'legacy JSONB not rewritten by response normalization'

  $list=Request GET '/api/projects' $null $tokens.admin;Check ($list.Status-eq 200-and@($list.Json[0].versions).Count-eq7) 'project list also returns normalized versions'
  Check ((Request GET '/api/projects/version-root').Status-eq401) 'project version read anonymous 401'
  Check ((Request GET '/api/projects/version-root' $null $noStaff).Status-eq403) 'project version read no-role 403'
  "VERSION-002 COMPLETE: $checks passing checks, 0 confirmed defects"
}
finally{
  if($apiProcess-and-not$apiProcess.HasExited){Stop-Process -Id $apiProcess.Id -Force;Wait-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue}
  if(Test-Path(Join-Path $data 'postmaster.pid')){& "$pgBin\pg_ctl.exe" stop -D $data -m fast -W;for($i=0;$i -lt 50;$i++){& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort -U postgres *> $null;if($LASTEXITCODE -ne 0){break};Start-Sleep -Milliseconds 100}}
  Remove-Item Env:ConnectionStrings__Tkp,Env:Jwt__Key,Env:Jwt__Issuer,Env:Jwt__Audience,Env:Jwt__ExpireMinutes,Env:Cors__AllowedOrigins__0,Env:AllowedHosts,Env:Admin__Enabled,Env:Admin__Email,Env:Admin__Password,Env:ASPNETCORE_URLS,Env:ASPNETCORE_ENVIRONMENT -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 200;if(Test-Path $root){Remove-Item -LiteralPath $root -Recurse -Force}
}
