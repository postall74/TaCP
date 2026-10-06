param([string]$ApiRoot)
$ErrorActionPreference='Stop'
$probe=Join-Path $env:TEMP ('tkp-qa-admin-integration-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $probe | Out-Null
$pg='C:/Program Files/PostgreSQL/18/bin'
$suffix=[guid]::NewGuid().ToString('N').Substring(0,8)
$dbs=@{a="rate_a_$suffix";b="rate_b_$suffix";legacy="rate_legacy_$suffix";existing="rate_existing_$suffix"}
$processes=@{}
$checks=0
function Assert($condition,$label){if(!$condition){throw "FAIL: $label"};$script:checks++;Write-Output "PASS: $label"}
function Sql($db,$query){
 $file=Join-Path $probe 'query.sql';[IO.File]::WriteAllText($file,$query)
 $result=& "$pg/psql.exe" -h 127.0.0.1 -p 55486 -U tkp_probe -d $db -v ON_ERROR_STOP=1 -tA -f $file
 if($LASTEXITCODE -ne 0){throw 'SQL failed'}
 return ($result -join "`n").Trim()
}
function Configure($db,$port){
 $env:DOTNET_ENVIRONMENT='Production';$env:ASPNETCORE_ENVIRONMENT='Production'
 $env:URLS="http://127.0.0.1:$port"
 $env:ConnectionStrings__Tkp="Host=127.0.0.1;Port=55486;Database=$db;Username=tkp_probe"
 $env:Jwt__Key=$script:keys[$db];$env:Jwt__Issuer=$db;$env:Jwt__Audience="$db-web"
 $env:AllowedHosts='127.0.0.1';$env:Cors__AllowedOrigins__0='https://rate-probe.example.test'
 $env:Admin__Enabled='true';$env:Admin__Email='admin@example.test';$env:Admin__Password=$script:password
}
function StartApi($db,$port){
 Configure $db $port
 $run=[guid]::NewGuid().ToString('N')
 $proc=Start-Process 'C:/Program Files/dotnet/dotnet.exe' -ArgumentList @(('"'+(Join-Path $ApiRoot 'bin/Release/net8.0/TkpApi.dll')+'"')) -WorkingDirectory $ApiRoot -WindowStyle Hidden -RedirectStandardOutput "$probe/$run.out" -RedirectStandardError "$probe/$run.err" -PassThru
 $script:processes[$db]=$proc
 for($i=0;$i -lt 100;$i++){
  if($proc.HasExited){throw "API exited; see $probe/$run.err"}
  try{ $r=Invoke-WebRequest "http://127.0.0.1:$port/api/health" -TimeoutSec 1; if($r.StatusCode -eq 200){return}}catch{}
  Start-Sleep -Milliseconds 200
 }
 throw 'Startup timeout'
}
function StopApi($db){$p=$script:processes[$db];if($p -and !$p.HasExited){Stop-Process -Id $p.Id;$p.WaitForExit()};$script:processes.Remove($db)}
function Call($port,$method,$path,$token='',$body=$null){
 $args=@{Uri="http://127.0.0.1:$port/api/$path";Method=$method;SkipHttpErrorCheck=$true}
 if($token){$args.Headers=@{Authorization="Bearer $token"}}
 if($null -ne $body){$args.Body=$body;$args.ContentType='application/json'}
 Invoke-WebRequest @args
}
function Login($port,$email='admin@example.test'){
 $r=Call $port POST 'auth/login' '' (@{email=$email;password=$script:password}|ConvertTo-Json)
 Assert ($r.StatusCode -eq 200) "login $port $email"
 ($r.Content|ConvertFrom-Json).token
}
function Rates($port,$token){$r=Call $port GET rates $token;Assert ($r.StatusCode -eq 200) "GET rates $port";return ($r.Content|ConvertFrom-Json)}
function Same($a,$b){foreach($k in @('design','production','software','smr','pnr')){if($a.$k -ne $b.$k){return $false}};return $true}
$keys=@{};foreach($db in $dbs.Values){$keys[$db]=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))}
$password=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))+'7!'
$defaults='{"design":1800,"production":1800,"software":2200,"smr":1800,"pnr":1800}'|ConvertFrom-Json
$aBody='{"design":1234.56789,"production":-9.87654,"software":0,"smr":4567.12345,"pnr":9876.54321}'
$bBody='{"design":3100,"production":3200,"software":3300,"smr":3400,"pnr":3500}'
$db='admin_invariant_'+[guid]::NewGuid().ToString('N').Substring(0,8)
$keys[$db]=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$port=55103;$port2=55104
function State {Sql $db 'SELECT md5(string_agg(t.data,''|'' ORDER BY t.data)) FROM (SELECT row_to_json(u)::text data FROM "AspNetUsers" u UNION ALL SELECT row_to_json(ur)::text FROM "AspNetUserRoles" ur) t;'}
function AdminCount {Sql $db 'SELECT count(*) FROM "AspNetUserRoles" ur JOIN "AspNetRoles" r ON r."Id"=ur."RoleId" WHERE r."NormalizedName"=''ADMIN'';'}
function Register($role){
 $email=[guid]::NewGuid().ToString('N')+'@example.test'
 $r=Call $port POST auth/register $ta (@{email=$email;password=$password;fullName='Probe';position='';phone='';role=$role}|ConvertTo-Json)
 if($r.StatusCode -ne 200){throw 'register failed'}
 return @{id=($r.Content|ConvertFrom-Json).id;email=$email}
}
function Role($id,$role,$token){Call $port PUT "auth/users/$id/role" $token (@{role=$role}|ConvertTo-Json)}
function Pair {
 Sql $db "BEGIN; DELETE FROM `"AspNetUserRoles`" WHERE `"RoleId`" IN (SELECT `"Id`" FROM `"AspNetRoles`" WHERE `"NormalizedName`"='ADMIN'); INSERT INTO `"AspNetUserRoles`" SELECT '$aid', `"Id`" FROM `"AspNetRoles`" WHERE `"NormalizedName`"='ADMIN'; COMMIT;"|Out-Null
 $b=Register admin
 if((AdminCount) -ne '2'){throw 'pair setup failed'}
 return $b.id
}
function Send($client,$portNumber,$method,$id){
 if($method -eq 'PUT'){
  return $client.PutAsync("http://127.0.0.1:$portNumber/api/auth/users/$id/role",[Net.Http.StringContent]::new('{"role":"engineer"}',[Text.Encoding]::UTF8,'application/json'))
 }
 return $client.DeleteAsync("http://127.0.0.1:$portNumber/api/auth/users/$id")
}
function WaitFirstWrite {
 for($i=0;$i -lt 60;$i++){
  if([int](Sql $db "SELECT count(*) FROM pg_stat_activity WHERE datname='$db' AND wait_event='PgSleep';") -gt 0){return}
  Start-Sleep -Milliseconds 30
 }
 throw 'first request did not reach the probe trigger'
}
try {
 & "$pg/createdb.exe" -h 127.0.0.1 -p 55486 -U tkp_probe $db;if($LASTEXITCODE -ne 0){throw 'createdb failed'}
 StartApi $db $port;$processes['first']=$processes[$db];$processes.Remove($db)
 StartApi $db $port2;$processes['second']=$processes[$db];$processes.Remove($db)
 $ta=@(Login $port)[-1];$aid=((Call $port GET auth/me $ta).Content|ConvertFrom-Json).id
 foreach($role in @('manager','engineer')){
  $u=Register $role;$token=@(Login $port $u.email)[-1];$before=State
  Assert ((Role $aid engineer $token).StatusCode -eq 403) "$role PUT 403"
  Assert ((Call $port DELETE "auth/users/$aid" $token).StatusCode -eq 403) "$role DELETE 403"
  Assert ((State) -eq $before) "$role denied without writes"
 }
 $before=State
 Assert ((Role $aid engineer '').StatusCode -eq 401) 'anonymous PUT 401'
 Assert ((Call $port DELETE "auth/users/$aid").StatusCode -eq 401) 'anonymous DELETE 401'
 Assert ((State) -eq $before) 'anonymous no writes'
 Assert ((Role 'unknown-probe' engineer $ta).StatusCode -eq 404) 'PUT unknown 404'
 Assert ((Role $aid engineer $ta).StatusCode -eq 409) 'sole admin self-demotion 409'
 Assert ((Call $port DELETE "auth/users/$aid" $ta).StatusCode -eq 409) 'self-delete 409'
 Assert ((State) -eq $before) '404/409 no writes including concurrency stamps'
 $r=Role $aid admin $ta
 Assert ($r.StatusCode -eq 200 -and (($r.Content|ConvertFrom-Json).roles -contains 'admin')) 'sole admin retaining admin 200'

 # DELETE contract details: unknown/repeat, Identity cascades and domain retention.
 $target=Register engineer;$targetToken=@(Login $port $target.email)[-1]
 $projectId='owned-'+[guid]::NewGuid().ToString('N')
 $projectNumber='QA-'+[guid]::NewGuid().ToString('N').Substring(0,10)
 $projectBody=@{id=$projectId;number=$projectNumber;title='Owner retention';client='QA';contact='';direction=0;status=0;ownerId=$target.id;cabinets=@();versions=@()}|ConvertTo-Json -Depth 5
 Assert ((Call $port POST projects $targetToken $projectBody).StatusCode -eq 201) 'create domain project owned by delete target'
 Sql $db "INSERT INTO `"AspNetUserClaims`" (`"UserId`",`"ClaimType`",`"ClaimValue`") VALUES ('$($target.id)','qa','claim'); INSERT INTO `"AspNetUserLogins`" (`"LoginProvider`",`"ProviderKey`",`"ProviderDisplayName`",`"UserId`") VALUES ('qa','key-$($target.id)','QA','$($target.id)'); INSERT INTO `"AspNetUserTokens`" (`"UserId`",`"LoginProvider`",`"Name`",`"Value`") VALUES ('$($target.id)','qa','token','value');"|Out-Null
 $otherUsersBefore=[int](Sql $db "SELECT count(*) FROM `"AspNetUsers`" WHERE `"Id`" <> '$($target.id)';")
 Assert ((Call $port DELETE 'auth/users/unknown-delete' $ta).StatusCode -eq 404) 'DELETE unknown 404'
 Assert ((Call $port DELETE "auth/users/$($target.id)" $ta).StatusCode -eq 204) 'DELETE other user 204'
 Assert ((Call $port DELETE "auth/users/$($target.id)" $ta).StatusCode -eq 404) 'repeat DELETE 404'
 Assert ((Sql $db "SELECT count(*) FROM `"AspNetUsers`" WHERE `"Id`"='$($target.id)';") -eq '0') 'deleted Identity user removed'
 Assert ((Sql $db "SELECT (SELECT count(*) FROM `"AspNetUserRoles`" WHERE `"UserId`"='$($target.id)')+(SELECT count(*) FROM `"AspNetUserClaims`" WHERE `"UserId`"='$($target.id)')+(SELECT count(*) FROM `"AspNetUserLogins`" WHERE `"UserId`"='$($target.id)')+(SELECT count(*) FROM `"AspNetUserTokens`" WHERE `"UserId`"='$($target.id)');") -eq '0') 'Identity relations cascade'
 Assert ((Sql $db "SELECT count(*) FROM projects WHERE `"Id`"='$projectId' AND `"OwnerId`"='$($target.id)';") -eq '1') 'domain project and OwnerId retained'
 Assert ([int](Sql $db "SELECT count(*) FROM `"AspNetUsers`";") -eq $otherUsersBefore) 'other users retained'

 # A deleted admin JWT remains signature-valid; DB state must still protect the last admin.
 $staleAdmin=Register admin;$staleToken=@(Login $port $staleAdmin.email)[-1]
 Assert ((Call $port DELETE "auth/users/$($staleAdmin.id)" $ta).StatusCode -eq 204) 'delete second admin while primary remains'
 Assert ((Role $aid engineer $staleToken).StatusCode -eq 409) 'stale deleted-admin JWT cannot demote last admin'
 Assert ((Call $port DELETE "auth/users/$aid" $staleToken).StatusCode -eq 409) 'stale deleted-admin JWT cannot delete last admin'
 Assert ((AdminCount) -eq '1') 'stale JWT attempts retain one admin'

 $bid=Pair
 $r=Role $bid manager $ta;$body=$r.Content|ConvertFrom-Json
 Assert ($r.StatusCode -eq 200 -and $body.id -eq $bid -and $body.roles -contains 'manager') 'multiple admins permit demotion with unchanged DTO'
 Assert ((@($body.PSObject.Properties.Name)|Sort-Object) -join ',' -eq 'email,fullName,id,phone,position,roles') 'PUT response fields unchanged'
 Assert ((AdminCount) -eq '1') 'one admin after demotion'
 Assert ((Role $bid 'unrecognized' $ta).StatusCode -eq 200) 'existing unknown-role fallback preserved'
 $before=State
 Assert ((Role $aid engineer $ta).StatusCode -eq 409) 'sequential demotion of remaining admin 409'
 Assert ((State) -eq $before) 'sequential conflict no writes'
 # Pause the first write while it holds the shared transaction locks. This makes
 # acquisition order deterministic across the two independently running APIs.
 Sql $db 'CREATE FUNCTION probe_role_pause() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(1.5); RETURN OLD; END $$; CREATE TRIGGER probe_role_pause BEFORE DELETE ON "AspNetUserRoles" FOR EACH ROW EXECUTE FUNCTION probe_role_pause();'|Out-Null
 $client1=[Net.Http.HttpClient]::new();$client1.DefaultRequestHeaders.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$ta)
 $client2=[Net.Http.HttpClient]::new();$client2.DefaultRequestHeaders.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$ta)
 foreach($mode in @('PUT-PUT','PUT-DELETE','DELETE-PUT')){
  # Temporarily disable the pause during isolated setup to keep it out of timings.
  Sql $db 'ALTER TABLE "AspNetUserRoles" DISABLE TRIGGER probe_role_pause;'|Out-Null
  $bid=Pair
  Sql $db 'ALTER TABLE "AspNetUserRoles" ENABLE TRIGGER probe_role_pause;'|Out-Null
  if($mode -eq 'DELETE-PUT'){$firstMethod='DELETE';$firstId=$bid;$secondMethod='PUT';$secondId=$aid;$expected=204}
  else{$firstMethod='PUT';$firstId=$aid;$secondMethod=if($mode -eq 'PUT-PUT'){'PUT'}else{'DELETE'};$secondId=$bid;$expected=200}
  $first=Send $client1 $port $firstMethod $firstId
  WaitFirstWrite
  $second=Send $client2 $port2 $secondMethod $secondId
  $r1=$first.GetAwaiter().GetResult();$r2=$second.GetAwaiter().GetResult()
  Assert ([int]$r1.StatusCode -eq $expected -and [int]$r2.StatusCode -eq 409) "$mode first succeeds, second 409 across API processes"
  Assert ((AdminCount) -eq '1') "$mode leaves exactly one admin"
  $r1.Dispose();$r2.Dispose()
 }
 $client1.Dispose();$client2.Dispose()
 Sql $db 'DROP TRIGGER probe_role_pause ON "AspNetUserRoles"; DROP FUNCTION probe_role_pause();'|Out-Null
 $bid=Pair
 # Fail assignment after removal has succeeded; transaction must undo both SaveChanges.
 Sql $db "CREATE FUNCTION probe_role_fail() RETURNS trigger LANGUAGE plpgsql AS `$`$ BEGIN IF NEW.`"UserId`" = '$bid' THEN RAISE EXCEPTION 'probe assignment failure'; END IF; RETURN NEW; END `$`$; CREATE TRIGGER probe_role_fail BEFORE INSERT ON `"AspNetUserRoles`" FOR EACH ROW EXECUTE FUNCTION probe_role_fail();"|Out-Null
 $before=State
 Assert ((Role $bid engineer $ta).StatusCode -eq 500) 'injected new-role assignment failure 500'
 Assert ((State) -eq $before) 'assignment failure restores old roles and user stamp'
 Sql $db 'DROP TRIGGER probe_role_fail ON "AspNetUserRoles"; DROP FUNCTION probe_role_fail();'|Out-Null
 # Fail only at commit, after successful remove+add.
 Sql $db "CREATE FUNCTION probe_role_commit_fail() RETURNS trigger LANGUAGE plpgsql AS `$`$ BEGIN IF OLD.`"UserId`" = '$bid' THEN RAISE EXCEPTION 'probe role commit failure'; END IF; RETURN OLD; END `$`$; CREATE CONSTRAINT TRIGGER probe_role_commit_fail AFTER DELETE ON `"AspNetUserRoles`" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION probe_role_commit_fail();"|Out-Null
 $before=State
 Assert ((Role $bid manager $ta).StatusCode -eq 500) 'injected role commit failure 500'
 Assert ((State) -eq $before) 'role commit failure rolls back both SaveChanges'
 Assert ((Call $port DELETE "auth/users/$bid" $ta).StatusCode -eq 500) 'injected DELETE cascade commit failure 500'
 Assert ((State) -eq $before) 'DELETE still rolls back after shared helper change'
 Sql $db 'DROP TRIGGER probe_role_commit_fail ON "AspNetUserRoles"; DROP FUNCTION probe_role_commit_fail();'|Out-Null
 Assert ((Call $port DELETE "auth/users/$bid" $ta).StatusCode -eq 204) 'DELETE succeeds after failed transaction and retains admin'
 Assert ((AdminCount) -eq '1') 'final one admin'
 Write-Output "ADMIN-004 PASS: $checks checks. Evidence $probe; DB $db"
} finally {foreach($name in @($processes.Keys)){StopApi $name};Write-Output "Evidence $probe; disposable DB $db"}
