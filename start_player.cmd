@echo off
chcp 65001 >nul 2>&1

echo Запуск OBS Видеоплеера...
echo.

REM Проверяем наличие Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ОШИБКА: Python не найден в системе.
    echo.
    echo Пожалуйста, установите Python 3.6 или выше:
    echo 1. Загрузите Python с официального сайта: https://www.python.org/downloads/
    echo 2. Убедитесь, что при установке вы отметили "Add Python to PATH"
    echo 3. Перезапустите командную строку после установки
    echo.
    pause
    exit /b 1
)

REM Проверяем версию Python
for /f "tokens=2" %%i in ('python --version 2^>nul') do set python_version=%%i
for /f "delims=. tokens=1" %%i in ("%python_version%") do set major_version=%%i
for /f "delims=. tokens=2" %%i in ("%python_version%") do set minor_version=%%i

if %major_version% lss 3 (
    echo ОШИБКА: Требуется Python 3.6 или выше. Обнаруженная версия: %python_version%
    pause
    exit /b 1
)

if %major_version% equ 3 if %minor_version% lss 6 (
    echo ОШИБКА: Требуется Python 3.6 или выше. Обнаруженная версия: %python_version%
    pause
    exit /b 1
)

echo Python %python_version% найден. Запуск сервера...
echo.

REM Переходим в директорию со скриптом
cd /d "%~dp0"

REM Запускаем веб-сервер на порту 8000
echo Запуск локального веб-сервера на порту 8000...
start "" http://localhost:8000/player.html
python -m http.server 8000