# JARVIS · Smart App Launcher v3 (anti-fake-AppID)
# Estratégias em ordem:
#   1. Direct .exe paths (Spotify/Discord/Telegram/etc — paths conhecidos)
#   2. Registry Uninstall InstallLocation (Win32 tradicionais)
#   3. Get-StartApps (mas FILTRA Chrome._crx_*, edge://, etc — AppIDs fantasma)
#   4. .lnk no Start Menu
#   5. PATH direto
#   6. NOT_FOUND_USE_WEB <hint> (sinal pro servidor abrir web fallback)
#
# Saída: "STARTED: <nome>" | "NOT_FOUND_USE_WEB <appname>" | "NOT_FOUND"

param([Parameter(Mandatory=$true)][string]$Name)

$ErrorActionPreference = "SilentlyContinue"
$query = $Name.Trim().Trim('"').Trim("'")
$lower = $query.ToLower()

# ─── ALIASES ───
$aliases = @{
    "spotify"        = "Spotify"
    "spotify desktop" = "Spotify"
    "discord"        = "Discord"
    "telegram"       = "Telegram"
    "steam"          = "Steam"
    "epic games"     = "Epic Games Launcher"
    "epic"           = "Epic Games Launcher"
    "chrome"         = "Google Chrome"
    "google chrome"  = "Google Chrome"
    "edge"           = "Microsoft Edge"
    "msedge"         = "Microsoft Edge"
    "microsoft edge" = "Microsoft Edge"
    "firefox"        = "Firefox"
    "brave"          = "Brave"
    "opera"          = "Opera"
    "vscode"         = "Visual Studio Code"
    "vs code"        = "Visual Studio Code"
    "code"           = "Visual Studio Code"
    "obsidian"       = "Obsidian"
    "notion"         = "Notion"
    "figma"          = "Figma"
    "slack"          = "Slack"
    "zoom"           = "Zoom"
    "teams"          = "Microsoft Teams"
    "microsoft teams" = "Microsoft Teams"
    "obs"            = "OBS Studio"
    "obs studio"     = "OBS Studio"
    "calculadora"    = "Calculator"
    "calculator"     = "Calculator"
    "bloco de notas" = "Notepad"
    "notepad"        = "Notepad"
    "paint"          = "Paint"
    "explorador"     = "File Explorer"
    "explorer"       = "File Explorer"
    "onedrive"       = "OneDrive"
    "github desktop" = "GitHub Desktop"
    "postman"        = "Postman"
    "insomnia"       = "Insomnia"
    "docker"         = "Docker Desktop"
    "docker desktop" = "Docker Desktop"
    "whatsapp"       = "WhatsApp"
    "outlook"        = "Outlook"
    "word"           = "Word"
    "excel"          = "Excel"
    "powerpoint"     = "PowerPoint"
    "onenote"        = "OneNote"
    "settings"       = "Settings"
    "configuracoes"  = "Settings"
    "configurações"  = "Settings"
    "terminal"       = "Windows Terminal"
    "windows terminal" = "Windows Terminal"
    "cmd"            = "Command Prompt"
}

$target = if ($aliases.ContainsKey($lower)) { $aliases[$lower] } else { $query }
$targetLower = $target.ToLower()

# ─── PATHS DIRETOS conhecidos (mais confiável que AppX/PWA) ───
# Cada entrada: lista de paths candidatos; primeiro que existir é executado
$directPaths = @{
    "spotify" = @(
        "$env:APPDATA\Spotify\Spotify.exe",
        "$env:LOCALAPPDATA\Microsoft\WindowsApps\Spotify.exe"
    )
    "discord" = @(
        "$env:LOCALAPPDATA\Discord\Update.exe"  # special: needs --processStart
    )
    "telegram" = @(
        "$env:APPDATA\Telegram Desktop\Telegram.exe",
        "$env:LOCALAPPDATA\Telegram Desktop\Telegram.exe"
    )
    "steam" = @(
        "${env:ProgramFiles(x86)}\Steam\Steam.exe",
        "$env:ProgramFiles\Steam\Steam.exe"
    )
    "google chrome" = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
    )
    "microsoft edge" = @(
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    "firefox" = @(
        "$env:ProgramFiles\Mozilla Firefox\firefox.exe",
        "${env:ProgramFiles(x86)}\Mozilla Firefox\firefox.exe"
    )
    "brave" = @(
        "$env:ProgramFiles\BraveSoftware\Brave-Browser\Application\brave.exe",
        "${env:ProgramFiles(x86)}\BraveSoftware\Brave-Browser\Application\brave.exe",
        "$env:LOCALAPPDATA\BraveSoftware\Brave-Browser\Application\brave.exe"
    )
    "visual studio code" = @(
        "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe",
        "$env:ProgramFiles\Microsoft VS Code\Code.exe"
    )
    "obsidian" = @(
        "$env:LOCALAPPDATA\Obsidian\Obsidian.exe",
        "$env:LOCALAPPDATA\Programs\obsidian\Obsidian.exe"
    )
    "notion" = @(
        "$env:LOCALAPPDATA\Programs\Notion\Notion.exe"
    )
    "obs studio" = @(
        "$env:ProgramFiles\obs-studio\bin\64bit\obs64.exe"
    )
    "github desktop" = @(
        "$env:LOCALAPPDATA\GitHubDesktop\GitHubDesktop.exe"
    )
    "zoom" = @(
        "$env:APPDATA\Zoom\bin\Zoom.exe",
        "$env:ProgramFiles\Zoom\bin\Zoom.exe"
    )
    "slack" = @(
        "$env:LOCALAPPDATA\slack\slack.exe"
    )
    "calculator" = @("calc.exe")
    "notepad" = @("notepad.exe")
    "paint" = @("mspaint.exe")
    "file explorer" = @("explorer.exe")
    "command prompt" = @("cmd.exe")
}

# Verifica path direto primeiro
if ($directPaths.ContainsKey($targetLower)) {
    foreach ($p in $directPaths[$targetLower]) {
        # Se contém variável de env, expandir
        $expanded = [Environment]::ExpandEnvironmentVariables($p)
        if (Test-Path $expanded) {
            try {
                # Caso especial: Discord usa Update.exe com flag
                if ($targetLower -eq "discord" -and $expanded -like "*Update.exe") {
                    Start-Process $expanded -ArgumentList "--processStart","Discord.exe" -ErrorAction Stop
                } else {
                    Start-Process $expanded -ErrorAction Stop
                }
                Write-Output "STARTED: $target"
                exit 0
            } catch {}
        }
        # Se for só um nome de exe, tenta via Get-Command
        elseif ($expanded -inotmatch '\\') {
            try {
                $cmd = Get-Command $expanded -ErrorAction Stop
                Start-Process $cmd.Source -ErrorAction Stop
                Write-Output "STARTED: $target"
                exit 0
            } catch {}
        }
    }
}

# ─── Estratégia 2: Registry Uninstall (Win32 tradicionais) ───
$regPaths = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*"
)
foreach ($regPath in $regPaths) {
    $regMatch = Get-ItemProperty $regPath -ErrorAction SilentlyContinue |
               Where-Object { $_.DisplayName -ilike "*$target*" -and $_.InstallLocation } |
               Sort-Object { $_.DisplayName.Length } | Select-Object -First 1
    if ($regMatch -and (Test-Path $regMatch.InstallLocation)) {
        # Procura .exe principal
        $exe = Get-ChildItem -Path $regMatch.InstallLocation -Filter "*.exe" -ErrorAction SilentlyContinue |
               Where-Object { $_.BaseName -ilike "*$($regMatch.DisplayName.Split(' ')[0])*" -or $_.BaseName -ilike "*$target*" } |
               Select-Object -First 1
        if (-not $exe) {
            $exe = Get-ChildItem -Path $regMatch.InstallLocation -Filter "*.exe" -ErrorAction SilentlyContinue |
                   Where-Object { $_.Name -inotmatch '^(unins|setup|update|install|crash)' } |
                   Sort-Object { $_.Length } -Descending | Select-Object -First 1
        }
        if ($exe) {
            try {
                Start-Process $exe.FullName -ErrorAction Stop
                Write-Output "STARTED: $($regMatch.DisplayName)"
                exit 0
            } catch {}
        }
    }
}

# ─── Estratégia 3: Get-StartApps (FILTRANDO fake AppIDs) ───
# Skip:
#   - Chrome._crx_* (extensão Chrome / PWA — não roda via AppsFolder)
#   - Edge web apps que não estão instaladas localmente
#   - Microsoft.* helper packages
$fakeAppIdPattern = '^(Chrome\._crx_|edge://|.*\.PWA\.)'

$apps = Get-StartApps | Where-Object { $_.AppID -inotmatch $fakeAppIdPattern }
if ($apps) {
    # 3a: Exato
    $found = $apps | Where-Object { $_.Name -ieq $target } | Select-Object -First 1
    # 3b: Starts-with
    if (-not $found) {
        $found = $apps | Where-Object { $_.Name -ilike "$target*" } | Sort-Object { $_.Name.Length } | Select-Object -First 1
    }
    # 3c: Contains
    if (-not $found) {
        $found = $apps | Where-Object { $_.Name -ilike "*$target*" } | Sort-Object { $_.Name.Length } | Select-Object -First 1
    }
    if ($found) {
        try {
            Start-Process "shell:AppsFolder\$($found.AppID)" -ErrorAction Stop
            Write-Output "STARTED: $($found.Name)"
            exit 0
        } catch {}
    }
}

# ─── Estratégia 4: .lnk no Start Menu ───
$startMenuPaths = @(
    "$env:APPDATA\Microsoft\Windows\Start Menu\Programs",
    "$env:ProgramData\Microsoft\Windows\Start Menu\Programs",
    "$env:USERPROFILE\Desktop"
)
foreach ($path in $startMenuPaths) {
    if (-not (Test-Path $path)) { continue }
    $shortcut = Get-ChildItem -Path $path -Recurse -Filter "*$target*.lnk" -Depth 4 -ErrorAction SilentlyContinue |
                Sort-Object { $_.BaseName.Length } | Select-Object -First 1
    if ($shortcut) {
        try {
            Start-Process $shortcut.FullName -ErrorAction Stop
            Write-Output "STARTED: $($shortcut.BaseName)"
            exit 0
        } catch {}
    }
}

# ─── Estratégia 5: PATH direto ───
try {
    $cmd = Get-Command $query -ErrorAction Stop
    if ($cmd) {
        Start-Process $cmd.Source -ErrorAction Stop
        Write-Output "STARTED: $query"
        exit 0
    }
} catch {}

# ─── Não achou app nativo — retorna NOT_FOUND_USE_WEB pro servidor abrir web fallback ───
# (servidor pode usar resolveKnownUrl pra abrir spotify web, youtube web, etc.)
Write-Output "NOT_FOUND_USE_WEB $targetLower"
exit 1
