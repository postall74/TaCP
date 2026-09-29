$ErrorActionPreference = 'Stop'

$secretsPath = Join-Path $env:APPDATA 'Microsoft\UserSecrets\TkpApi-local-development\secrets.json'
if (-not (Test-Path -LiteralPath $secretsPath)) {
    throw 'Local API configuration is missing. Run Terminal > Run Task > configure-api-dev, then press F5 again.'
}

$secrets = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json
$names = @($secrets.PSObject.Properties.Name)
$missing = @('ConnectionStrings:Tkp', 'Jwt:Key') | Where-Object { $_ -notin $names }
if ($missing.Count -gt 0) {
    throw ('Required User Secrets are missing: ' + ($missing -join ', ') + '. Run Terminal > Run Task > configure-api-dev.')
}

Write-Host 'Local runtime-config-v1 is present. Secret values are not printed.'
