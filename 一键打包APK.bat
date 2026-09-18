@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo ============================================
echo   存钱罐 - 一键重新打包安卓 APK
echo ============================================
echo.

echo [1/4] 构建前端 (web) ...
call npm run build --workspace web
if errorlevel 1 (
  echo.
  echo *** 前端构建失败，已中止 ***
  pause
  exit /b 1
)

echo.
echo [2/4] 同步网页到安卓工程 ...
cd web
call node "..\node_modules\@capacitor\cli\bin\capacitor" sync android
if errorlevel 1 (
  echo.
  echo *** 同步失败，已中止 ***
  pause
  exit /b 1
)

echo.
echo [3/4] 打包 APK (首次约 1-3 分钟) ...
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
  echo.
  echo *** 打包失败，已中止 ***
  pause
  exit /b 1
)

echo.
echo [4/4] 归档到 release 目录 ...
cd ..\..
copy /y "web\android\app\build\outputs\apk\debug\app-debug.apk" "release\PiggyBank-new.apk" >nul
if errorlevel 1 (
  echo.
  echo *** 复制失败 ***
  pause
  exit /b 1
)

echo.
echo ============================================
echo   打包完成！
echo   APK 位置: release\PiggyBank-new.apk
echo.
echo   装到手机: 把该 APK 拖到 "release\安装apk到手机.bat" 上
echo   或执行:   adb install -r release\PiggyBank-new.apk
echo ============================================
pause
