@echo off
title StockVest — Jurnal Trading Saham
cd /d "%~dp0"

echo ============================================
echo    StockVest - Jurnal Trading Saham
echo    Launcher
echo ============================================
echo.
echo Menjalankan server, mohon tunggu...
echo (Browser terbuka otomatis dalam 3 detik)
echo.

if not exist node_modules (
    echo [setup] Menginstall dependensi...
    call npm install
    if errorlevel 1 (
        echo Gagal menginstall. Pastikan Node.js sudah terinstall.
        pause
        exit /b 1
    )
    echo.
)

rem Buka browser setelah server sempat boot
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:5174/"

call npm run dev

echo.
echo Server berhenti. Tekan apa pun untuk menutup jendela ini.
pause >nul
