$ErrorActionPreference = 'Stop'

$project = Join-Path $PSScriptRoot '..\backend\TkpApi\TkpApi.csproj'
$connection = Read-Host 'Строка подключения к отдельной локальной PostgreSQL БД' -MaskInput
if ([string]::IsNullOrWhiteSpace($connection)) {
    throw 'Строка подключения обязательна.'
}

$jwtKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))

dotnet user-secrets set 'ConnectionStrings:Tkp' $connection --project $project | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Не удалось сохранить ConnectionStrings:Tkp.' }
dotnet user-secrets set 'Jwt:Key' $jwtKey --project $project | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Не удалось сохранить Jwt:Key.' }

$bootstrap = Read-Host 'Включить создание первого администратора? (y/N)'
if ($bootstrap -match '^(?i:y|yes|д|да)$') {
    $email = Read-Host 'Email администратора'
    $password = Read-Host 'Новый пароль администратора' -MaskInput
    dotnet user-secrets set 'Admin:Enabled' 'true' --project $project | Out-Null
    dotnet user-secrets set 'Admin:Email' $email --project $project | Out-Null
    dotnet user-secrets set 'Admin:Password' $password --project $project | Out-Null
} else {
    dotnet user-secrets set 'Admin:Enabled' 'false' --project $project | Out-Null
}

Write-Host 'User Secrets сохранены вне репозитория. Значения не выведены.'
Write-Host 'Нажмите F5 и выберите C# API (backend/TkpApi).'
