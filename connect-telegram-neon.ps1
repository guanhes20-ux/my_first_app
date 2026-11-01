# Configure the existing Renta development function. Secrets stay in memory.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Net.Http
$client = New-Object System.Net.Http.HttpClient
$client.Timeout = [TimeSpan]::FromSeconds(45)
$base = 'https://console.neon.tech/api/v2/projects/noisy-heart-11148374/branches/br-silent-cloud-bad4q8g3/functions/rentadev'
$stage = 'reading credentials'

function Read-PrivateValue([string]$Prompt) {
    $secure = Read-Host $Prompt -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr); $secure.Dispose() }
}

function Request-Json([string]$Method, [string]$Uri, [System.Net.Http.HttpContent]$Content, [bool]$Neon) {
    $request = New-Object System.Net.Http.HttpRequestMessage
    $request.Method = New-Object System.Net.Http.HttpMethod($Method)
    $request.RequestUri = [Uri]$Uri
    if ($Neon) { $request.Headers.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $script:neonKey) }
    if ($null -ne $Content) { $request.Content = $Content }
    try {
        $response = $script:client.SendAsync($request).GetAwaiter().GetResult()
        try {
            if (-not $response.IsSuccessStatusCode) { throw 'Remote request rejected' }
            return ($response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json)
        } finally { $response.Dispose() }
    } finally { $request.Dispose() }
}

function Json-Content($Value) {
    return (New-Object System.Net.Http.StringContent(($Value | ConvertTo-Json -Depth 8 -Compress), [Text.Encoding]::UTF8, 'application/json'))
}

try {
    Write-Host 'Connect Telegram to Renta on Neon. Do not paste keys into chat.'
    $script:neonKey = (Read-PrivateValue 'Paste Neon API key, then Enter').Trim()
    $botToken = (Read-PrivateValue 'Paste Telegram bot token, then Enter').Trim()
    if (-not $script:neonKey -or $botToken -notmatch '^\d+:[A-Za-z0-9_-]+$') { throw 'Missing or invalid credentials' }

    $stage = 'checking the Telegram bot'
    $telegram = 'https://api.telegram.org/bot' + $botToken + '/'
    $me = Request-Json 'POST' ($telegram + 'getMe') (Json-Content @{}) $false
    if (-not $me.ok -or $me.result.username -ine 'Renta_Car_777_bot') { throw 'Unexpected bot username' }

    $stage = 'reading the Neon function'
    $function = Request-Json 'GET' $base $null $true
    $publicUrl = ([string]$function.invocation_url).TrimEnd('/')
    if (-not $publicUrl.StartsWith('https://')) { throw 'Missing invocation URL' }

    $random = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($random) } finally { $rng.Dispose() }
    $webhookSecret = [Convert]::ToBase64String($random).TrimEnd('=').Replace('+','-').Replace('/','_')
    $environment = @{
        TELEGRAM_BOT_TOKEN = $botToken
        TELEGRAM_WEBHOOK_SECRET = $webhookSecret
        BOT_USERNAME = [string]$me.result.username
        PUBLIC_URL = $publicUrl
    } | ConvertTo-Json -Compress

    $stage = 'saving private variables in Neon'
    $multipart = New-Object System.Net.Http.MultipartFormDataContent
    $multipart.Add((New-Object System.Net.Http.StringContent($environment, [Text.Encoding]::UTF8)), 'environment')
    $deployment = Request-Json 'POST' ($base + '/deployments') $multipart $true
    Write-Host 'Settings sent. Waiting for Neon...'
    $ready = $false
    for ($i = 0; $i -lt 60; $i++) {
        $function = Request-Json 'GET' $base $null $true
        if ($function.current_deployment.id -eq $deployment.id) {
            if ($function.current_deployment.status -eq 'failed') { throw 'Neon deployment failed' }
            if ($function.current_deployment.status -eq 'completed') { $ready = $true; break }
        }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'Neon deployment timeout' }

    $stage = 'registering the Telegram webhook'
    $webhookUrl = $publicUrl + '/telegram/webhook'
    $set = Request-Json 'POST' ($telegram + 'setWebhook') (Json-Content @{
        url = $webhookUrl
        secret_token = $webhookSecret
        allowed_updates = @('message')
        drop_pending_updates = $false
    }) $false
    if (-not $set.ok) { throw 'Webhook registration failed' }
    $info = Request-Json 'POST' ($telegram + 'getWebhookInfo') (Json-Content @{}) $false
    if (-not $info.ok -or $info.result.url -ne $webhookUrl) { throw 'Webhook verification failed' }
    Write-Host 'SUCCESS: Telegram webhook configured.' -ForegroundColor Green
    Write-Host ('Site: ' + $publicUrl)
    Write-Host 'Stop the old Python polling bot. Choose a car and dates on the site again, then open Telegram.'
} catch {
    Write-Host ('Failed while ' + $stage + '. Check your API key permissions and the bot token. No credentials were printed.') -ForegroundColor Red
    exit 1
} finally {
    $script:neonKey = $null
    $botToken = $null
    $webhookSecret = $null
    $environment = $null
    $client.Dispose()
}
