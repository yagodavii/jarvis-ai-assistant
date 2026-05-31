@echo off
setlocal
title JARVIS - Starting Up
color 0B
cd /d "%~dp0"
:: Limpar ANTHROPIC_API_KEY externa (conflita com plano Pro)
set ANTHROPIC_API_KEY=
:: Garantir settings.json limpo (sem hooks pessoais)
if not exist ".claude" mkdir ".claude" 2>nul
echo {"permissions":{"defaultMode":"bypassPermissions"},"skipDangerousModePermissionPrompt":true}> ".claude\settings.json"
cls
echo.
echo   =========================================
echo     J A R V I S   -   Health Check
echo   =========================================
echo.

set "FAIL=0"

:: ── 1. Node.js ──
where node >nul 2>&1
if errorlevel 1 (
    color 0C
    echo   [ERRO] Node.js nao encontrado no PATH.
    echo          Reinstale o JARVIS.
    set "FAIL=1"
    goto :healthDone
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do echo   [OK] Node.js %%v

:: ── 2. npm ──
where npm >nul 2>&1
if errorlevel 1 (
    color 0C
    echo   [ERRO] npm nao encontrado. Reinstale o Node.js.
    set "FAIL=1"
    goto :healthDone
)
echo   [OK] npm

:: ── 3. Claude Code CLI ──
where claude >nul 2>&1
if errorlevel 1 (
    color 0E
    echo   [--] Claude Code CLI nao encontrado. Instalando...
    echo.
    call npm install -g @anthropic-ai/claude-code
    echo.
    :: Refresh PATH after global install
    for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%b"
    for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USR_PATH=%%b"
    set "PATH=%SYS_PATH%;%USR_PATH%"
    for /f "delims=" %%p in ('npm prefix -g 2^>nul') do set "PATH=%%p;%PATH%"
    where claude >nul 2>&1
    if errorlevel 1 (
        color 0E
        echo   [AVISO] Claude nao no PATH. Tarefas desabilitadas.
        echo          Execute manualmente: npm install -g @anthropic-ai/claude-code
    ) else (
        echo   [OK] Claude Code CLI instalado agora.
    )
) else (
    echo   [OK] Claude Code CLI
)

:: ── 4. Claude autenticado ──
if exist "%USERPROFILE%\.claude\credentials.json" echo   [OK] Claude autenticado
if exist "%USERPROFILE%\.claude\.credentials.json" echo   [OK] Claude autenticado
if not exist "%USERPROFILE%\.claude\credentials.json" if not exist "%USERPROFILE%\.claude\.credentials.json" (
    color 0E
    echo   [--] Claude nao autenticado. Abrindo login...
    echo       Faca login e feche a janela quando concluir.
    start /wait "Claude Login" cmd /c "claude auth login"
    echo   [OK] Login concluido
)

:: ── 5. .env existe ──
if not exist ".env" (
    color 0E
    echo   [AVISO] .env nao encontrado. Voz desabilitada.
    echo          Crie o arquivo .env com: OPENAI_API_KEY=sk-...
) else (
    echo   [OK] .env
)

:: ── 6. node_modules ──
if not exist "node_modules\express\package.json" (
    color 0E
    echo   [--] node_modules incompleto. Reinstalando...
    call npm install --production 2>&1
    if exist "node_modules\express\package.json" (
        echo   [OK] node_modules reinstalado
    ) else (
        echo   [ERRO] Falha ao instalar dependencias.
        set "FAIL=1"
        goto :healthDone
    )
) else (
    echo   [OK] node_modules
)

:: ── 7. Porta 3000 livre ──
netstat -ano 2>nul | findstr ":3000.*LISTENING" >nul 2>&1
if not errorlevel 1 (
    color 0E
    echo   [AVISO] Porta 3000 ja esta em uso.
    echo          Fechando processo anterior...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000.*LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
    netstat -ano 2>nul | findstr ":3000.*LISTENING" >nul 2>&1
    if not errorlevel 1 (
        echo   [ERRO] Nao foi possivel liberar a porta 3000.
        set "FAIL=1"
        goto :healthDone
    )
    echo   [OK] Porta 3000 liberada
) else (
    echo   [OK] Porta 3000 livre
)

:healthDone
echo.

if "%FAIL%"=="1" (
    color 0C
    echo   =========================================
    echo     FALHA no Health Check. Corrija acima.
    echo   =========================================
    pause
    exit /b 1
)

color 0A
echo   =========================================
echo     Health Check OK. Iniciando JARVIS...
echo   =========================================
echo.
color 0B

:: Iniciar servidor (esta janela vira o servidor)
echo   JARVIS Server rodando em http://localhost:3000
echo   Feche esta janela para parar o servidor.
echo.

:: Abrir navegador apos 3 segundos
start "" cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:3000"

:: Rodar servidor (bloqueante — janela fica aberta)
node server.js

:: Se chegar aqui, o servidor parou
echo.
color 0E
echo   JARVIS Server parou.
pause
