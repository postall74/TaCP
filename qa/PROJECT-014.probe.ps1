$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$root = Join-Path ([IO.Path]::GetTempPath()) ('qa_project014_' + [Guid]::NewGuid().ToString('N'))
$data = Join-Path $root 'pgdata'; $pgLog = Join-Path $root 'postgres.log'
$apiOut = Join-Path $root 'api.out.log'; $apiErr = Join-Path $root 'api.err.log'
$pgPort = 55664; $apiPort = 55364; $db = 'qa_project014'; $base = "http://127.0.0.1:$apiPort"
$adminEmail = 'admin@project014.qa.test'; $adminPassword = 'Qa1!' + [Guid]::NewGuid().ToString('N')
$jwtKey = 'qa-project014-' + [Guid]::NewGuid().ToString('N') + [Guid]::NewGuid().ToString('N')
$apiProcess = $null; $checks = 0; $defects = 0

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
function ConcurrentPuts([string]$pathOne,$one,[string]$pathTwo,$two,[string]$token) {
  $client=[Net.Http.HttpClient]::new(); $client.Timeout=[TimeSpan]::FromSeconds(20)
  $client.DefaultRequestHeaders.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$token)
  $m1=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Put,"$base$pathOne")
  $m2=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Put,"$base$pathTwo")
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
  foreach($role in @('manager','engineer')){$email="$role@project014.qa.test";Check ((Request POST '/api/auth/register' @{email=$email;password='RoleTest1';fullName="QA $role";role=$role} $admin).Status-eq 200) "$role created";$rl=Request POST '/api/auth/login' @{email=$email;password='RoleTest1'};Check ($rl.Status-eq 200-and$rl.Json.token) "$role login";Set-Variable -Name $role -Value $rl.Json.token}

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

  $ownCab=Cabinet 'put-own-cab';$ownCab.items=@((Item 'put-own-item'));$ownCab.segments=@((Segment 'put-own-segment'))
  Check ((Request POST '/api/projects' (Project 'put-own-root' 'NUM-PUT-OWN' 'draft' @($ownCab)) $admin).Status-eq 201) 'PUT own-ID fixture 201'
  $ownReplacement=Cabinet 'put-own-cab';$ownReplacement.name='Own replacement';$ownReplacement.items=@((Item 'put-own-item'));$ownReplacement.items[0].name='Own item replacement';$ownReplacement.items[0].purchase=25;$ownReplacement.segments=@((Segment 'put-own-segment-replaced'))
  $ownPut=Request PUT '/api/projects/put-own-root' (Project 'ignored-path-id' 'NUM-PUT-OWN' 'draft' @($ownReplacement)) $engineer
  "DIAG: own cabinet replacement status=$($ownPut.Status) body=$($ownPut.Text)"
  if($ownPut.Status-eq 200-and$ownPut.Json.id-eq'put-own-root'){Check $true 'own cabinet ID replacement PUT 200'}else{$script:defects++;"CONFIRMED DEFECT: own cabinet ID replacement expected 200, actual $($ownPut.Status)"}
  Check ($ownPut.Json.id-eq'put-own-root'-and@($ownPut.Json.cabinets).Count-eq 1-and$ownPut.Json.cabinets[0].id-eq'put-own-cab'-and$ownPut.Json.cabinets[0].name-eq'Own replacement'-and$ownPut.Json.cabinets[0].items[0].id-eq'put-own-item'-and$ownPut.Json.cabinets[0].items[0].name-eq'Own item replacement'-and$ownPut.Json.cabinets[0].segments[0].id-eq'put-own-segment-replaced') 'first own cabinet/item PUT returns complete route-ID response JSON'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id"=''put-own-root'') || '':'' || (SELECT count(*) FROM project_cabinets WHERE "Id"=''put-own-cab'' AND "ProjectId"=''put-own-root'') || '':'' || (SELECT count(*) FROM project_items WHERE "Id"=''put-own-item'' AND "CabinetId"=''put-own-cab'') || '':'' || (SELECT count(*) FROM cabinet_segments WHERE "Id"=''put-own-segment-replaced'' AND "CabinetId"=''put-own-cab'');')-eq'1:1:1:1') 'first own cabinet/item PUT persists one atomic replacement graph'
  $repeatOwnPut=Request PUT '/api/projects/put-own-root' (Project 'put-own-root' 'NUM-PUT-OWN' 'draft' @($ownReplacement)) $engineer
  if($repeatOwnPut.Status-eq 200){Check $true 'repeated own cabinet PUT 200'}else{$script:defects++;"CONFIRMED DEFECT: repeated own cabinet PUT expected 200, actual $($repeatOwnPut.Status)"}
  $ownRead=Request GET '/api/projects/put-own-root' $null $manager
  if($ownRead.Status-eq 200-and@($ownRead.Json.cabinets).Count-eq 1-and@($ownRead.Json.cabinets[0].segments).Count-eq 1-and$ownRead.Json.cabinets[0].segments[0].id-eq'put-own-segment-replaced'){Check $true 'PROJECT-001 segment persists through own-ID PUT and GET'}else{$script:defects++;"CONFIRMED DEFECT: own-ID PUT did not persist replacement segment"}

  Check ((Request POST '/api/projects' (Project 'segment-put-root' 'NUM-SEGMENT-PUT' 'draft' @((Cabinet 'segment-put-old'))) $admin).Status-eq 201) 'PROJECT-001 distinct-ID segment fixture 201'
  $segmentPutNew=Cabinet 'segment-put-new';$segmentPutNew.segments=@((Segment 'segment-put-persisted'))
  Check ((Request PUT '/api/projects/segment-put-root' (Project 'segment-put-root' 'NUM-SEGMENT-PUT' 'draft' @($segmentPutNew)) $engineer).Status-eq 200) 'PROJECT-001 distinct cabinet PUT 200'
  $segmentPutRead=Request GET '/api/projects/segment-put-root' $null $manager
  Check ($segmentPutRead.Status-eq 200-and$segmentPutRead.Json.cabinets[0].segments[0].id-eq'segment-put-persisted') 'PROJECT-001 segment persists through distinct-ID PUT and GET'
  Check ((Sql 'SELECT count(*) FROM cabinet_segments WHERE "Id"=''segment-put-persisted'';')-eq'1') 'PROJECT-001 segment persisted in SQL'

  $dupPutCabA=Cabinet 'put-dup-cab';$dupPutCabB=Cabinet 'put-dup-cab'
  $duplicatePut=Request PUT '/api/projects/put-own-root' (Project 'put-own-root' 'NUM-PUT-OWN' 'draft' @($dupPutCabA,$dupPutCabB)) $admin
  Check ($duplicatePut.Status-eq 409-and$duplicatePut.Json.detail-eq'Шкаф с таким идентификатором уже существует') 'duplicate cabinet IDs on PUT stable 409 detail'
  Check ((Sql 'SELECT (SELECT count(*) FROM project_cabinets WHERE "ProjectId"=''put-own-root'') || '':'' || (SELECT count(*) FROM cabinet_segments s JOIN project_cabinets c ON s."CabinetId"=c."Id" WHERE c."ProjectId"=''put-own-root'');')-eq'1:1') 'duplicate PUT preserves current graph atomically'

  Check ((Request POST '/api/projects' (Project 'foreign-owner-root' 'NUM-FOREIGN-OWNER' 'draft' @((Cabinet 'foreign-put-cab'))) $admin).Status-eq 201) 'foreign cabinet fixture 201'
  Check ((Request POST '/api/projects' (Project 'foreign-target-root' 'NUM-FOREIGN-TARGET' 'draft' @((Cabinet 'foreign-target-original'))) $admin).Status-eq 201) 'foreign target fixture 201'
  $foreignPut=Request PUT '/api/projects/foreign-target-root' (Project 'foreign-target-root' 'NUM-FOREIGN-TARGET' 'draft' @((Cabinet 'foreign-put-cab'))) $manager
  Check ($foreignPut.Status-eq 409-and$foreignPut.Json.detail-eq'Шкаф с таким идентификатором уже существует') 'foreign cabinet ID on PUT stable 409 detail'
  Check ((Sql 'SELECT (SELECT count(*) FROM project_cabinets WHERE "Id"=''foreign-put-cab'') || '':'' || (SELECT count(*) FROM project_cabinets WHERE "Id"=''foreign-target-original'');')-eq'1:1') 'foreign PUT preserves owner and target graphs'

  Check ((Request POST '/api/projects' (Project 'item-put-target' 'NUM-ITEM-PUT-TARGET' 'draft' @((Cabinet 'item-put-own-cab'))) $admin).Status-eq 201) 'item PUT target fixture 201'
  $itemPutOwn=Cabinet 'item-put-own-cab';$itemPutOwn.items=@((Item 'item-put-unique'))
  Check ((Request PUT '/api/projects/item-put-target' (Project 'wrong-item-put-body-id' 'NUM-ITEM-PUT-TARGET' 'draft' @($itemPutOwn)) $engineer).Status-eq 200) 'unique item with own cabinet PUT 200'
  $itemPutEmpty=Cabinet 'item-put-own-cab';$itemPutEmpty.items=@()
  Check ((Request PUT '/api/projects/item-put-target' (Project 'item-put-target' 'NUM-ITEM-PUT-TARGET' 'draft' @($itemPutEmpty)) $engineer).Status-eq 200) 'empty items PUT 200'
  $itemPutNull=Cabinet 'item-put-own-cab';$itemPutNull.items=$null
  Check ((Request PUT '/api/projects/item-put-target' (Project 'item-put-target' 'NUM-ITEM-PUT-TARGET' 'draft' @($itemPutNull)) $manager).Status-eq 200) 'null items PUT 200'

  $dupItemPutCab=Cabinet 'item-put-own-cab';$dupItemPutCab.items=@((Item 'put-dup-item'),(Item 'put-dup-item'))
  $dupItemPut=Request PUT '/api/projects/item-put-target' (Project 'item-put-target' 'NUM-ITEM-PUT-TARGET' 'draft' @($dupItemPutCab)) $admin
  Check ($dupItemPut.Status-eq 409-and$dupItemPut.Json.detail-eq'Позиция шкафа с таким идентификатором уже существует') 'duplicate LineItem IDs on PUT stable 409 detail'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id"=''item-put-target'') || '':'' || (SELECT count(*) FROM project_cabinets WHERE "Id"=''item-put-own-cab'') || '':'' || (SELECT count(*) FROM project_items WHERE "Id"=''put-dup-item'');')-eq'1:1:0') 'duplicate item PUT preserves target graph atomically'

  $foreignItemSeedCab=Cabinet 'foreign-item-seed-cab';$foreignItemSeedCab.items=@((Item 'foreign-put-item'))
  Check ((Request POST '/api/projects' (Project 'foreign-item-seed-root' 'NUM-FOREIGN-ITEM-SEED' 'draft' @($foreignItemSeedCab)) $admin).Status-eq 201) 'foreign item seed fixture 201'
  $foreignItemPutCab=Cabinet 'item-put-own-cab';$foreignItemPutCab.items=@((Item 'foreign-put-item'))
  $foreignItemPut=Request PUT '/api/projects/item-put-target' (Project 'item-put-target' 'NUM-ITEM-PUT-TARGET' 'draft' @($foreignItemPutCab)) $manager
  Check ($foreignItemPut.Status-eq 409-and$foreignItemPut.Json.detail-eq'Позиция шкафа с таким идентификатором уже существует') 'foreign LineItem ID on PUT stable 409 detail'
  Check ((Sql 'SELECT (SELECT count(*) FROM project_items WHERE "Id"=''foreign-put-item'') || '':'' || (SELECT count(*) FROM project_cabinets WHERE "Id"=''item-put-own-cab'');')-eq'1:1') 'foreign item PUT preserves seed and target cabinet'
  $caseItemPutCab=Cabinet 'item-put-own-cab';$caseItemPutCab.items=@((Item 'FOREIGN-PUT-ITEM'))
  Check ((Request PUT '/api/projects/item-put-target' (Project 'item-put-target' 'NUM-ITEM-PUT-TARGET' 'draft' @($caseItemPutCab)) $admin).Status-eq 200) 'case-variant LineItem ID PUT 200'

  $raceItemPutCabA=Cabinet 'put-item-race-cab-a';$raceItemPutCabA.items=@();$raceItemPutCabB=Cabinet 'put-item-race-cab-b';$raceItemPutCabB.items=@()
  Check ((Request POST '/api/projects' (Project 'put-item-race-root-a' 'NUM-PUT-ITEM-RACE-A' 'draft' @($raceItemPutCabA)) $admin).Status-eq 201) 'PUT item race root A fixture 201'
  Check ((Request POST '/api/projects' (Project 'put-item-race-root-b' 'NUM-PUT-ITEM-RACE-B' 'draft' @($raceItemPutCabB)) $admin).Status-eq 201) 'PUT item race root B fixture 201'
  $raceItemPutCabA.items=@((Item 'put-item-race-same'));$raceItemPutCabB.items=@((Item 'put-item-race-same'))
  $putItemRace=ConcurrentPuts '/api/projects/put-item-race-root-a' (Project 'wrong-race-a' 'NUM-PUT-ITEM-RACE-A' 'draft' @($raceItemPutCabA)) '/api/projects/put-item-race-root-b' (Project 'wrong-race-b' 'NUM-PUT-ITEM-RACE-B' 'draft' @($raceItemPutCabB)) $admin
  Check (@($putItemRace|Where-Object{$_-eq 200}).Count-eq 1-and@($putItemRace|Where-Object{$_-eq 409}).Count-eq 1) 'concurrent PUT same LineItem one 200 one 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM projects WHERE "Id" LIKE ''put-item-race-root-%'') || '':'' || (SELECT count(*) FROM project_cabinets WHERE "Id" LIKE ''put-item-race-cab-%'') || '':'' || (SELECT count(*) FROM project_items WHERE "Id"=''put-item-race-same'');')-eq'2:2:1') 'concurrent item PUT preserves both roots/cabinets and one winning item'

  Check ((Request POST '/api/projects' (Project 'put-shapes-root' 'NUM-PUT-SHAPES') $admin).Status-eq 201) 'PUT shapes fixture 201'
  Check ((Request PUT '/api/projects/put-shapes-root' (Project 'put-shapes-root' 'NUM-PUT-SHAPES' 'draft' @((Cabinet 'put-unique-cab'))) $manager).Status-eq 200) 'unique cabinet PUT 200'
  Check ((Request PUT '/api/projects/put-shapes-root' (Project 'put-shapes-root' 'NUM-PUT-SHAPES' 'draft' @()) $manager).Status-eq 200) 'empty cabinets PUT 200'
  $nullCabinetsPatch=Project 'put-shapes-root' 'NUM-PUT-SHAPES';$nullCabinetsPatch.cabinets=$null
  Check ((Request PUT '/api/projects/put-shapes-root' $nullCabinetsPatch $manager).Status-eq 200) 'null cabinets PUT 200'
  Check ((Request POST '/api/projects' (Project 'case-owner-root' 'NUM-CASE-OWNER' 'draft' @((Cabinet 'case-put-cab'))) $admin).Status-eq 201) 'case cabinet fixture 201'
  Check ((Request PUT '/api/projects/put-shapes-root' (Project 'put-shapes-root' 'NUM-PUT-SHAPES' 'draft' @((Cabinet 'CASE-PUT-CAB'))) $manager).Status-eq 200) 'case-variant cabinet ID PUT 200'

  Check ((Request POST '/api/projects' (Project 'number-put-source' 'NUM-PUT-NUMBER-SOURCE') $admin).Status-eq 201) 'PUT number source fixture 201'
  Check ((Request POST '/api/projects' (Project 'number-put-target' 'NUM-PUT-NUMBER-TARGET' 'draft' @((Cabinet 'number-put-original'))) $admin).Status-eq 201) 'PUT number target fixture 201'
  $numberPut=Request PUT '/api/projects/number-put-target' (Project 'number-put-target' 'NUM-PUT-NUMBER-SOURCE' 'draft' @((Cabinet 'number-put-rejected'))) $admin
  Check ($numberPut.Status-eq 409-and$numberPut.Json.detail-eq'Проект с таким номером уже существует') 'PUT duplicate number stable 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM project_cabinets WHERE "Id"=''number-put-original'') || '':'' || (SELECT count(*) FROM project_cabinets WHERE "Id"=''number-put-rejected'');')-eq'1:0') 'PUT number conflict preserves original graph'

  Check ((Request PUT '/api/projects/missing-put-root' (Project 'missing-put-root' 'NUM-MISSING-PUT') $admin).Status-eq 404) 'missing project PUT 404'
  Check ((Request PUT '/api/projects/put-own-root' (Project 'put-own-root' 'NUM-PUT-OWN')).Status-eq 401) 'anonymous PUT 401'
  try { Invoke-WebRequest -Uri "$base/api/projects/put-own-root" -Method PUT -Headers @{Authorization="Bearer $admin"} -ContentType 'application/json' -Body '{bad json'|Out-Null; $putRawStatus=200 } catch { $putRawStatus=[int]$_.Exception.Response.StatusCode }
  Check ($putRawStatus-eq 400) 'malformed PUT JSON 400'
  $engineerDenied=Request PUT '/api/projects/put-own-root' (Project 'put-own-root' 'NUM-PUT-OWN' 'won' @($ownReplacement)) $engineer
  Check ($engineerDenied.Status-eq 403-and$engineerDenied.Json.detail) 'engineer won PUT forbidden 403 with detail'
  Check ((Sql 'SELECT "Status" FROM projects WHERE "Id"=''put-own-root'';')-eq'0') 'engineer denied PUT preserves draft status'
  Check ((Request PUT '/api/projects/put-own-root' (Project 'put-own-root' 'NUM-PUT-OWN' 'won' @()) $manager).Status-eq 200) 'manager won PUT 200'
  Check ((Request PUT '/api/projects/put-own-root' (Project 'put-own-root' 'NUM-PUT-OWN' 'lost' @()) $admin).Status-eq 200) 'admin lost PUT 200'

  Check ((Request POST '/api/projects' (Project 'put-race-root-a' 'NUM-PUT-RACE-A') $admin).Status-eq 201) 'PUT race root A fixture 201'
  Check ((Request POST '/api/projects' (Project 'put-race-root-b' 'NUM-PUT-RACE-B') $admin).Status-eq 201) 'PUT race root B fixture 201'
  $putRace=ConcurrentPuts '/api/projects/put-race-root-a' (Project 'put-race-root-a' 'NUM-PUT-RACE-A' 'draft' @((Cabinet 'put-race-same'))) '/api/projects/put-race-root-b' (Project 'put-race-root-b' 'NUM-PUT-RACE-B' 'draft' @((Cabinet 'put-race-same'))) $admin
  Check (@($putRace|Where-Object{$_-eq 200}).Count-eq 1-and@($putRace|Where-Object{$_-eq 409}).Count-eq 1) 'concurrent PUT same cabinet one 200 one 409'
  Check ((Sql 'SELECT (SELECT count(*) FROM project_cabinets WHERE "Id"=''put-race-same'') || '':'' || (SELECT count(*) FROM projects WHERE "Id" IN (''put-race-root-a'',''put-race-root-b''));')-eq'1:2') 'concurrent PUT keeps both roots and one winning cabinet'

  $putItemSeedCab=Cabinet 'put-item-seed-cab';$putItemSeedCab.items=@((Item 'put-shared-item'))
  Check ((Request POST '/api/projects' (Project 'put-item-seed-root' 'NUM-PUT-ITEM-SEED' 'draft' @($putItemSeedCab)) $admin).Status-eq 201) 'PUT item 500 seed fixture 201'
  Check ((Request POST '/api/projects' (Project 'put-item-target-root' 'NUM-PUT-ITEM-TARGET' 'draft' @((Cabinet 'put-item-original'))) $admin).Status-eq 201) 'PUT item target fixture 201'
  $putItemConflictCab=Cabinet 'put-item-conflict-cab';$putItemConflictCab.items=@((Item 'put-shared-item'))
  $putItemConflict=Request PUT '/api/projects/put-item-target-root' (Project 'put-item-target-root' 'NUM-PUT-ITEM-TARGET' 'draft' @($putItemConflictCab)) $admin
  Check ($putItemConflict.Status-eq 409-and$putItemConflict.Json.detail-eq'Позиция шкафа с таким идентификатором уже существует') 'nested item conflict on PUT stable 409 detail'
  Check ((Sql 'SELECT count(*) FROM project_cabinets WHERE "Id"=''put-item-original'';')-eq'1') 'nested item 409 preserves original graph'

  $putSegmentSeedCab=Cabinet 'put-segment-seed-cab';$putSegmentSeedCab.segments=@((Segment 'put-shared-segment'))
  Check ((Request POST '/api/projects' (Project 'put-segment-seed-root' 'NUM-PUT-SEG-SEED' 'draft' @($putSegmentSeedCab)) $admin).Status-eq 201) 'PUT segment 500 seed fixture 201'
  Check ((Request POST '/api/projects' (Project 'put-segment-target-root' 'NUM-PUT-SEG-TARGET' 'draft' @((Cabinet 'put-segment-original'))) $admin).Status-eq 201) 'PUT segment target fixture 201'
  $putSegmentConflictCab=Cabinet 'put-segment-conflict-cab';$putSegmentConflictCab.segments=@((Segment 'put-shared-segment'))
  Check ((Request PUT '/api/projects/put-segment-target-root' (Project 'put-segment-target-root' 'NUM-PUT-SEG-TARGET' 'draft' @($putSegmentConflictCab)) $admin).Status-eq 500) 'nested segment conflict on PUT remains 500'
  Check ((Sql 'SELECT count(*) FROM project_cabinets WHERE "Id"=''put-segment-original'';')-eq'1') 'nested segment 500 preserves original graph'

  Check ((Request POST '/api/projects' (Project 'unrelated-update-root' 'NUM-UNRELATED-UPDATE' 'draft' @((Cabinet 'unrelated-update-original'))) $admin).Status-eq 201) 'unrelated PUT trigger fixture 201'
  $updateTrigger=@'
CREATE FUNCTION qa_fail_update_project014() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."Id"='unrelated-update-root' THEN RAISE EXCEPTION 'forced unrelated update'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER qa_fail_update_project014 BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION qa_fail_update_project014();
'@
  $updateTrigger | & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -v ON_ERROR_STOP=1 | Out-Null;Check ($LASTEXITCODE-eq 0) 'unrelated PUT trigger installed'
  Check ((Request PUT '/api/projects/unrelated-update-root' (Project 'unrelated-update-root' 'NUM-UNRELATED-UPDATE' 'draft' @((Cabinet 'unrelated-update-rejected'))) $admin).Status-eq 500) 'unrelated PUT DB error remains 500'
  Check ((Sql 'SELECT (SELECT count(*) FROM project_cabinets WHERE "Id"=''unrelated-update-original'') || '':'' || (SELECT count(*) FROM project_cabinets WHERE "Id"=''unrelated-update-rejected'');')-eq'1:0') 'unrelated PUT 500 preserves original graph'
  $trigger=@'
CREATE FUNCTION qa_fail_project014() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."Id"='unrelated-project' THEN RAISE EXCEPTION 'forced unrelated'; END IF; RETURN NEW; END; $$;
CREATE TRIGGER qa_fail_project014 BEFORE INSERT ON projects FOR EACH ROW EXECUTE FUNCTION qa_fail_project014();
'@
  $trigger | & "$pgBin\psql.exe" -h 127.0.0.1 -p $pgPort -U postgres -d $db -v ON_ERROR_STOP=1 | Out-Null;Check ($LASTEXITCODE-eq 0) 'unrelated trigger installed'
  Check ((Request POST '/api/projects' (Project 'unrelated-project' 'NUM-UNRELATED') $admin).Status-eq 500) 'unrelated DB error remains 500';Check ((Sql 'SELECT count(*) FROM projects WHERE "Id"=''unrelated-project'';')-eq'0') 'unrelated error stores no row'
  "PROJECT-014 COMPLETE: $checks passing checks, $defects confirmed defects"
  if($defects-gt 0){throw "PROJECT-014 FAILED: $defects confirmed defect(s)"}
}
finally {
  if($apiProcess-and-not$apiProcess.HasExited){Stop-Process -Id $apiProcess.Id -Force;Wait-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue}
  if(Test-Path(Join-Path $data 'postmaster.pid')){& "$pgBin\pg_ctl.exe" stop -D $data -m fast -W;for($i=0;$i-lt 50;$i++){& "$pgBin\pg_isready.exe" -h 127.0.0.1 -p $pgPort -U postgres *> $null;if($LASTEXITCODE-ne 0){break};Start-Sleep -Milliseconds 100}}
  Remove-Item Env:ConnectionStrings__Tkp,Env:Jwt__Key,Env:Jwt__Issuer,Env:Jwt__Audience,Env:Jwt__ExpireMinutes,Env:Cors__AllowedOrigins__0,Env:AllowedHosts,Env:Admin__Enabled,Env:Admin__Email,Env:Admin__Password,Env:ASPNETCORE_URLS,Env:ASPNETCORE_ENVIRONMENT -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 200;if(Test-Path $root){Remove-Item -LiteralPath $root -Recurse -Force}
}

