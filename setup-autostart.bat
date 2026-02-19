@echo off
chcp 65001 >nul
title Open-Speech - 设置开机自启

echo ========================================
echo   Open-Speech - 开机自启设置
echo ========================================
echo.

set "STARTUP_FOLDER=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT_NAME=Open-Speech.lnk"
set "VBS_PATH=%~dp0start-open-speech-hidden.vbs"

:: 检查是否已设置
if exist "%STARTUP_FOLDER%\%SHORTCUT_NAME%" (
    echo 已检测到开机自启快捷方式。
    echo.
    set /p choice="是否移除开机自启？(Y/N): "
    if /i "%choice%"=="Y" (
        del "%STARTUP_FOLDER%\%SHORTCUT_NAME%"
        echo 已移除开机自启。
    ) else (
        echo 保持当前设置。
    )
    echo.
    pause
    exit /b 0
)

:: 创建快捷方式到启动文件夹
echo 正在创建开机自启快捷方式...

:: 用 PowerShell 创建快捷方式
powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('%STARTUP_FOLDER%\%SHORTCUT_NAME%'); $s.TargetPath = 'wscript.exe'; $s.Arguments = '\"%VBS_PATH%\"'; $s.WorkingDirectory = '%~dp0'; $s.Description = 'Open-Speech AI'; $s.Save()"

if exist "%STARTUP_FOLDER%\%SHORTCUT_NAME%" (
    echo.
    echo ✓ 开机自启设置成功！
    echo   快捷方式位置: %STARTUP_FOLDER%\%SHORTCUT_NAME%
    echo.
    echo   下次开机后，Open-Speech 会自动在后台启动。
    echo   访问 http://localhost:3001 即可使用。
    echo.
    echo   如需取消，再次运行本脚本即可。
) else (
    echo.
    echo ✗ 设置失败，请尝试手动操作：
    echo   1. 按 Win+R，输入 shell:startup 回车
    echo   2. 将 start-open-speech-hidden.vbs 的快捷方式放入该文件夹
)

echo.
pause
