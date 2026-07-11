@echo off
chcp 65001 >nul
title Open Yukkuri Editor

echo ============================================
echo   Open Yukkuri Editor
echo   ゆっくりMovieMaker4互換 動画編集アプリ
echo ============================================
echo.

cd /d "%~dp0"

if not exist "node_modules" (
    echo [INFO] node_modules が見つかりません。
    echo [INFO] npm install を実行します...
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] npm install に失敗しました。
        pause
        exit /b 1
    )
    echo.
    echo [INFO] npm install 完了しました。
    echo.
)

echo [INFO] 開発サーバーを起動します...
echo [INFO] Electron ウィンドウが開くまでお待ちください。
echo [INFO] 閉じるには Ctrl+C を押してください。
echo.
call npm run dev

echo.
echo [INFO] アプリケーションを終了しました。
