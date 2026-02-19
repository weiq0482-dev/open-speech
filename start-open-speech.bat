@echo off
chcp 65001 >nul
title Open-Speech - AI 助手

cd /d "%~dp0"

echo ========================================
echo   Open-Speech - AI 助手
echo ========================================
echo.

:: 检查 node_modules
if not exist "node_modules\" (
    echo [1/3] 正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo 错误: 依赖安装失败！请检查网络连接。
        pause
        exit /b 1
    )
    echo 依赖安装完成。
) else (
    echo [1/3] 依赖已就绪。
)

:: 检查 .next 构建目录
if not exist ".next\" (
    echo [2/3] 首次启动，正在构建项目（约1-2分钟）...
    call npm run build
    if errorlevel 1 (
        echo 错误: 项目构建失败！
        pause
        exit /b 1
    )
    echo 构建完成。
) else (
    echo [2/3] 构建已就绪。
)

:: 启动生产服务器
echo [3/3] 正在启动服务...
echo.
echo ----------------------------------------
echo   本地访问: http://localhost:3001
echo   局域网:   http://192.168.1.4:3001
echo   远程访问: 通过 SakuraFrp 隧道（TCP → 3001）
echo   按 Ctrl+C 停止服务
echo ----------------------------------------
echo.

npx next start -p 3001 -H 0.0.0.0
