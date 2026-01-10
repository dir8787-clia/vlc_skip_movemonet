@echo off
chcp 65001 >nul 2>&1 2>nul

echo Проверка наличия Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo Ошибка: Python не установлен.
    echo Установите Python 3.6 или новее и добавьте его в PATH.
    pause
    exit /b 1
)

echo Запуск локального сервера...
start "" http://localhost:8000
python -m http.server 8000