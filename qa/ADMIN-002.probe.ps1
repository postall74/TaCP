param([string]$ApiRoot)
$ErrorActionPreference='Stop'
$probe=Join-Path $env:TEMP ('tkp-qa-admin002-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $probe | Out-Null
$pg='C:/Program Files/PostgreSQL/18/bin'
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
$keys=@{}
$password=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))+'7!'
$db='qa_admin_restore_'+[guid]::NewGuid().ToString('N').Substring(0,8)
$keys[$db]=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))
$port=55102
function State { Sql $db 'SELECT md5(coalesce((SELECT string_agg(row_to_json(e)::text, ''|'' ORDER BY "Id") FROM equipment_catalog e),'''') || coalesce((SELECT string_agg(row_to_json(d)::text, ''|'' ORDER BY "Id") FROM deleted_equipment d),''''));' }
function AddDeleted($id,$sku){
 $body=@{id=$id;sku=$sku;name="Snapshot $id";brand='Probe Brand';category='Probe Category';direction='nku';unit='piece';purchase=123.45;ratedCurrent=16.75;attrs='{"poles":3,"note":"snapshot"}'}|ConvertTo-Json
 $r=Call $port POST catalog $ta $body
 Assert ($r.StatusCode -eq 201) "create $id"
 Assert ((Call $port DELETE "catalog/$id" $ta).StatusCode -eq 204) "delete $id"
 return ($r.Content|ConvertFrom-Json)
}
function Restore($id,$token){Call $port POST "catalog/$id/restore" $token}
try{
 & "$pg/createdb.exe" -h 127.0.0.1 -p 55486 -U tkp_probe $db
 if($LASTEXITCODE -ne 0){throw 'create DB failed'}
 StartApi $db $port
 $ta=@(Login $port)[-1]
 $snapshot=@(AddDeleted 'probe-main' 'Probe-Main-Sku')[-1]
 $deleted=Call $port GET catalog/deleted $ta
 Assert (@($deleted.Content|ConvertFrom-Json|Where-Object id -eq 'probe-main').Count -eq 1) 'deleted list contains snapshot'
 foreach($role in @('manager','engineer')){
  $body=@{email="$role@example.test";password=$password;fullName='Probe';position='';phone='';role=$role}|ConvertTo-Json
  Assert ((Call $port POST auth/register $ta $body).StatusCode -eq 200) "create $role"
  $token=@(Login $port "$role@example.test")[-1];$before=State
  Assert ((Restore 'probe-main' $token).StatusCode -eq 403) "$role restore 403"
  Assert ((State) -eq $before) "$role no writes"
 }
 $before=State
 Assert ((Restore 'probe-main' '').StatusCode -eq 401) 'anonymous restore 401'
 Assert ((State) -eq $before) 'anonymous no writes'
 $r=Restore 'probe-main' $ta
 Assert ($r.StatusCode -eq 204 -and [string]::IsNullOrEmpty($r.Content)) 'restore 204 empty body'
 $catalog=(Call $port GET catalog $ta).Content|ConvertFrom-Json
 $restored=@($catalog|Where-Object id -eq 'probe-main')[0]
 foreach($field in @('id','sku','name','brand','category','direction','unit','purchase','ratedCurrent','attrs')){
  Assert ($restored.$field -eq $snapshot.$field) "snapshot preserved: $field"
 }
 Assert ((Sql $db 'SELECT count(*) FROM deleted_equipment WHERE "Id"=''probe-main'';') -eq '0') 'tombstone removed'
 $before=State
 Assert ((Restore 'probe-main' $ta).StatusCode -eq 204) 'repeat restore 204'
 Assert ((State) -eq $before) 'repeat leaves catalog unchanged'
 Assert ((Restore 'probe-unknown' $ta).StatusCode -eq 404) 'unknown 404'
 Assert ((State) -eq $before) 'unknown no writes'
 $nullSnapshot=@(AddDeleted 'probe-nullattrs' 'Probe-Null-Attrs')[-1]
 # Empty snapshot Attrs remains empty (delete normalizes original null to empty).
 Sql $db 'UPDATE deleted_equipment SET "Attrs"='''' WHERE "Id"=''probe-nullattrs'';' | Out-Null
 Assert ((Restore 'probe-nullattrs' $ta).StatusCode -eq 204) 'empty attrs restore'
 Assert ((Sql $db 'SELECT "Attrs"='''' FROM equipment_catalog WHERE "Id"=''probe-nullattrs'';') -eq 't') 'empty attrs preserved'
 foreach($kind in @('id','sku')){
  $id="probe-conflict-$kind"
  $unused=@(AddDeleted $id "Probe-Conflict-$kind")[-1]
  $activeId=if($kind -eq 'id'){$id}else{"$id-other"}
  $activeSku=if($kind -eq 'id'){'Different-Active-Sku'}else{'PROBE-CONFLICT-SKU'}
  Sql $db "INSERT INTO equipment_catalog SELECT '$activeId', '$activeSku', 'Active other snapshot', `"Brand`", `"Category`", `"Direction`", `"Unit`", `"Purchase`", `"RatedCurrent`", `"Attrs`" FROM deleted_equipment WHERE `"Id`"='$id';" | Out-Null
  $before=State
  Assert ((Restore $id $ta).StatusCode -eq 409) "$kind conflict 409"
  Assert ((State) -eq $before) "$kind conflict preserves both tables"
 }
 $unused=@(AddDeleted 'probe-concurrent' 'Probe-Concurrent')[-1]
 $client=[Net.Http.HttpClient]::new()
 $client.DefaultRequestHeaders.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer',$ta)
 $pending=@(1..12|ForEach-Object {$client.PostAsync("http://127.0.0.1:$port/api/catalog/probe-concurrent/restore",$null)})
 foreach($task in $pending){$r=$task.GetAwaiter().GetResult();if([int]$r.StatusCode -ne 204){throw 'concurrent restore failed'};$r.Dispose()}
 Assert ((Sql $db 'SELECT count(*) FROM equipment_catalog WHERE "Id"=''probe-concurrent'';') -eq '1') '12 concurrent restores one active record'
 Assert ((Sql $db 'SELECT count(*) FROM deleted_equipment WHERE "Id"=''probe-concurrent'';') -eq '0') 'concurrent restore removes tomb'
 $unused=@(AddDeleted 'probe-race-a' 'Probe-Race')[-1]
 Sql $db 'INSERT INTO deleted_equipment SELECT ''probe-race-b'', ''PROBE-RACE'', "Name", "Brand", "Category", "Direction", "Unit", "Purchase", "RatedCurrent", "Attrs", "DeletedAt", "DeletedBy" FROM deleted_equipment WHERE "Id"=''probe-race-a'';'|Out-Null
 $tasks=@($client.PostAsync("http://127.0.0.1:$port/api/catalog/probe-race-a/restore",$null),$client.PostAsync("http://127.0.0.1:$port/api/catalog/probe-race-b/restore",$null))
 $codes=@(foreach($task in $tasks){$r=$task.GetAwaiter().GetResult();[int]$r.StatusCode;$r.Dispose()})
 Assert (($codes|Sort-Object) -join ',' -eq '204,409') 'concurrent case-insensitive SKU race returns 204/409'
 Assert ((Sql $db 'SELECT count(*) FROM equipment_catalog WHERE lower("Sku")=''probe-race'';') -eq '1') 'one winner in catalog'
 Assert ((Sql $db 'SELECT count(*) FROM deleted_equipment WHERE lower("Sku")=''probe-race'';') -eq '1') 'loser retained in trash'
 $client.Dispose()
 $unused=@(AddDeleted 'probe-fault' 'Probe-Fault')[-1]
 Sql $db 'CREATE FUNCTION probe_fail_restore() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF OLD."Id" = ''probe-fault'' THEN RAISE EXCEPTION ''probe deferred commit failure''; END IF; RETURN OLD; END $$; CREATE CONSTRAINT TRIGGER probe_commit_failure AFTER DELETE ON deleted_equipment DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION probe_fail_restore();' | Out-Null
 $before=State
 Assert ((Restore 'probe-fault' $ta).StatusCode -eq 500) 'injected commit failure 500'
 Assert ((State) -eq $before) 'commit failure rolls back both tables exactly'
 Sql $db 'DROP TRIGGER probe_commit_failure ON deleted_equipment; DROP FUNCTION probe_fail_restore();'|Out-Null
 Assert ((Restore 'probe-fault' $ta).StatusCode -eq 204) 'restore succeeds after probe failure removed'
 Write-Output "ADMIN-002 PASS: $checks checks. DB $db; evidence $probe"
}finally{foreach($name in @($processes.Keys)){StopApi $name};Write-Output "Evidence $probe; disposable DB $db"}
