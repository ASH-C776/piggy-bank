@echo off
chcp 65001 >nul
if "%~1"=="" (
    echo 请把 APK 文件拖到本图标上！
    pause > nul
    exit /b
)
echo 正在连接手机 (192.168.31.144) ...
adb connect 192.168.31.144:5555
echo 正在安装 "%~nx1" ...
adb install -r "%~1"
if errorlevel 1 (
    echo.
    echo *** 安装失败：请确认手机已开"无线调试"、与本机同一 WiFi ***
) else (
    echo.
    echo *** 安装成功！***
)
echo 安装完成！按任意键退出...
pause > nul
