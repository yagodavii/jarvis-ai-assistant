@echo off
setlocal EnableDelayedExpansion
mode con: cols=75 lines=30
color 0B
title   J A R V I S   -   Atualizador + AutoFix

set "JARVIS_DIR=%USERPROFILE%\Desktop\Jarvis"

:: ============================================================
:: FUNCAO: REFRESH PATH
:: ============================================================
goto :StartUpdate

:RefreshPath
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set "SYS_PATH=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set "USR_PATH=%%b"
set "PATH=!SYS_PATH!;!USR_PATH!;%USERPROFILE%\.local\bin;%USERPROFILE%\AppData\Local\Programs\claude-code"
goto :eof

:StartUpdate
cls
echo.
echo  =====================================================================
echo          J A R V I S   -   A T U A L I Z A D O R
echo  =====================================================================
echo.

:: Verificar se pasta existe
if not exist "%JARVIS_DIR%\server.js" (
    color 0C
    echo   [ERRO] JARVIS nao encontrado em %JARVIS_DIR%
    echo   Rode o INSTALAR-JARVIS-v8.bat primeiro.
    pause
    exit /b 1
)

:: Verificar Git
where git >nul 2>&1
if errorlevel 1 (
    color 0C
    echo   [ERRO] Git nao encontrado. Rode o instalador novamente.
    pause
    exit /b 1
)

:: Salvar versao atual
cd /d "%JARVIS_DIR%"
for /f "tokens=*" %%v in ('git rev-parse --short HEAD 2^>nul') do set "OLD_HASH=%%v"
echo   Versao atual: !OLD_HASH!
echo.

:: Fechar JARVIS se estiver rodando
echo   Verificando se JARVIS esta rodando...
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr "LISTENING" ^| findstr ":3000 "') do (
    if not "%%p"=="0" (
        echo   [!] JARVIS rodando ^(PID %%p^). Desligando...
        taskkill /F /PID %%p >nul 2>&1
        timeout /t 2 /nobreak >nul
    )
)

:: Guardar .env (nao perder chaves)
if exist "%JARVIS_DIR%\.env" (
    copy "%JARVIS_DIR%\.env" "%JARVIS_DIR%\.env.backup" >nul 2>&1
    echo   [OK] Backup do .env salvo
)

:: Puxar atualizacoes
echo.
echo   Baixando atualizacoes do GitHub...
echo.
git stash >nul 2>&1
git pull --ff-only origin main 2>&1
if errorlevel 1 (
    echo.
    echo   [!] Conflito detectado. Resetando para versao do servidor...
    git reset --hard origin/main 2>nul
)

:: Restaurar .env
if exist "%JARVIS_DIR%\.env.backup" (
    copy "%JARVIS_DIR%\.env.backup" "%JARVIS_DIR%\.env" >nul 2>&1
    del "%JARVIS_DIR%\.env.backup" >nul 2>&1
    echo   [OK] .env restaurado
)

:: Verificar se mudou
for /f "tokens=*" %%v in ('git rev-parse --short HEAD 2^>nul') do set "NEW_HASH=%%v"

if "!OLD_HASH!"=="!NEW_HASH!" (
    color 0A
    echo.
    echo   [OK] JARVIS ja esta na versao mais recente (!NEW_HASH!)
    echo   Nenhuma atualizacao necessaria.
) else (
    echo.
    echo   Nova versao: !NEW_HASH!
    echo   Atualizando dependencias...
    call npm install --production --no-optional --no-audit 2>&1
    echo   [OK] Dependencias atualizadas

    :: Atualizar pip packages
    for %%p in ("C:\Program Files\Python312\python.exe" "C:\Program Files\Python311\python.exe") do (
        if exist %%p (
            %%p -m pip install pyautogui mss Pillow openpyxl psutil wmi pywin32 --disable-pip-version-check --no-warn-script-location -q --timeout 30 2>nul
        )
    )

    :: Mostrar changelog
    echo.
    echo   =====================================================================
    color 0A
    echo   ATUALIZADO COM SUCESSO!
    echo   =====================================================================
    echo.
    echo   Mudancas recentes:
    git log !OLD_HASH!..!NEW_HASH! --oneline --no-decorate 2>nul
)

:: =====================================================================
:: AUTO-FIX: Verificar e reparar dependencias
:: =====================================================================
echo.
echo   Verificando dependencias...

set "FIX=0"

:: Node
where node >nul 2>&1
if not errorlevel 1 (
    echo     [OK] Node.js
) else (
    echo     [X] Node.js — reinstalando...
    winget install OpenJS.NodeJS.LTS -e --silent --disable-interactivity --accept-package-agreements --accept-source-agreements 2>nul
    call :RefreshPath
    set /a FIX+=1
)

:: Python
set "PY_OK=0"
for %%p in ("C:\Program Files\Python312\python.exe" "C:\Program Files\Python311\python.exe") do (
    if exist %%p set "PY_OK=1"
)
if "!PY_OK!"=="1" (
    echo     [OK] Python
) else (
    echo     [X] Python — reinstalando...
    winget install Python.Python.3.12 -e --silent --disable-interactivity --accept-package-agreements --accept-source-agreements 2>nul
    call :RefreshPath
    set /a FIX+=1
)

:: Claude CLI
where claude >nul 2>&1
if not errorlevel 1 (
    echo     [OK] Claude CLI
) else (
    echo     [X] Claude CLI — reinstalando...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try{$r=Invoke-WebRequest 'https://claude.ai/install.ps1' -UseBasicParsing -TimeoutSec 30; Invoke-Expression $r.Content}catch{exit 1}" 2>nul
    call :RefreshPath
    set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\AppData\Local\Programs\claude-code;!PATH!"
    set /a FIX+=1
)

:: Claude Auth
claude auth status >nul 2>&1
if not errorlevel 1 (
    echo     [OK] Claude autenticado
) else (
    echo     [X] Claude nao autenticado — abrindo login...
    start "Claude Login" cmd /c "claude auth login & timeout /t 60 /nobreak >nul"
    set "AW=0"
    :WaitAuthU
    claude auth status >nul 2>&1
    if not errorlevel 1 goto :AuthUDone
    set /a AW+=1
    if !AW! GEQ 150 goto :AuthUDone
    timeout /t 2 /nobreak >nul
    goto :WaitAuthU
    :AuthUDone
    set /a FIX+=1
)

:: node_modules
if exist "%JARVIS_DIR%\node_modules\express" (
    echo     [OK] node_modules
) else (
    echo     [X] node_modules — reinstalando...
    cd /d "%JARVIS_DIR%"
    call npm install --production --no-optional --no-audit 2>nul
    set /a FIX+=1
)

:: .env
if exist "%JARVIS_DIR%\.env" (
    echo     [OK] .env
) else (
    echo     [X] .env ausente — recriando...
    (echo OPENAI_API_KEY=COLE_SUA_CHAVE_AQUI)>"%JARVIS_DIR%\.env"
    (echo PORT=3000)>>"%JARVIS_DIR%\.env"
    set /a FIX+=1
)

:: Obsidian vault
if exist "%USERPROFILE%\Documents\Felipe\JARVIS-Personalidade.md" (
    echo     [OK] Vault Obsidian
) else (
    echo     [X] Vault Obsidian — recriando...
    if exist "%JARVIS_DIR%\obsidian-template" (
        robocopy "%JARVIS_DIR%\obsidian-template" "%USERPROFILE%\Documents\Felipe" /E /NFL /NDL /NJH /NJS /nc /ns /np >nul 2>&1
        cmd /c "exit /b 0"
    )
    set /a FIX+=1
)

echo.
if !FIX! EQU 0 (
    color 0A
    echo   [OK] Todas as dependencias OK!
) else (
    color 0E
    echo   [!] !FIX! item(s) reparados.
    color 0A
)

:: Iniciar JARVIS
echo.
echo  =====================================================================
echo.
echo   Deseja iniciar o JARVIS agora? (S/N)
set /p "START=   > "
if /I "!START!"=="S" (
    echo.
    echo   Iniciando JARVIS...
    start "" cmd /k "title JARVIS Server && cd /d %JARVIS_DIR% && node server.js"
    timeout /t 6 /nobreak >nul
    start "" "http://localhost:3000"
)

echo.
echo   Pode fechar esta janela.
pause
exit /b 0
