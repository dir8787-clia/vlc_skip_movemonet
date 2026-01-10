@echo off
chcp 65001 >nul
echo Запуск видеоплеера...
echo.

REM Проверка наличия Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python не найден в системе.
    echo.
    echo Пожалуйста, установите Python 3.6 или выше:
    echo 1. Зайдите на сайт https://www.python.org/downloads/
    echo 2. Скачайте и установите последнюю версию Python
    echo 3. При установке обязательно отметьте галочку "Add Python to PATH"
    echo.
    echo После установки перезапустите этот скрипт.
    echo.
    pause
    exit /b 1
)

echo Python найден, запуск сервера...
echo.

REM Запуск встроенного HTTP-сервера Python на порту 8000
start "" http://localhost:8000/index.html
python -m http.server 8000

pause