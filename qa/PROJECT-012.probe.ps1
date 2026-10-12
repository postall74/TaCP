$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('qa_project012_' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'pgdata'; $pgLog = Join-Path $root 'postgres.log'
$apiOut = Join-Path $root 'api.out.log'; $apiErr = Join-Path $root 'api.err.log'
$pgPort = 55662; $apiPort = 55362; $db = 'qa_project012'; $base = "http://127.0.0.1:$apiPort"
$adminEmail = 'admin@project012.qa.test'; $adminPassword = 'Qa1!' + [Guid]::NewGuid().ToString('N')
$jwtKey = 'qa-project012-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$apiProcess = $null; $checks = 0

function Check([bool]$ok, [string]$name) { if (-not $ok) { throw "FAIL: $name" }; $script:checks++; "PASS: $name" }
function Project([string]$id, [string]$number, [string]$status = 'draft', $cabinets = @(), $versions = @()) {
  @{ id=$id; number=$number; title="Project $id"; client='QA'; contact=''; direction='nku'; status=$status; markup=15; cabinets=$cabinets; versions=$versions }
}
function Cabinet([string]$id) { @{ id=$id; kind='nku'; name=$id; hours=1; designHours=2; softwareHours=3; items=@(); segments=@(); form='1' } }
function Item([string]$id) { @{ id=$id; eqId=$null; sku=$id; name=$id; brand='QA'; unit='шт'; qty=1; purchase=10 } }
function Segment([string]$id) { @{ id=$id; kind='custom'; name=$id; partitions=1 } }
function Version([string]$id, [string]$label = 'QA version') { @{ id=$id; ts='2026-10-12T12:00:00Z'; label=$label; snapshot=@{ marker=$id } } }
function Request([string]$method, [string]$path, $body = $null, [string]$token = '') {
  $headers=@{}; if ($token) { $headers.Authorization="Bearer $token" }
  $args=@{Uri=$base+$path;Method=$method;Headers=$headers;TimeoutSec=20;SkipHttpErrorCheck=$true}
  if ($null -ne $body) { $args.ContentType='application/json'; $args.Body=$body|ConvertTo-Json -Depth 20 -Compress }
  $r=Invoke-WebRequest @args; $status=[int]$r.StatusCode; $text=if($r.Content-is[byte[]]){[Text.Encoding]::UTF8.GetString($r.Content)}else{[string]$r.Content}
  $json=if($text-and($text.TrimStart().StartsWith('{')-or$text.TrimStart().StartsWith('['))){$text|ConvertFrom-Json}else{$null}
  [pscustomobject]@{Status=$status;Json=$json;Text=$text}
}
function ConcurrentProjects($one,$two,[string]$token) {
  $client=[Net.Http.HttpClient]::new(); $client.Timeout=[TimeSpan]::FromSeconds(20)
  $client.DefaultRequestHeaders.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$token)
  $m1=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post,"$base/api/projects")
  $m2=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post,"$base/api/projects")
  $m1.Content=[Net.Http.StringContent]::new(($one|ConvertTo-Json -Depth 20 -Compress),[Text.Encoding]::UTF8,'application/json')
  $m2.Content=[Net.Http.StringContent]::new(($two|ConvertTo-Json -Depth 20 -Compress),[Text.Encoding]::UTF8,'application/json')
  try { $t1=$client.SendAsync($m1);$t2=$client.SendAsync($m2);[Threading.Tasks.Task]::WaitAll(@($t1,$t2));@([int]$t1.Result.StatusCode,[int]$t2.Result.StatusCode) }
  finally { $m1.Dispose();$m2.Dispose();$client.Dispose() }
}
function Sql([string]$query) { (($query | & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -tA).Trim()) }

try {
  New-Item -ItemType Directory -Path $root|Out-Null
  $init=Start-Process "$pgBin\initdb.exe" -ArgumentList @('-D',$data,'-U','postgres','-A','trust','-E','UTF8','--no-locale') -RedirectStandardOutput (Join-Path $root 'init.out') -RedirectStandardError (Join-Path $root 'init.err') -PassThru -Wait -WindowStyle Hidden
  Check ($init.ExitCode-eq 0) 'isolated cluster initialized'
  & "$pgBin\pg_ctl.exe" start -D $data -o "-p $pgPort -h 127.0.0.1" -l $pgLog -W
  Check ($LASTEXITCODE-eq 0) 'PostgreSQL launch requested'
  for($i=0;$i-lt 50;$i++){& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort -U postgres *> $null;if($LASTEXITCODE-eq 0){break};Start-Sleep -Milliseconds 100}
  Check ($LASTEXITCODE-eq 0) 'PostgreSQL ready'; & "$pgBin\createdb.exe" -h 127.0.0.1 -p $pgPort -U postgres $db; Check ($LASTEXITCODE-eq 0) 'database created'
  $env:ConnectionStrings__Tkp="Host=127.0.0.1;Port=$pgPort;Database=$db;Username=postgres";$env:Jwt__Key=$jwtKey;$env:Jwt__Issuer='tkp-api';$env:Jwt__Audience='tkp-web';$env:Jwt__ExpireMinutes='60'
  $env:Cors__AllowedOrigins__0='http://127.0.0.1:3000';$env:AllowedHosts='localhost;127.0.0.1';$env:Admin__Enabled='true';$env:Admin__Email=$adminEmail;$env:Admin__Password=$adminPassword;$env:ASPNETCORE_URLS=$base;$env:ASPNETCORE_ENVIRONMENT='Production'
  $dll=Join-Path $PSScriptRoot '..\backend\TkpApi\bin\Release\net8.0\TkpApi.dll';$apiProcess=Start-Process dotnet -ArgumentList @($dll) -RedirectStandardOutput $apiOut -RedirectStandardError $apiErr -PassThru -WindowStyle Hidden
  $health=$null;for($i=0;$i-lt 100;$i++){try{$health=Invoke-WebRequest "$base/api/health" -TimeoutSec 2;if($health.StatusCode-eq 200){break}}catch{};Start-Sleep -Milliseconds 100};Check ($health.StatusCode-eq 200) 'API started'
  $login=Request POST '/api/auth/login' @{email=$adminEmail;password=$adminPassword};Check ($login.Status-eq 200-and$login.Json.token) 'admin login';$admin=$login.Json.token
  foreach($role in @('manager','engineer')){$email="$role@project012.qa.test";Check ((Request POST '/api/auth/register' @{email=$email;password='RoleTest1';fullName="QA $role";role=$role} $admin).Status-eq 200) "$role created";$rl=Request POST '/api/auth/login' @{email=$email;password='RoleTest1'};Check ($rl.Status-eq 200-and$rl.Json.token) "$role login";Set-Variable -Name $role -Value $rl.Json.token}

  $explicit=Request POST '/api/projects' (Project 'explicit-id' 'NUM-EXPLICIT') $engineer;Check ($explicit.Status-eq 201-and$explicit.Json.id-eq'explicit-id') 'unique explicit ID 201'
  $before=Sql 'SELECT count(*) FROM projects;';$existing=Request POST '/api/projects' (Project 'explicit-id' 'NUM-DUP-ID' 'draft' @((Cabinet 'should-not-exist')) ) $manager
  Check ($existing.Status-eq 409-and$existing.Json.detail-eq'Проект с таким идентификатором уже существует') 'existing exact ID stable 409 detail';Check ((Sql 'SELECT count(*) FROM projects;')-eq$before-and(Sql 'SELECT count(*) FROM project_cabinets WHERE "Id"=''should-not-exist'';')-eq'0') 'existing ID changes no graph'
  $blank=Request POST '/api/projects' (Project '' 'NUM-BLANK') $admin;Check ($blank.Status-eq 201-and-not[string]::IsNullOrWhiteSpace($blank.Json.id)) 'blank ID generated 201'
  Check ((Request POST '/api/projects' (Project 'EXPLICIT-ID' 'NUM-CASE') $admin).Status-eq 201) 'case-variant ID 201'
  try { Invoke-WebRequest -Uri "$base/api/projects" -Method POST -Headers @{Authorization="Bearer $admin"} -ContentType 'application/json' -Body '{bad json'|Out-Null; $rawStatus=200 } catch { $rawStatus=[int]$_.Exception.Response.StatusCode }
  Check ($rawStatus-eq 400) 'malformed JSON 400';Check ((Request POST '/api/projects' (Project 'anonymous-id' 'NUM-ANON')).Status-eq 401) 'anonymous 401'
  foreach($status in @('won','lost')) {
    $id="engineer-$status"; $cab="engineer-$status-cab"
    $denied=Request POST '/api/projects' (Project $id "NUM-ENG-$status" $status @((Cabinet $cab))) $engineer
    Check ($denied.Status-eq 403-and$denied.Json.detail) "engineer $status forbidden 403 with detail"
    Check ((Sql "SELECT (SELECT count(*) FROM projects WHERE `"Id`"='$id') + (SELECT count(*) FROM project_cabinets WHERE `"Id`"='$cab');")-eq'0') "engineer $status creates zero project/cabinet rows"
  }
  foreach($status in @('calc','sent')) {
    Check ((Request POST '/api/projects' (Project "engineer-$status" "NUM-ENG-$status" $status) $engineer).Status-eq 201) "engineer $status allowed 201"
  }
  foreach($roleName in @('manager','admin')) {
    $roleToken=Get-Variable -Name $roleName -ValueOnly
    foreach($status in @('draft','calc','sent','won','lost')) {
      Check ((Request POST '/api/projects' (Project "$roleName-$status" "NUM-$roleName-$status" $status) $roleToken).Status-eq 201) "$roleName $status allowed 201"
    }
  }

  $idRace=ConcurrentProjects (Project 'race-exact-id' 'NUM-ID-RACE-1') (Project 'race-exact-id' 'NUM-ID-RACE-2') $admin
  Check (@($idRace|Where-Object{$_-eq 201}).Count-eq 1-and@($idRace|Where-Object{$_-eq 409}).Count-eq 1) 'concurrent exact ID one 201 one 409';Check ((Sql 'SELECT count(*) FROM projects WHERE "Id"=''race-exact-id'';')-eq'1') 'ID race stores one graph'
  $numPre=Request POST '/api/projects' (Project 'number-pre-1' 'NUM-SAME') $admin;Check ($numPre.Status-eq 201) 'number precheck fixture 201';$numDup=Request POST '/api/projects' (Project 'number-pre-2' 'NUM-SAME') $admin
  Check ($numDup.Status-eq 409-and$numDup.Json.detail-eq'Проект с таким номером уже существует') 'IX_projects_Number precheck 409';Check ((Sql 'SELECT count(*) FROM projects WHERE "Number"=''NUM-SAME'';')-eq'1') 'number precheck stores one row'
  $numRace=ConcurrentProjects (Project 'number-race-a' 'NUM-RACE') (Project 'number-race-b' 'NUM-RACE') $admin
  Check (@($numRace|Where-Object{$_-eq 201}).Count-eq 1-and@($numRace|Where-Object{$_-eq 409}).Count-eq 1) 'number race one 201 one 409';Check ((Sql 'SELECT count(*) FROM projects WHERE "Number"=''NUM-RACE'';')-eq'1') 'number race stores one row'

  Check ((Request POST '/api/projects' (Project 'valid-nested' 'NUM-VALID-NESTED' 'draft' @((Cabinet 'valid-nested-cab'))) $admin).Status-eq 201) 'valid nested cabinet 201'
  Check ((Sql 'SELECT count(*) FROM project_cabinets WHERE "Id"=''valid-nested-cab'';')-eq'1') 'valid nested cabinet stored'
  $intra=Request POST '/api/projects' (Project 'intra-root' 'NUM-INTRA' 'draft' @((Cabinet 'intra-same'),(Cabinet 'intra-same'))) $manager
  Check ($intra.Status-eq 409-and$intra.Json.detail-eq'Шкаф с таким идентификатором уже существует') 'duplicate nested cabinet IDs 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id"=''intra-root'') + (SELECT count(*) FROM project_cabinets WHERE "Id"=''intra-same'');')-eq'0') 'duplicate nested cabinet persists no rows'
  Check ((Request POST '/api/projects' (Project 'child-source' 'NUM-CHILD-SOURCE' 'draft' @((Cabinet 'shared-child'))) $admin).Status-eq 201) 'existing cabinet fixture 201'
  $existingChild=Request POST '/api/projects' (Project 'child-conflict' 'NUM-CHILD-CONFLICT' 'draft' @((Cabinet 'shared-child'))) $admin
  Check ($existingChild.Status-eq 409-and$existingChild.Json.detail-eq'Шкаф с таким идентификатором уже существует') 'existing nested cabinet ID 409'
  Check ((Sql 'SELECT count(*) FROM projects WHERE "Id"=''child-conflict'';')-eq'0') 'existing cabinet conflict adds no root'
  Check ((Request POST '/api/projects' (Project 'case-child-root' 'NUM-CASE-CHILD' 'draft' @((Cabinet 'SHARED-CHILD'))) $engineer).Status-eq 201) 'case-variant nested cabinet ID 201'
  $cabRace=ConcurrentProjects (Project 'cab-race-root-a' 'NUM-CAB-RACE-A' 'draft' @((Cabinet 'cab-race-same'))) (Project 'cab-race-root-b' 'NUM-CAB-RACE-B' 'draft' @((Cabinet 'cab-race-same'))) $admin
  Check (@($cabRace|Where-Object{$_-eq 201}).Count-eq 1-and@($cabRace|Where-Object{$_-eq 409}).Count-eq 1) 'concurrent unique roots same cabinet one 201 one 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id" LIKE ''cab-race-root-%'') || '':'' || (SELECT count(*) FROM project_cabinets WHERE "Id"=''cab-race-same'');')-eq'1:1') 'cabinet race rolls back losing root graph'

  $validItemCab=Cabinet 'valid-item-cab';$validItemCab.items=@((Item 'valid-item'))
  Check ((Request POST '/api/projects' (Project 'valid-item-root' 'NUM-VALID-ITEM' 'draft' @($validItemCab)) $admin).Status-eq 201) 'valid item graph 201'
  Check ((Sql 'SELECT count(*) FROM project_items WHERE "Id"=''valid-item'';')-eq'1') 'valid item stored'
  $nullItemsCab=Cabinet 'null-items-cab';$nullItemsCab.items=$null
  Check ((Request POST '/api/projects' (Project 'null-items-root' 'NUM-NULL-ITEMS' 'draft' @($nullItemsCab)) $engineer).Status-eq 201) 'null items 201'
  $emptyItemsCab=Cabinet 'empty-items-cab';$emptyItemsCab.items=@()
  Check ((Request POST '/api/projects' (Project 'empty-items-root' 'NUM-EMPTY-ITEMS' 'draft' @($emptyItemsCab)) $manager).Status-eq 201) 'empty items 201'
  $caseItemCab=Cabinet 'case-item-cab';$caseItemCab.items=@((Item 'VALID-ITEM'))
  Check ((Request POST '/api/projects' (Project 'case-item-root' 'NUM-CASE-ITEM' 'draft' @($caseItemCab)) $admin).Status-eq 201) 'case-variant item ID 201'

  $sameCab=Cabinet 'same-item-cab';$sameCab.items=@((Item 'dup-same-item'),(Item 'dup-same-item'))
  $sameResult=Request POST '/api/projects' (Project 'dup-same-root' 'NUM-DUP-SAME' 'draft' @($sameCab)) $admin
  Check ($sameResult.Status-eq 409-and$sameResult.Json.detail-eq'Позиция шкафа с таким идентификатором уже существует') 'duplicate item same cabinet 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id"=''dup-same-root'') + (SELECT count(*) FROM project_cabinets WHERE "Id"=''same-item-cab'') + (SELECT count(*) FROM project_items WHERE "Id"=''dup-same-item'');')-eq'0') 'same-cabinet duplicate atomic no rows'
  $acrossA=Cabinet 'across-cab-a';$acrossA.items=@((Item 'dup-across-item'));$acrossB=Cabinet 'across-cab-b';$acrossB.items=@((Item 'dup-across-item'))
  $acrossResult=Request POST '/api/projects' (Project 'dup-across-root' 'NUM-DUP-ACROSS' 'draft' @($acrossA,$acrossB)) $manager
  Check ($acrossResult.Status-eq 409-and$acrossResult.Json.detail-eq'Позиция шкафа с таким идентификатором уже существует') 'duplicate item across cabinets 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id"=''dup-across-root'') + (SELECT count(*) FROM project_cabinets WHERE "Id" LIKE ''across-cab-%'') + (SELECT count(*) FROM project_items WHERE "Id"=''dup-across-item'');')-eq'0') 'across-cabinet duplicate atomic no rows'

  $sourceItemCab=Cabinet 'item-source-cab';$sourceItemCab.items=@((Item 'shared-item'))
  Check ((Request POST '/api/projects' (Project 'item-source-root' 'NUM-ITEM-SOURCE' 'draft' @($sourceItemCab)) $admin).Status-eq 201) 'existing item fixture 201'
  $existingItemCab=Cabinet 'item-conflict-cab';$existingItemCab.items=@((Item 'shared-item'))
  $existingItemResult=Request POST '/api/projects' (Project 'item-conflict-root' 'NUM-ITEM-CONFLICT' 'draft' @($existingItemCab)) $admin
  Check ($existingItemResult.Status-eq 409-and$existingItemResult.Json.detail-eq'Позиция шкафа с таким идентификатором уже существует') 'existing item ID 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id"=''item-conflict-root'') + (SELECT count(*) FROM project_cabinets WHERE "Id"=''item-conflict-cab'');')-eq'0') 'existing item conflict rolls back root and cabinet'
  $raceItemA=Cabinet 'item-race-cab-a';$raceItemA.items=@((Item 'item-race-same'));$raceItemB=Cabinet 'item-race-cab-b';$raceItemB.items=@((Item 'item-race-same'))
  $itemRace=ConcurrentProjects (Project 'item-race-root-a' 'NUM-ITEM-RACE-A' 'draft' @($raceItemA)) (Project 'item-race-root-b' 'NUM-ITEM-RACE-B' 'draft' @($raceItemB)) $admin
  Check (@($itemRace|Where-Object{$_-eq 201}).Count-eq 1-and@($itemRace|Where-Object{$_-eq 409}).Count-eq 1) 'concurrent unique roots same item one 201 one 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id" LIKE ''item-race-root-%'') || '':'' || (SELECT count(*) FROM project_cabinets WHERE "Id" LIKE ''item-race-cab-%'') || '':'' || (SELECT count(*) FROM project_items WHERE "Id"=''item-race-same'');')-eq'1:1:1') 'item race atomic winning graph only'
  $validSegmentCab=Cabinet 'valid-segment-cab';$validSegmentCab.segments=@((Segment 'valid-segment'))
  Check ((Request POST '/api/projects' (Project 'valid-segment-root' 'NUM-VALID-SEGMENT' 'draft' @($validSegmentCab)) $admin).Status-eq 201) 'valid segment graph 201'
  Check ((Sql 'SELECT count(*) FROM cabinet_segments WHERE "Id"=''valid-segment'';')-eq'1') 'valid segment stored'
  $nullSegmentsCab=Cabinet 'null-segments-cab';$nullSegmentsCab.segments=$null
  Check ((Request POST '/api/projects' (Project 'null-segments-root' 'NUM-NULL-SEGMENTS' 'draft' @($nullSegmentsCab)) $engineer).Status-eq 201) 'null segments 201'
  $emptySegmentsCab=Cabinet 'empty-segments-cab';$emptySegmentsCab.segments=@()
  Check ((Request POST '/api/projects' (Project 'empty-segments-root' 'NUM-EMPTY-SEGMENTS' 'draft' @($emptySegmentsCab)) $manager).Status-eq 201) 'empty segments 201'
  $caseSegmentCab=Cabinet 'case-segment-cab';$caseSegmentCab.segments=@((Segment 'VALID-SEGMENT'))
  Check ((Request POST '/api/projects' (Project 'case-segment-root' 'NUM-CASE-SEGMENT' 'draft' @($caseSegmentCab)) $admin).Status-eq 201) 'case-variant segment ID 201'

  $sameSegmentCab=Cabinet 'same-segment-cab';$sameSegmentCab.segments=@((Segment 'dup-same-segment'),(Segment 'dup-same-segment'))
  $sameSegmentResult=Request POST '/api/projects' (Project 'dup-same-segment-root' 'NUM-DUP-SAME-SEGMENT' 'draft' @($sameSegmentCab)) $admin
  Check ($sameSegmentResult.Status-eq 409-and$sameSegmentResult.Json.detail-eq'Сегмент шкафа с таким идентификатором уже существует') 'duplicate segment same cabinet 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id"=''dup-same-segment-root'') + (SELECT count(*) FROM project_cabinets WHERE "Id"=''same-segment-cab'') + (SELECT count(*) FROM cabinet_segments WHERE "Id"=''dup-same-segment'');')-eq'0') 'same-cabinet duplicate segment atomic no rows'
  $acrossSegmentA=Cabinet 'segment-across-cab-a';$acrossSegmentA.segments=@((Segment 'dup-across-segment'));$acrossSegmentB=Cabinet 'segment-across-cab-b';$acrossSegmentB.segments=@((Segment 'dup-across-segment'))
  $acrossSegmentResult=Request POST '/api/projects' (Project 'dup-across-segment-root' 'NUM-DUP-ACROSS-SEGMENT' 'draft' @($acrossSegmentA,$acrossSegmentB)) $manager
  Check ($acrossSegmentResult.Status-eq 409-and$acrossSegmentResult.Json.detail-eq'Сегмент шкафа с таким идентификатором уже существует') 'duplicate segment across cabinets 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id"=''dup-across-segment-root'') + (SELECT count(*) FROM project_cabinets WHERE "Id" LIKE ''segment-across-cab-%'') + (SELECT count(*) FROM cabinet_segments WHERE "Id"=''dup-across-segment'');')-eq'0') 'across-cabinet duplicate segment atomic no rows'

  $segmentCab=Cabinet 'segment-source-cab';$segmentCab.segments=@((Segment 'shared-segment'))
  Check ((Request POST '/api/projects' (Project 'segment-source-root' 'NUM-SEG-SOURCE' 'draft' @($segmentCab)) $admin).Status-eq 201) 'existing segment fixture 201'
  $segmentConflictCab=Cabinet 'segment-conflict-cab';$segmentConflictCab.segments=@((Segment 'shared-segment'))
  $segmentConflict=Request POST '/api/projects' (Project 'segment-conflict-root' 'NUM-SEG-CONFLICT' 'draft' @($segmentConflictCab)) $admin
  Check ($segmentConflict.Status-eq 409-and$segmentConflict.Json.detail-eq'Сегмент шкафа с таким идентификатором уже существует') 'existing segment ID stable 409 detail'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id"=''segment-conflict-root'') + (SELECT count(*) FROM project_cabinets WHERE "Id"=''segment-conflict-cab'');')-eq'0') 'existing segment conflict preserves seed and adds no graph'
  Check ((Sql 'SELECT count(*) FROM cabinet_segments WHERE "Id"=''shared-segment'';')-eq'1') 'existing segment seed preserved'
  $raceSegmentA=Cabinet 'segment-race-cab-a';$raceSegmentA.segments=@((Segment 'segment-race-same'));$raceSegmentB=Cabinet 'segment-race-cab-b';$raceSegmentB.segments=@((Segment 'segment-race-same'))
  $segmentRace=ConcurrentProjects (Project 'segment-race-root-a' 'NUM-SEGMENT-RACE-A' 'draft' @($raceSegmentA)) (Project 'segment-race-root-b' 'NUM-SEGMENT-RACE-B' 'draft' @($raceSegmentB)) $admin
  Check (@($segmentRace|Where-Object{$_-eq 201}).Count-eq 1-and@($segmentRace|Where-Object{$_-eq 409}).Count-eq 1) 'concurrent unique roots same segment one 201 one 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id" LIKE ''segment-race-root-%'') || '':'' || (SELECT count(*) FROM project_cabinets WHERE "Id" LIKE ''segment-race-cab-%'') || '':'' || (SELECT count(*) FROM cabinet_segments WHERE "Id"=''segment-race-same'');')-eq'1:1:1') 'segment race atomic winning graph only'

  Check ((Request POST '/api/projects' (Project 'valid-version-root' 'NUM-VALID-VERSION' 'draft' @() @((Version 'valid-version'))) $admin).Status-eq 201) 'valid version graph 201'
  Check ((Sql 'SELECT count(*) FROM project_versions WHERE "Id"=''valid-version'';')-eq'1') 'valid version stored'
  $nullVersions=Project 'null-versions-root' 'NUM-NULL-VERSIONS';$nullVersions.versions=$null
  Check ((Request POST '/api/projects' $nullVersions $engineer).Status-eq 201) 'null versions 201'
  Check ((Request POST '/api/projects' (Project 'empty-versions-root' 'NUM-EMPTY-VERSIONS') $manager).Status-eq 201) 'empty versions 201'
  Check ((Request POST '/api/projects' (Project 'case-version-root' 'NUM-CASE-VERSION' 'draft' @() @((Version 'VALID-VERSION'))) $admin).Status-eq 201) 'case-variant version ID 201'

  $duplicateVersionResult=Request POST '/api/projects' (Project 'duplicate-version-root' 'NUM-DUP-VERSION' 'draft' @() @((Version 'dup-version'),(Version 'dup-version'))) $admin
  Check ($duplicateVersionResult.Status-eq 409-and$duplicateVersionResult.Json.detail-eq'Версия проекта с таким идентификатором уже существует') 'duplicate nested version IDs stable 409 detail'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id"=''duplicate-version-root'') + (SELECT count(*) FROM project_versions WHERE "Id"=''dup-version'');')-eq'0') 'duplicate versions atomic no graph'

  Check ((Request POST '/api/projects' (Project 'version-seed-root' 'NUM-VERSION-SEED' 'draft' @() @((Version 'shared-version'))) $admin).Status-eq 201) 'existing version fixture 201'
  $existingVersionResult=Request POST '/api/projects' (Project 'version-conflict-root' 'NUM-VERSION-CONFLICT' 'draft' @() @((Version 'shared-version'))) $admin
  Check ($existingVersionResult.Status-eq 409-and$existingVersionResult.Json.detail-eq'Версия проекта с таким идентификатором уже существует') 'existing version ID stable 409 detail'
  Check ((Sql 'SELECT count(*) FROM projects WHERE "Id"=''version-conflict-root'';')-eq'0') 'existing version conflict adds no root'
  Check ((Sql 'SELECT count(*) FROM project_versions WHERE "Id"=''shared-version'';')-eq'1') 'existing version seed preserved'

  $versionRace=ConcurrentProjects (Project 'version-race-root-a' 'NUM-VERSION-RACE-A' 'draft' @() @((Version 'version-race-same'))) (Project 'version-race-root-b' 'NUM-VERSION-RACE-B' 'draft' @() @((Version 'version-race-same'))) $admin
  Check (@($versionRace|Where-Object{$_-eq 201}).Count-eq 1-and@($versionRace|Where-Object{$_-eq 409}).Count-eq 1) 'concurrent unique roots same version one 201 one 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id" LIKE ''version-race-root-%'') || '':'' || (SELECT count(*) FROM project_versions WHERE "Id"=''version-race-same'');')-eq'1:1') 'version race atomic winning graph only'

  $snapshotCab=Cabinet 'snapshot-cab';$snapshotCab.items=@((Item 'snapshot-item'))
  Check ((Request POST '/api/projects' (Project 'snapshot-root' 'NUM-SNAPSHOT' 'draft' @($snapshotCab)) $admin).Status-eq 201) 'VERSION-001 snapshot source project 201'
  $snapshotCreate=Request POST '/api/projects/snapshot-root/versions?label=QA%20snapshot' $null $engineer
  Check ($snapshotCreate.Status-eq 200-and@($snapshotCreate.Json).Count-eq 1-and$snapshotCreate.Json[0].label-eq'QA snapshot') 'VERSION-001 snapshot create/read response 200'
  $snapshotRead=Request GET '/api/projects/snapshot-root' $null $manager
  Check ($snapshotRead.Status-eq 200-and@($snapshotRead.Json.versions).Count-eq 1-and$snapshotRead.Json.versions[0].label-eq'QA snapshot') 'VERSION-001 project read returns snapshot'
  Check ($snapshotRead.Json.versions[0].snapshot.cabinets[0].id-eq'snapshot-cab'-and$snapshotRead.Json.versions[0].snapshot.calc.eqBase-eq 10) 'VERSION-001 snapshot payload preserves cabinet and calculation'
  Check ((Sql 'SELECT count(*) FROM project_versions WHERE "Id"=(SELECT "Id" FROM project_versions WHERE "ProjectId"=''snapshot-root'' LIMIT 1);')-eq'1') 'VERSION-001 snapshot persisted once'
  $trigger=@'
CREATE FUNCTION qa_fail_project012() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."Id"='unrelated-project' THEN RAISE EXCEPTION 'forced unrelated'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER qa_fail_project012 BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION qa_fail_project012();
'@
  $trigger | & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -v ON_ERROR_STOP=1 | Out-Null;Check ($LASTEXITCODE-eq 0) 'unrelated trigger installed'
  Check ((Request POST '/api/projects' (Project 'unrelated-project' 'NUM-UNRELATED') $admin).Status-eq 500) 'unrelated DB error remains 500';Check ((Sql 'SELECT count(*) FROM projects WHERE "Id"=''unrelated-project'';')-eq'0') 'unrelated error stores no row'
  "PROJECT-012 PASS: $checks checks"
}
finally {
  if($apiProcess-and-not$apiProcess.HasExited){Stop-Process -Id $apiProcess.Id -Force;Wait-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue}
  if(Test-Path(Join-Path $data 'postmaster.pid')){& "$pgBin\pg_ctl.exe" stop -D $data -m fast -W;for($i=0;$i-lt 50;$i++){& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort -U postgres *> $null;if($LASTEXITCODE-ne 0){break};Start-Sleep -Milliseconds 100}}
  Remove-Item Env:ConnectionStrings__Tkp,Env:Jwt__Key,Env:Jwt__Issuer,Env:Jwt__Audience,Env:Jwt__ExpireMinutes,Env:Cors__AllowedOrigins__0,Env:AllowedHosts,Env:Admin__Enabled,Env:Admin__Email,Env:Admin__Password,Env:ASPNETCORE_URLS,Env:ASPNETCORE_ENVIRONMENT -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 200;if(Test-Path $root){Remove-Item -LiteralPath $root -Recurse -Force}
}

