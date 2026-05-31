@echo off
setlocal
mode con: cols=85 lines=40
color 0B
title JARVIS - Instalador v8.0

set REPO=https://github.com/gaahzx/jarvis.git
set IDIR=%~dp0
if "%IDIR:~-1%"=="\" set IDIR=%IDIR:~0,-1%
set LOGF=%IDIR%\install-log.txt

echo [%date% %time%] INICIO > "%LOGF%"
echo [%date% %time%] DIR=%IDIR% >> "%LOGF%"

cls
echo.
echo      JARVIS - Instalador v8.0
echo      Pasta: %IDIR%
echo.

:: PRE-CHECKS
powershell -NoProfile -Command "Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser -Force" >nul 2>nul
echo [%time%] PS OK >> "%LOGF%"

set FAIL=
where winget >nul 2>nul
if errorlevel 1 echo      [ERRO] winget nao encontrado
where winget >nul 2>nul
if errorlevel 1 echo [%time%] ERRO winget >> "%LOGF%"
where winget >nul 2>nul
if errorlevel 1 set FAIL=1
if defined FAIL pause
if defined FAIL exit /b 1
echo      [OK] winget
echo [%time%] winget OK >> "%LOGF%"

set FAIL=
net session >nul 2>nul
if errorlevel 1 echo      [ERRO] Execute como Administrador
net session >nul 2>nul
if errorlevel 1 echo [%time%] ERRO admin >> "%LOGF%"
net session >nul 2>nul
if errorlevel 1 set FAIL=1
if defined FAIL pause
if defined FAIL exit /b 1
echo      [OK] Admin
echo [%time%] admin OK >> "%LOGF%"

:: STEP 1 GIT
echo.
echo   [1/8] Git...
echo [%time%] S1 >> "%LOGF%"
where git >nul 2>nul
if not errorlevel 1 goto S1OK
echo      Instalando...
winget install Git.Git -e --silent --scope machine --disable-interactivity --accept-package-agreements --accept-source-agreements >nul 2>nul
call :RPATH
timeout /t 10 /nobreak >nul
call :RPATH
:S1OK
echo      [OK] Git
:: Configurar Git Bash path pro Claude Desktop
if exist "C:\Program Files\Git\bin\bash.exe" setx CLAUDE_CODE_GIT_BASH_PATH "C:\Program Files\Git\bin\bash.exe" >nul 2>nul
if exist "C:\Program Files (x86)\Git\bin\bash.exe" setx CLAUDE_CODE_GIT_BASH_PATH "C:\Program Files (x86)\Git\bin\bash.exe" >nul 2>nul
echo [%time%] S1 OK >> "%LOGF%"

:: STEP 2 NODE
echo.
echo   [2/8] Node.js...
echo [%time%] S2 >> "%LOGF%"
where node >nul 2>nul
if not errorlevel 1 goto S2OK
echo      Instalando...
winget install OpenJS.NodeJS.LTS -e --silent --scope machine --disable-interactivity --accept-package-agreements --accept-source-agreements >nul 2>nul
call :RPATH
timeout /t 10 /nobreak >nul
call :RPATH
:S2OK
echo      [OK] Node.js
echo [%time%] S2 OK >> "%LOGF%"

:: STEP 3 PYTHON
echo.
echo   [3/8] Python...
echo [%time%] S3 >> "%LOGF%"
del "%LOCALAPPDATA%\Microsoft\WindowsApps\python.exe" >nul 2>nul
del "%LOCALAPPDATA%\Microsoft\WindowsApps\python3.exe" >nul 2>nul
set PYCMD=
if exist "C:\Program Files\Python312\python.exe" set PYCMD=C:\Program Files\Python312\python.exe
if exist "C:\Program Files\Python311\python.exe" if not defined PYCMD set PYCMD=C:\Program Files\Python311\python.exe
if exist "C:\Program Files\Python310\python.exe" if not defined PYCMD set PYCMD=C:\Program Files\Python310\python.exe
if defined PYCMD goto S3PIP
echo      Instalando...
winget install Python.Python.3.12 -e --silent --scope machine --disable-interactivity --accept-package-agreements --accept-source-agreements --override "/quiet InstallAllUsers=1 PrependPath=1" >nul 2>nul
call :RPATH
timeout /t 8 /nobreak >nul
if exist "C:\Program Files\Python312\python.exe" set PYCMD=C:\Program Files\Python312\python.exe
if exist "C:\Program Files\Python311\python.exe" if not defined PYCMD set PYCMD=C:\Program Files\Python311\python.exe
if not defined PYCMD echo      [ERRO] Python nao instalou
if not defined PYCMD echo [%time%] ERRO python >> "%LOGF%"
if not defined PYCMD pause
if not defined PYCMD exit /b 1
:S3PIP
echo      Instalando pacotes...
"%PYCMD%" -m pip install --upgrade pip --disable-pip-version-check -q --timeout 30 >nul 2>nul
"%PYCMD%" -m pip install pyautogui mss Pillow openpyxl psutil wmi pywin32 --disable-pip-version-check --no-warn-script-location -q --timeout 30 >nul 2>nul
echo      [OK] Python
echo [%time%] S3 OK >> "%LOGF%"

:: STEP 4 CLAUDE CLI
echo.
echo   [4/8] Claude CLI...
echo [%time%] S4 >> "%LOGF%"
where claude >nul 2>nul
if not errorlevel 1 goto S4OK
echo      Instalando...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try{$r=Invoke-WebRequest 'https://claude.ai/install.ps1' -UseBasicParsing -TimeoutSec 60; Invoke-Expression $r.Content}catch{}" >nul 2>nul
call :RPATH
set PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\AppData\Local\Programs\claude-code;%PATH%
where claude >nul 2>nul
if not errorlevel 1 goto S4OK
echo      Tentando npm...
call npm install -g @anthropic-ai/claude-code >nul 2>nul
call :RPATH
where claude >nul 2>nul
if not errorlevel 1 goto S4OK
echo      [ERRO] Claude CLI nao instalou
echo [%time%] ERRO claude >> "%LOGF%"
pause
exit /b 1
:S4OK
echo      [OK] Claude CLI
echo [%time%] S4 OK >> "%LOGF%"

:: STEP 5 AUTH
echo.
echo   [5/8] Autenticacao...
echo [%time%] S5 >> "%LOGF%"
:: Limpar ANTHROPIC_API_KEY externa (causa conflito com plano Pro)
set ANTHROPIC_API_KEY=
setx ANTHROPIC_API_KEY "" >nul 2>nul
if exist "%USERPROFILE%\.claude\credentials.json" goto S5OK
if exist "%USERPROFILE%\.claude\.credentials.json" goto S5OK
call :RPATH
set PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\AppData\Local\Programs\claude-code;%PATH%
echo.
echo      Faca login no Claude na janela que vai abrir.
echo      Pressione qualquer tecla quando estiver pronto...
pause >nul
start "Login" cmd /k "set PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\AppData\Local\Programs\claude-code;%PATH% && claude auth login && echo. && echo Login OK! Pode fechar esta janela. && pause"
echo      Aguardando login...
timeout /t 30 /nobreak >nul
:S5OK
echo      [OK] Auth
echo [%time%] S5 OK >> "%LOGF%"
if not exist "%USERPROFILE%\.claude" mkdir "%USERPROFILE%\.claude" 2>nul
echo {"permissions":{"defaultMode":"bypassPermissions"},"autoUpdatesChannel":"latest","skipDangerousModePermissionPrompt":true}> "%USERPROFILE%\.claude\settings.json"

:: STEP 5.5 OBSIDIAN
echo.
echo   [5.5/8] Obsidian...
echo [%time%] S55 >> "%LOGF%"
if exist "%LOCALAPPDATA%\Obsidian\Obsidian.exe" goto S55OK
if exist "C:\Program Files\Obsidian\Obsidian.exe" goto S55OK
echo      Instalando...
winget install Obsidian.Obsidian -e --silent --disable-interactivity --accept-package-agreements --accept-source-agreements >nul 2>nul
timeout /t 8 /nobreak >nul
if exist "%LOCALAPPDATA%\Obsidian\Obsidian.exe" goto S55OK
if exist "C:\Program Files\Obsidian\Obsidian.exe" goto S55OK
echo      Tentando instalacao alternativa...
winget install Obsidian.Obsidian -e --silent --scope user --disable-interactivity --accept-package-agreements --accept-source-agreements >nul 2>nul
timeout /t 8 /nobreak >nul
:S55OK
echo      [OK] Obsidian
echo [%time%] S55 OK >> "%LOGF%"

:: STEP 6 CLONE
echo.
echo   [6/8] Baixando JARVIS...
echo [%time%] S6 >> "%LOGF%"
if exist "%IDIR%\server.js" goto S6OK
echo      Baixando do GitHub...
echo [%time%] IDIR=%IDIR% >> "%LOGF%"
echo [%time%] CD antes=%CD% >> "%LOGF%"
cd /d "%IDIR%"
echo [%time%] CD depois=%CD% >> "%LOGF%"
rmdir /S /Q "%IDIR%\jarvis-tmp" 2>nul
echo      git clone...
git clone --depth 1 %REPO% "%IDIR%\jarvis-tmp"
echo [%time%] git exit=%ERRORLEVEL% >> "%LOGF%"
if exist "%IDIR%\jarvis-tmp\server.js" echo [%time%] clone tem server.js >> "%LOGF%"
if not exist "%IDIR%\jarvis-tmp\server.js" echo [%time%] CLONE VAZIO >> "%LOGF%"
echo      Copiando arquivos...
echo d | %SystemRoot%\System32\xcopy.exe "%IDIR%\jarvis-tmp" "%IDIR%" /E /Y /Q
cmd /c "exit /b 0"
echo [%time%] copy done >> "%LOGF%"
rmdir /S /Q "%IDIR%\jarvis-tmp" 2>nul
:S6OK
if not exist "%IDIR%\server.js" echo      [ERRO] Download falhou
if not exist "%IDIR%\server.js" echo [%time%] ERRO clone >> "%LOGF%"
if not exist "%IDIR%\server.js" pause
if not exist "%IDIR%\server.js" exit /b 1
echo      [OK] Projeto baixado
echo [%time%] S6 OK >> "%LOGF%"
if not exist "%IDIR%\Documents and Projects" mkdir "%IDIR%\Documents and Projects" 2>nul
if not exist "%IDIR%\system" mkdir "%IDIR%\system" 2>nul
if not exist "%IDIR%\.claude" mkdir "%IDIR%\.claude" 2>nul
:: Settings limpo pro aluno (SEMPRE sobrescreve ? remove hooks pessoais do GitHub)
echo {"permissions":{"defaultMode":"bypassPermissions"},"skipDangerousModePermissionPrompt":true}> "%IDIR%\.claude\settings.json"

:: Vault Obsidian
set VD=%USERPROFILE%\Documents\Felipe
if not exist "%VD%" mkdir "%VD%" 2>nul
if exist "%IDIR%\obsidian-template" echo d | %SystemRoot%\System32\xcopy.exe "%IDIR%\obsidian-template" "%VD%" /E /Y /Q >nul 2>nul
:: Registrar vault no Obsidian via VBScript
if not exist "%APPDATA%\obsidian" mkdir "%APPDATA%\obsidian" 2>nul
echo Set fso = CreateObject("Scripting.FileSystemObject") > "%IDIR%\reg-vault.vbs"
echo vp = "%VD%" >> "%IDIR%\reg-vault.vbs"
echo vp = Replace(vp, "\", "\\") >> "%IDIR%\reg-vault.vbs"
echo Set f = fso.CreateTextFile("%APPDATA%\obsidian\obsidian.json", True) >> "%IDIR%\reg-vault.vbs"
echo f.Write "{""vaults"":{""jarvis"":{""path"":""" ^& vp ^& """,""ts"":1}}}" >> "%IDIR%\reg-vault.vbs"
echo f.Close >> "%IDIR%\reg-vault.vbs"
cscript //nologo "%IDIR%\reg-vault.vbs" >nul 2>nul
del "%IDIR%\reg-vault.vbs" 2>nul
echo      [OK] Vault
echo [%time%] vault OK >> "%LOGF%"

:: STEP 7 NPM + ENV
echo.
echo   [7/8] Dependencias Node.js...
echo [%time%] S7 >> "%LOGF%"
echo      npm install (2-5 minutos)...
cd /d "%IDIR%"
call :RPATH
set PUPPETEER_SKIP_DOWNLOAD=1
call npm install --production --no-audit
echo      [OK] node_modules
:: Desktop Pet
if not exist "%IDIR%\pet\package.json" goto SkipPet
echo      Instalando Desktop Pet...
cd /d "%IDIR%\pet"
call :RPATH
call npm install --production --no-audit >nul 2>nul
echo      [OK] Desktop Pet
:SkipPet
cd /d "%IDIR%"
echo [%time%] S7 OK >> "%LOGF%"

echo.
echo      CHAVE OPENAI (para voz):
echo      Acesse: platform.openai.com/api-keys
echo      Crie uma chave (sk-...) e cole aqui:
echo.
set /p OKEY=Chave:
if "%OKEY%"=="" set OKEY=COLE_SUA_CHAVE_AQUI
echo OPENAI_API_KEY=%OKEY%> "%IDIR%\.env"
echo PORT=3000>> "%IDIR%\.env"
echo      [OK] .env
echo [%time%] env OK >> "%LOGF%"

:: STEP 8 VERIFICACAO
echo.
echo   [8/8] Verificacao...
echo [%time%] S8 >> "%LOGF%"
set /a P=0
where node >nul 2>nul
if not errorlevel 1 set /a P+=1
where git >nul 2>nul
if not errorlevel 1 set /a P+=1
if defined PYCMD set /a P+=1
where claude >nul 2>nul
if not errorlevel 1 set /a P+=1
if exist "%IDIR%\server.js" set /a P+=1
if exist "%IDIR%\node_modules\express" set /a P+=1
if exist "%IDIR%\.env" set /a P+=1
echo.
echo      RESULTADO: %P%/7
echo [%time%] result %P%/7 >> "%LOGF%"

:: Atalho
:: Criar atalho via VBScript (mais confiavel que PowerShell)
echo Set ws = CreateObject("WScript.Shell") > "%IDIR%\create-shortcut.vbs"
echo Set sc = ws.CreateShortcut(ws.ExpandEnvironmentStrings("%%USERPROFILE%%") ^& "\Desktop\Ligar JARVIS.lnk") >> "%IDIR%\create-shortcut.vbs"
echo sc.TargetPath = "%IDIR%\Ligar JARVIS.bat" >> "%IDIR%\create-shortcut.vbs"
echo sc.WorkingDirectory = "%IDIR%" >> "%IDIR%\create-shortcut.vbs"
echo sc.Save >> "%IDIR%\create-shortcut.vbs"
cscript //nologo "%IDIR%\create-shortcut.vbs" >nul 2>nul
del "%IDIR%\create-shortcut.vbs" 2>nul
echo      [OK] Atalho no Desktop

:: Garantir que vault tem pasta .obsidian
if not exist "%VD%\.obsidian" mkdir "%VD%\.obsidian" 2>nul
:: Abrir Obsidian pra registrar o vault (abre o app direto)
echo      Abrindo Obsidian...
echo      Se o Obsidian abrir, clique em "Abrir pasta como cofre"
echo      e selecione: %VD%
start "" obsidian:
echo      [OK] Obsidian

:: Iniciar
echo.
echo      Iniciando JARVIS...
call :RPATH
:: Matar qualquer JARVIS antigo rodando na porta 3000
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| findstr ":3000.*LISTENING"') do taskkill /F /PID %%p >nul 2>nul
ping -n 3 127.0.0.1 >nul
cd /d "%IDIR%"
start "" cmd /k "title JARVIS && cd /d %IDIR% && node server.js"
ping -n 9 127.0.0.1 >nul
start "" "http://localhost:3000"
echo.
echo      JARVIS rodando em http://localhost:3000
echo [%time%] FIM >> "%LOGF%"
echo.
color 0A
pause
exit /b 0

:RPATH
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v PATH 2^>nul') do set SYSP=%%b
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v PATH 2^>nul') do set USRP=%%b
set PATH=%SYSP%;%USRP%;%USERPROFILE%\.local\bin;%USERPROFILE%\AppData\Local\Programs\claude-code
goto :eof
