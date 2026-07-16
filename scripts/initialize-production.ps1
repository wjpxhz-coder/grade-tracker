param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-z0-9]{20}$')]
  [string]$ProjectRef,

  [string]$User1Nickname = '我',
  [string]$User1Alias = 'person-one',
  [string]$User2Nickname = '她',
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
  $password = Read-SecretText "$Label（至少 16 位）"
  $confirmation = Read-SecretText "再次输入 $Label"
  if ($password -cne $confirmation) {
    throw "$Label 两次输入不一致"
  }
  if ($password.Length -lt 16) {
    throw "$Label 必须至少 16 位"
  }
  return $password
}

$npx = Get-Command npx -ErrorAction Stop
$projectUrl = "https://$ProjectRef.supabase.co"

Write-Host '正在读取项目配置；管理员密钥不会显示或写入文件。'
$keyJson = & $npx.Source supabase projects api-keys `
  --project-ref $ProjectRef `
  --reveal `
  --output json 2>$null | Out-String
if ($LASTEXITCODE -ne 0) {
  throw '无法读取 Supabase API keys；请先运行 npx supabase login'
}

$keys = $keyJson | ConvertFrom-Json
$secretKey = ($keys | Where-Object {
    $_.type -eq 'secret' -and $_.name -eq 'default'
  } | Select-Object -First 1).api_key
if (-not $secretKey -or $secretKey -notmatch '^sb_secret_') {
  throw '项目中没有可用的 default secret key'
}

$password1 = Read-ConfirmedPassword "$User1Nickname 的登录密码"
$password2 = Read-ConfirmedPassword "$User2Nickname 的登录密码"
if ($password1 -ceq $password2) {
  throw '两个账号必须使用不同密码'
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
    throw '双账号初始化失败'
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

Write-Host '账号初始化完成；密码和管理员密钥已从当前进程清理。'
