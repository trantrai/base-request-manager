@echo off
REM BaseScope - script khoi dong tren Windows (PowerShell/CMD deu duoc)
REM Khong dung lenh Unix-only (tee, ...). Chay: nhap dup start.bat
cd /d %~dp0

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js 20+. Tai tai: https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo [1/3] Cai dat thu vien (lan dau, mat vai phut)...
  call npm install --no-audit --no-fund
  if errorlevel 1 ( echo [LOI] npm install that bai. & pause & exit /b 1 )
)

if not exist .next\standalone\server.js (
  echo [2/3] Build ung dung...
  call npm run build
  if errorlevel 1 ( echo [LOI] Build that bai. & pause & exit /b 1 )
)

if not exist data\basescope.db (
  echo [3/3] Nap du lieu mau (snapshot 15/10/2026)...
  call npm run seed
)

echo.
echo  BaseScope dang chay tai: http://localhost:3000
echo  Nhan Ctrl+C de dung.
echo.
REM Chi nghe tren localhost (khong mo ra LAN) vi API chua co auth - B2 review round 1
set HOSTNAME=127.0.0.1
node .next\standalone\server.js
pause
