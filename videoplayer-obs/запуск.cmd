@echo off
chcp 65001 >nul

REM Проверяем наличие Python
python --version >nul 2>&1
if errorlevel 1 (
    echo Ошибка: Python не установлен.
    echo Установите Python 3.6 или новее и добавьте его в PATH.
    pause
    exit /b 1
)

echo Запуск локального сервера...
start "" http://localhost:8000
python -m http.server 8000