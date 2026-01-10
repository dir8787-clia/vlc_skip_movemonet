@echo off
chcp 65001 >nul 2>&1
echo Видеоплеер с автопропуском
echo ===========================
echo Проверка наличия Python...

python --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo ОШИБКА: Python не найден в системе.
    echo Убедитесь, что Python установлен и добавлен в PATH.
    echo.
    echo Скачайте Python с официального сайта: https://www.python.org/downloads/
    pause
    exit /b 1
)

echo Python найден. Запуск сервера...
echo.

python server.py

pause