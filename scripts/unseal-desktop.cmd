@echo off
rem 让桌面版改读已解包并打好补丁的 resources\app。
rem 用法: unseal-desktop.cmd "E:\DeepSeekHarness"
rem 也可以先 set DSH_DESKTOP_ROOT=E:\DeepSeekHarness 再双击。
rem 运行前请保存工作：脚本会强制结束 DeepSeek Harness。
setlocal
set "ROOT=%~1"
if "%ROOT%"=="" set "ROOT=%DSH_DESKTOP_ROOT%"
if "%ROOT%"=="" (
  echo [错误] 需要安装根目录参数，例如：
  echo   unseal-desktop.cmd "E:\DeepSeekHarness"
  exit /b 2
)
set "RES=%ROOT%\resources"
set "EXE=%ROOT%\DeepSeek Harness.exe"

if not exist "%EXE%" (
  echo [错误] 找不到宿主：%EXE%
  exit /b 1
)
if not exist "%RES%\app\dsh\package.json" (
  echo [错误] 没有解包目录 %RES%\app，先让 dsh-purge 完成「应用 / 解包」。
  exit /b 1
)

echo [1/3] 结束 DeepSeek Harness...
taskkill /F /IM "DeepSeek Harness.exe" /T >nul 2>&1
timeout /t 3 /nobreak >nul

echo [2/3] 让 app.asar 让位...
if exist "%RES%\app.asar" (
  if exist "%RES%\app.asar.bak" (
    del /f /q "%RES%\app.asar" >nul 2>&1
  ) else (
    ren "%RES%\app.asar" app.asar.bak >nul 2>&1
  )
)
if exist "%RES%\app.asar" (
  echo [错误] app.asar 仍被占用，请在任务管理器结束所有 DeepSeek 进程后重试。
  exit /b 1
)

echo [3/3] 启动...
start "" "%EXE%"
echo [OK] 宿主将加载 %RES%\app
endlocal
