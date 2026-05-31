@echo off
title JARVIS - Shutting Down
color 0E
echo.
echo   =========================================
echo     J A R V I S   -   Desligando...
echo   =========================================
echo.

:: Kill Node.js processes on port 3000
set "KILLED=0"
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":3000.*LISTENING"') do (
    echo   Encerrando processo PID: %%a
    taskkill /F /PID %%a >nul 2>&1
    set "KILLED=1"
)

if "%KILLED%"=="0" (
    echo   Nenhum processo JARVIS encontrado na porta 3000.
) else (
    timeout /t 1 /nobreak >nul
)

echo.

:: Verify port is free
netstat -ano 2>nul | findstr ":3000.*LISTENING" >nul 2>&1
if errorlevel 1 (
    color 0A
    echo   =========================================
    echo     JARVIS desligado. Porta 3000 livre.
    echo   =========================================
) else (
    color 0C
    echo   [AVISO] Porta 3000 ainda em uso.
    echo   Tente fechar a janela do servidor manualmente.
)

echo.
pause
