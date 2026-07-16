param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,

  [string]$User1Nickname = ([char]0x6211),
  [string]$User1Alias = 'person-one',
  [string]$User2Nickname = ([char]0x5979),
  [string]$User2Alias = 'person-two'
)

$ErrorActionPreference = 'Stop'

function Read-SecretText([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

function Read-ConfirmedPassword([string]$Label) {
  $password = Read-SecretText "$Label (at least 16 characters)"
  $confirmation = Read-SecretText "Repeat $Label"
  if ($password -cne $confirmation) {
    throw "$Label entries do not match"
  }
  if ($password.Length -lt 16) {
    throw "$Label must contain at least 16 characters"
  }
  return $password
}

$npx = Get-Command npx -ErrorAction Stop
$projectUrl = "https://$ProjectRef.supabase.co"

Write-Host 'Reading project configuration. Admin keys will not be displayed or written to disk.'
$keyJson = & $npx.Source supabase projects api-keys `
  --project-ref $ProjectRef `
  --reveal `
  --output json 2>$null | Out-String
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to read Supabase API keys. Run npx supabase login first.'
}

$keys = $keyJson | ConvertFrom-Json
$secretKey = ($keys | Where-Object {
    $_.type -eq 'secret' -and $_.name -eq 'default'
  } | Select-Object -First 1).api_key
if (-not $secretKey -or $secretKey -notmatch '^sb_secret_') {
  throw 'The project does not have an available default secret key.'
}

$password1 = Read-ConfirmedPassword "Password for $User1Nickname"
$password2 = Read-ConfirmedPassword "Password for $User2Nickname"
if ($password1 -ceq $password2) {
  throw 'The two accounts must use different passwords.'
}

try {
  $env:SUPABASE_URL = $projectUrl
  $env:SUPABASE_SERVICE_ROLE_KEY = $secretKey
  $env:COUPLE_USER_1_EMAIL = "person-one@$ProjectRef.invalid"
  $env:COUPLE_USER_1_PASSWORD = $password1
  $env:COUPLE_USER_1_NICKNAME = $User1Nickname
  $env:COUPLE_USER_1_ALIAS = $User1Alias
  $env:COUPLE_USER_2_EMAIL = "person-two@$ProjectRef.invalid"
  $env:COUPLE_USER_2_PASSWORD = $password2
  $env:COUPLE_USER_2_NICKNAME = $User2Nickname
  $env:COUPLE_USER_2_ALIAS = $User2Alias

  npm run bootstrap:users
  if ($LASTEXITCODE -ne 0) {
    throw 'Two-account initialization failed.'
  }
}
finally {
  $secretKey = $null
  $password1 = $null
  $password2 = $null
  @(
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'COUPLE_USER_1_EMAIL',
    'COUPLE_USER_1_PASSWORD',
    'COUPLE_USER_1_NICKNAME',
    'COUPLE_USER_1_ALIAS',
    'COUPLE_USER_2_EMAIL',
    'COUPLE_USER_2_PASSWORD',
    'COUPLE_USER_2_NICKNAME',
    'COUPLE_USER_2_ALIAS'
  ) | ForEach-Object {
    Remove-Item "Env:$_" -ErrorAction SilentlyContinue
  }
}

Write-Host 'Account initialization finished. Passwords and admin keys were cleared from this process.'
