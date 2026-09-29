$ErrorActionPreference = 'Stop'

$project = Join-Path $PSScriptRoot '..\backend\TkpApi\TkpApi.csproj'
$connectionSecure = Read-Host 'Connection string for a dedicated local PostgreSQL database' -AsSecureString
$connectionPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($connectionSecure)
try {
    $connection = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($connectionPtr)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($connectionPtr)
}
if ([string]::IsNullOrWhiteSpace($connection)) {
    throw 'Connection string is required.'
}

$jwtKey = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(48))

dotnet user-secrets set 'ConnectionStrings:Tkp' $connection --project $project | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to save ConnectionStrings:Tkp.' }
dotnet user-secrets set 'Jwt:Key' $jwtKey --project $project | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Failed to save Jwt:Key.' }

$bootstrap = Read-Host 'Enable first administrator bootstrap? (y/N)'
if ($bootstrap -match '^(?i:y|yes)$') {
    $email = Read-Host 'Administrator email'
    $passwordSecure = Read-Host 'New administrator password' -AsSecureString
    $passwordPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
    try {
        $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPtr)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPtr)
    }
    dotnet user-secrets set 'Admin:Enabled' 'true' --project $project | Out-Null
    dotnet user-secrets set 'Admin:Email' $email --project $project | Out-Null
    dotnet user-secrets set 'Admin:Password' $password --project $project | Out-Null
} else {
    dotnet user-secrets set 'Admin:Enabled' 'false' --project $project | Out-Null
}

Write-Host 'User Secrets were saved outside the repository. Values were not printed.'
Write-Host 'Press F5 and select C# API (backend/TkpApi).'
