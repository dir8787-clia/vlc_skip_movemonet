@echo off
chcp 65001 >nul
echo Проверка наличия Python 3.6+...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ОШИБКА: Python не найден!
    echo Установите Python 3.6 или выше и добавьте его в PATH.
    echo Скачать можно с https://www.python.org/downloads/
    pause
    exit /b 1
)

for /f "tokens=2 delims= " %%i in ('python --version 2^>^&1') do set version=%%i
for /f "tokens=1,2,3 delims=." %%a in ("%version%") do (
    set major=%%a
    set minor=%%b
)

if %major% lss 3 (
    echo.
    echo ОШИБКА: Обнаружена версия Python %major%.%minor%, требуется 3.6 или выше!
    pause
    exit /b 1
)

if %major% equ 3 if %minor% lss 6 (
    echo.
    echo ОШИБКА: Обнаружена версия Python %major%.%minor%, требуется 3.6 или выше!
    pause
    exit /b 1
)

echo Запуск локального сервера на порту 8000...
start "" http://localhost:8000
python -m http.server 8000