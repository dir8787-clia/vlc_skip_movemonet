// Глобальные переменные приложения
let playlist = []; // Массив с элементами плейлиста {title, url}
let currentVideoIndex = 0; // Индекс текущего видео
let skipRules = {}; // Объект с правилами пропуска {filename: [[start, end], ...]}
let isCleanMode = false; // Режим для OBS (скрытие интерфейса)
let isFullCleanMode = false; // Полностью скрытый режим
let skipCheckInterval = null; // Интервал проверки пропусков

// Получение элементов DOM
const videoPlayer = document.getElementById('video-player');
const currentVideoInfo = document.getElementById('current-video-info');
const controls = document.getElementById('controls');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const loadPlaylistBtn = document.getElementById('load-playlist-btn');
const playlistInput = document.getElementById('playlist-input');
const skipRulesInput = document.getElementById('skip-rules-input');

// Проверка параметров URL для определения режима работы
function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    
    if (urlParams.has('clean') || urlParams.has('obs')) {
        isCleanMode = true;
        document.body.classList.add('clean-mode');
    }
    
    // Если есть параметр fullclean, скрываем всё кроме видео
    if (urlParams.has('fullclean')) {
        isFullCleanMode = true;
        document.body.classList.add('full-clean');
    }
}

// Инициализация приложения
function initApp() {
    checkUrlParams();
    
    // Обработчики кнопок
    prevBtn.addEventListener('click', playPreviousVideo);
    nextBtn.addEventListener('click', playNextVideo);
    loadPlaylistBtn.addEventListener('click', () => playlistInput.click());
    
    // Обработчики выбора файлов
    playlistInput.addEventListener('change', handlePlaylistFile);
    skipRulesInput.addEventListener('change', handleSkipRulesFile);
    
    // Обработчик смены видео
    videoPlayer.addEventListener('ended', playNextVideo);
    
    // Обработчик двойного клика для полноэкранного режима
    videoPlayer.addEventListener('dblclick', toggleFullscreen);
    
    // Обработчик клавиш (F11 для полноэкранного режима)
    document.addEventListener('keydown', handleKeyPress);
    
    // Запуск проверки пропусков при начале воспроизведения
    videoPlayer.addEventListener('play', startSkipChecking);
    videoPlayer.addEventListener('timeupdate', checkForSkips);
}

// Обработка нажатий клавиш
function handleKeyPress(event) {
    // F11 для полноэкранного режима
    if (event.key === 'F11') {
        event.preventDefault();
        toggleFullscreen();
    }
}

// Переключение полноэкранного режима
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        if (videoPlayer.requestFullscreen) {
            videoPlayer.requestFullscreen();
        } else if (videoPlayer.mozRequestFullScreen) { /* Firefox */
            videoPlayer.mozRequestFullScreen();
        } else if (videoPlayer.webkitRequestFullscreen) { /* Chrome, Safari & Opera */
            videoPlayer.webkitRequestFullscreen();
        } else if (videoPlayer.msRequestFullscreen) { /* IE/Edge */
            videoPlayer.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) { /* Firefox */
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) { /* Chrome, Safari & Opera */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE/Edge */
            document.msExitFullscreen();
        }
    }
}

// Парсинг M3U-плейлиста
function parseM3U(content) {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line !== '');
    const parsedPlaylist = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Проверяем, начинается ли строка с #EXTINF
        if (line.startsWith('#EXTINF:')) {
            // Извлекаем информацию из строки #EXTINF
            // Формат: #EXTINF:duration,title
            const commaIndex = line.indexOf(',');
            if (commaIndex !== -1) {
                const title = line.substring(commaIndex + 1); // Название после запятой
                
                // Следующая строка должна содержать URL
                if (i + 1 < lines.length) {
                    i++; // Переходим к следующей строке
                    const url = lines[i]; // Это должен быть URL
                    
                    // Проверяем, является ли строка действительным URL
                    try {
                        new URL(url);
                        parsedPlaylist.push({
                            title: title,
                            url: url
                        });
                    } catch (e) {
                        console.warn(`Некорректный URL: ${url}`);
                    }
                }
            }
        }
    }
    
    return parsedPlaylist;
}

// Обработка файла плейлиста
function handlePlaylistFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            playlist = parseM3U(content);
            
            if (playlist.length > 0) {
                currentVideoIndex = 0;
                playCurrentVideo();
                
                // Попробуем автоматически загрузить соответствующий файл правил пропуска
                attemptToLoadSkipRules(file.name);
            } else {
                alert('Плейлист не содержит допустимых записей видео');
            }
        } catch (error) {
            alert('Ошибка при чтении файла плейлиста: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Попытка автоматической загрузки файла правил пропуска
function attemptToLoadSkipRules(playlistFileName) {
    // Получаем имя файла без расширения
    const baseName = playlistFileName.replace(/\.[^/.]+$/, ""); // Убираем последнее расширение
    const skipRulesFileName = baseName + '.skip.json';
    
    // Пробуем найти файл в списке недавно выбранных файлов
    // На практике пользователь может загрузить его отдельно
    console.log(`Попытка найти файл правил пропуска: ${skipRulesFileName}`);
}

// Обработка файла правил пропуска
function handleSkipRulesFile(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            skipRules = JSON.parse(e.target.result);
            console.log('Правила пропуска загружены:', skipRules);
            
            // Если сейчас воспроизводится видео, перезапустим проверку пропусков
            if (videoPlayer.currentTime > 0) {
                checkForSkips();
            }
        } catch (error) {
            alert('Ошибка при чтении файла правил пропуска: ' + error.message);
        }
    };
    reader.readAsText(file);
}

// Воспроизведение текущего видео
function playCurrentVideo() {
    if (playlist.length === 0 || currentVideoIndex < 0 || currentVideoIndex >= playlist.length) {
        console.warn('Нет доступных видео для воспроизведения');
        return;
    }
    
    const currentVideo = playlist[currentVideoIndex];
    videoPlayer.src = currentVideo.url;
    currentVideoInfo.textContent = currentVideo.title;
    
    // Добавляем метаданные о видео в атрибут для использования в правилах пропуска
    videoPlayer.setAttribute('data-current-filename', currentVideo.title);
    
    videoPlayer.play().catch(error => {
        console.error('Ошибка воспроизведения видео:', error);
        alert('Не удалось воспроизвести видео. Возможно, проблема с CORS или доступом к источнику.');
    });
}

// Воспроизведение следующего видео
function playNextVideo() {
    if (playlist.length === 0) return;
    
    currentVideoIndex++;
    if (currentVideoIndex >= playlist.length) {
        currentVideoIndex = 0; // Вернуться к первому видео при достижении конца
    }
    
    playCurrentVideo();
}

// Воспроизведение предыдущего видео
function playPreviousVideo() {
    if (playlist.length === 0) return;
    
    currentVideoIndex--;
    if (currentVideoIndex < 0) {
        currentVideoIndex = playlist.length - 1; // Перейти к последнему видео при достижении начала
    }
    
    playCurrentVideo();
}

// Запуск проверки пропусков
function startSkipChecking() {
    // Очищаем предыдущий интервал, если он был
    if (skipCheckInterval) {
        clearInterval(skipCheckInterval);
    }
    
    // Устанавливаем интервал проверки пропусков
    skipCheckInterval = setInterval(checkForSkips, 300); // Проверяем каждые 300мс
}

// Проверка необходимости пропуска фрагментов видео
function checkForSkips() {
    if (!videoPlayer || !videoPlayer.readyState) return;
    
    const currentTime = videoPlayer.currentTime;
    const currentFilename = videoPlayer.getAttribute('data-current-filename');
    
    if (!currentFilename || !skipRules[currentFilename]) {
        return; // Нет правил пропуска для этого видео
    }
    
    const rules = skipRules[currentFilename];
    
    // Проверяем каждый диапазон пропуска
    for (const [start, end] of rules) {
        // Если текущее время находится в диапазоне пропуска или близко к началу
        if (currentTime >= start && currentTime < end) {
            console.log(`Пропуск диапазона: ${start}s - ${end}s`);
            // Переход к концу диапазона
            videoPlayer.currentTime = end;
            break; // Выходим, чтобы не обрабатывать другие диапазоны
        }
        
        // Также проверяем, приближается ли время к началу диапазона (с запасом 0.3с)
        if (currentTime >= start - 0.3 && currentTime < start) {
            console.log(`Авто-пропуск к диапазону: ${start}s - ${end}s`);
            videoPlayer.currentTime = end;
            break;
        }
    }
}

// Запуск приложения при загрузке страницы
window.addEventListener('DOMContentLoaded', initApp);

// Обработка события разрешения на работу с fullscreen API
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('MSFullscreenChange', handleFullscreenChange);

function handleFullscreenChange() {
    if (document.fullscreenElement || 
        document.webkitFullscreenElement || 
        document.mozFullScreenElement ||
        document.msFullscreenElement) {
        // В полноэкранном режиме
        videoPlayer.classList.add('video-fullscreen');
    } else {
        // Не в полноэкранном режиме
        videoPlayer.classList.remove('video-fullscreen');
    }
}