@echo off
chcp 65001 >nul

echo Проверка наличия Python...
python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ОШИБКА: Python не найден на вашем компьютере.
    echo Пожалуйста, установите Python и убедитесь, что он добавлен в PATH.
    echo Вы можете скачать Python с официального сайта: https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

echo Запуск локального сервера...
cd /d "%~dp0"

REM Запускаем сервер на порту 8000
start "" http://localhost:8000
python -m http.server 8000

if errorlevel 1 (
    echo.
    echo Произошла ошибка при запуске сервера.
    echo Убедитесь, что порт 8000 свободен и Python установлен правильно.
    echo.
    pause
)