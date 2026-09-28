$ErrorActionPreference = 'Stop'

$secretsPath = Join-Path $env:APPDATA 'Microsoft\UserSecrets\TkpApi-local-development\secrets.json'
if (-not (Test-Path -LiteralPath $secretsPath)) {
    throw 'Локальная конфигурация API отсутствует. Выполните Terminal > Run Task > configure-api-dev, затем повторите F5.'
}

$secrets = Get-Content -LiteralPath $secretsPath -Raw | ConvertFrom-Json
$names = @($secrets.PSObject.Properties.Name)
$missing = @('ConnectionStrings:Tkp', 'Jwt:Key') | Where-Object { $_ -notin $names }
if ($missing.Count -gt 0) {
    throw ('Не заданы обязательные User Secrets: ' + ($missing -join ', ') + '. Выполните Terminal > Run Task > configure-api-dev.')
}

Write-Host 'Локальная runtime-config-v1 найдена. Значения секретов не выводятся.'
