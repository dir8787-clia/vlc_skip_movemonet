# Установка кодировки для корректного отображения русского языка
$OutputEncoding = [console]::InputEncoding = [console]::OutputEncoding = New-Object System.Text.UTF8Encoding

Write-Host "Запуск OBS Видеоплеера..." -ForegroundColor Green
Write-Host ""

# Проверяем наличие Python
try {
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ОШИБКА: Python не найден в системе." -ForegroundColor Red
        Write-Host ""
        Write-Host "Пожалуйста, установите Python 3.6 или выше:" -ForegroundColor Yellow
        Write-Host "1. Загрузите Python с официального сайта: https://www.python.org/downloads/" -ForegroundColor Yellow
        Write-Host "2. Убедитесь, что при установке вы отметили 'Add Python to PATH'" -ForegroundColor Yellow
        Write-Host "3. Перезапустите PowerShell после установки" -ForegroundColor Yellow
        Write-Host ""
        Pause
        exit 1
    }
    
    # Извлекаем версию Python
    $versionMatch = [regex]::Match($pythonVersion, '(\d+)\.(\d+)')
    $majorVersion = [int]$versionMatch.Groups[1].Value
    $minorVersion = [int]$versionMatch.Groups[2].Value
    
    if ($majorVersion -lt 3 -or ($majorVersion -eq 3 -and $minorVersion -lt 6)) {
        Write-Host "ОШИБКА: Требуется Python 3.6 или выше. Обнаруженная версия: $($pythonVersion.Trim())" -ForegroundColor Red
        Pause
        exit 1
    }
    
    Write-Host "Python $($pythonVersion.Trim()) найден. Запуск сервера..." -ForegroundColor Green
    Write-Host ""
    
    # Переходим в директорию скрипта
    Set-Location -Path $PSScriptRoot
    
    # Открываем браузер с плеером
    Start-Process "http://localhost:8000/player.html"
    
    # Запускаем веб-сервер на порту 8000
    Write-Host "Запуск локального веб-сервера на порту 8000..." -ForegroundColor Cyan
    python -m http.server 8000
    
} catch {
    Write-Host "Произошла ошибка: $($_.Exception.Message)" -ForegroundColor Red
    Pause
    exit 1
}