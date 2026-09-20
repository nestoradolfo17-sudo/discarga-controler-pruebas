@echo off
setlocal

set "NODE_DIR=C:\Users\NestorSalazar\OneDrive - DISCARGA, S.A\Escritorio\node-v24.21.0-win-x64\node-v24.21.0-win-x64"
set "PROJECT_DIR=%~dp0"
set "PATH=%NODE_DIR%;%PATH%"

echo ============================================
echo   DISCARGA CONTROLER - Iniciando servidor
echo ============================================
echo.

if not exist "%NODE_DIR%\node.exe" (
    echo ERROR: No se encontro Node.js en esta ruta:
    echo   %NODE_DIR%
    echo.
    echo Verifica que la carpeta de Node.js no se haya movido o renombrado,
    echo y avisale a soporte si el problema continua.
    echo.
    pause
    exit /b 1
)

echo Verificando Node.js...
"%NODE_DIR%\node.exe" -v
echo.

cd /d "%PROJECT_DIR%"
echo Carpeta del proyecto: %PROJECT_DIR%
echo.

echo Instalando/actualizando dependencias del proyecto...
echo (esto puede tardar 1-2 minutos la primera vez; en las siguientes es mas rapido)
echo.
call npm install
if errorlevel 1 (
    echo.
    echo ERROR: npm install fallo. Revisa el mensaje en rojo de arriba.
    echo.
    pause
    exit /b 1
)

echo.
echo Iniciando el servidor de DISCARGA CONTROLER...
echo Cuando veas una linea como "Local: http://localhost:3000/", abre esa direccion en Chrome.
echo NO CIERRES ESTA VENTANA mientras uses la aplicacion.
echo.
call npm run dev

echo.
echo El servidor se detuvo o se cerro.
pause
endlocal
