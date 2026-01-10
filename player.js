// Глобальные переменные приложения
let playlist = []; // Массив с элементами плейлиста {title, url}
let currentVideoIndex = 0; // Индекс текущего видео
let skipRules = {}; // Объект с правилами пропуска {filename: [[start, end], ...]}
let isCleanMode = false; // Режим для OBS (скрытие интерфейса)
let isFullCleanMode = false; // Полностью скрытый режим
let skipCheckInterval = null; // Интервал проверки пропусков
let currentPlaylistName = ''; // Имя текущего плейлиста для сохранения

// Получение элементов DOM
const videoPlayer = document.getElementById('video-player');
const currentTitle = document.getElementById('current-title');
const controls = document.getElementById('controls');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const loadLocalBtn = document.getElementById('load-local-btn');
const m3uFileInput = document.getElementById('m3u-file-input');
const m3uUrlInput = document.getElementById('m3u-url-input');
const loadUrlBtn = document.getElementById('load-url-btn');
const editSkipsBtn = document.getElementById('edit-skips-btn');
const saveSkipsBtn = document.getElementById('save-skips-btn');
const skipEditor = document.getElementById('skip-editor');
const closeEditorBtn = document.getElementById('close-editor-btn');
const addSkipBtn = document.getElementById('add-skip-btn');
const skipList = document.getElementById('skip-list');
const editingFilename = document.getElementById('editing-filename');
const currentVideoTime = document.getElementById('current-video-time');
const skipJsonInput = document.getElementById('skip-json-input');

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
    loadLocalBtn.addEventListener('click', () => m3uFileInput.click());
    loadUrlBtn.addEventListener('click', loadPlaylistFromUrl);
    editSkipsBtn.addEventListener('click', openSkipEditor);
    saveSkipsBtn.addEventListener('click', saveSkipRulesAsJSON);
    closeEditorBtn.addEventListener('click', closeSkipEditor);
    addSkipBtn.addEventListener('click', addSkipRange);
    
    // Обработчики выбора файлов
    m3uFileInput.addEventListener('change', handlePlaylistFile);
    skipJsonInput.addEventListener('change', handleSkipRulesFile);
    
    // Обработчик смены видео
    videoPlayer.addEventListener('ended', playNextVideo);
    
    // Обработчик двойного клика для полноэкранного режима
    videoPlayer.addEventListener('dblclick', toggleFullscreen);
    
    // Обработчик клавиш (F11 для полноэкранного режима)
    document.addEventListener('keydown', handleKeyPress);
    
    // Запуск проверки пропусков при начале воспроизведения
    videoPlayer.addEventListener('play', startSkipChecking);
    videoPlayer.addEventListener('timeupdate', checkForSkips);
    
    // Обновление времени видео для редактора пропусков
    videoPlayer.addEventListener('timeupdate', updateCurrentVideoTime);
}

// Обработка нажатий клавиш
function handleKeyPress(event) {
    // F11 для полноэкранного режима
    if (event.key === 'F11') {
        event.preventDefault();
        toggleFullscreen();
    }
    
    // Закрытие редактора пропусков по Escape
    if (event.key === 'Escape' && !skipEditor.classList.contains('hidden')) {
        closeSkipEditor();
    }
}

// Загрузка плейлиста по URL
async function loadPlaylistFromUrl() {
    const url = m3uUrlInput.value.trim();
    if (!url) {
        alert('Пожалуйста, введите URL плейлиста');
        return;
    }
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Ошибка загрузки: ${response.status} ${response.statusText}`);
        }
        const content = await response.text();
        
        // Извлечение имени плейлиста из URL
        currentPlaylistName = url.split('/').pop().split('.')[0];
        
        playlist = parseM3U(content);
        if (playlist.length > 0) {
            currentVideoIndex = 0;
            playCurrentVideo();
            
            // Попытка загрузить соответствующий файл правил пропуска
            attemptToLoadSkipRulesByUrl(url);
        } else {
            alert('Плейлист не содержит допустимых записей видео');
        }
    } catch (error) {
        console.error('Ошибка при загрузке плейлиста:', error);
        alert(`Ошибка при загрузке плейлиста по URL: ${error.message}\n\nВозможные решения:\n1. Убедитесь, что URL доступен\n2. Запустите браузер с флагом --disable-web-security (для Chrome/Edge)\n3. Используйте Browser Source в OBS с включённым «Ignore CORS»`);
    }
}

// Попытка загрузки файла правил пропуска по URL плейлиста
async function attemptToLoadSkipRulesByUrl(playlistUrl) {
    try {
        // Формируем URL для файла правил пропуска
        const skipUrl = playlistUrl.replace(/\.m3u/i, '.skip.json');
        const response = await fetch(skipUrl);
        
        if (response.ok) {
            const skipContent = await response.text();
            skipRules = JSON.parse(skipContent);
            console.log('Правила пропуска загружены по URL:', skipRules);
        }
    } catch (error) {
        console.log('Файл правил пропуска не найден по URL:', error.message);
    }
}

// Открытие редактора пропусков
function openSkipEditor() {
    if (playlist.length === 0 || !videoPlayer.src) {
        alert('Сначала загрузите плейлист');
        return;
    }
    
    const currentFilename = videoPlayer.getAttribute('data-current-filename');
    if (!currentFilename) {
        alert('Не удалось получить имя текущего видео');
        return;
    }
    
    editingFilename.textContent = currentFilename;
    skipEditor.classList.remove('hidden');
    
    // Обновляем список пропусков
    updateSkipList(currentFilename);
}

// Закрытие редактора пропусков
function closeSkipEditor() {
    skipEditor.classList.add('hidden');
}

// Обновление списка пропусков в редакторе
function updateSkipList(filename) {
    skipList.innerHTML = '';
    
    const rules = skipRules[filename] || [];
    if (rules.length === 0) {
        skipList.innerHTML = '<p>Нет заданных пропусков для этого видео</p>';
        return;
    }
    
    rules.forEach((range, index) => {
        const [start, end] = range;
        const startTime = formatTime(start);
        const endTime = formatTime(end);
        
        const skipItem = document.createElement('div');
        skipItem.className = 'skip-item';
        skipItem.innerHTML = `
            <span>${startTime}–${endTime}</span>
            <button class="remove-skip-btn" data-index="${index}">Удалить</button>
            <button class="edit-skip-btn" data-index="${index}">Редактировать</button>
        `;
        
        skipList.appendChild(skipItem);
    });
    
    // Добавляем обработчики для кнопок удаления и редактирования
    document.querySelectorAll('.remove-skip-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            removeSkipRange(filename, index);
        });
    });
    
    document.querySelectorAll('.edit-skip-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const index = parseInt(this.getAttribute('data-index'));
            editSkipRange(filename, index);
        });
    });
}

// Форматирование времени в формат MM:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Добавление нового диапазона пропуска
function addSkipRange() {
    const currentFilename = videoPlayer.getAttribute('data-current-filename');
    if (!currentFilename) return;
    
    const currentTime = videoPlayer.currentTime;
    
    // Проверяем, входит ли текущее время в уже существующий пропуск
    const existingRules = skipRules[currentFilename] || [];
    for (const [start, end] of existingRules) {
        if (currentTime >= start && currentTime <= end) {
            alert('Текущее время уже находится в диапазоне пропуска');
            return;
        }
    }
    
    // Запрашиваем длительность пропуска у пользователя
    const durationStr = prompt('Введите длительность пропуска в секундах (например, 15):', '15');
    if (!durationStr) return;
    
    const duration = parseFloat(durationStr);
    if (isNaN(duration) || duration <= 0) {
        alert('Неверная длительность пропуска');
        return;
    }
    
    const startTime = currentTime;
    const endTime = currentTime + duration;
    
    // Создаем массив правил, если его нет
    if (!skipRules[currentFilename]) {
        skipRules[currentFilename] = [];
    }
    
    // Добавляем новый диапазон
    skipRules[currentFilename].push([startTime, endTime]);
    
    // Сортируем диапазоны по времени начала
    skipRules[currentFilename].sort((a, b) => a[0] - b[0]);
    
    // Обновляем список в интерфейсе
    updateSkipList(currentFilename);
    
    console.log('Добавлен пропуск:', { filename: currentFilename, start: startTime, end: endTime });
}

// Удаление диапазона пропуска
function removeSkipRange(filename, index) {
    if (!skipRules[filename] || index < 0 || index >= skipRules[filename].length) {
        return;
    }
    
    skipRules[filename].splice(index, 1);
    updateSkipList(filename);
}

// Редактирование диапазона пропуска
function editSkipRange(filename, index) {
    if (!skipRules[filename] || index < 0 || index >= skipRules[filename].length) {
        return;
    }
    
    const [start, end] = skipRules[filename][index];
    const newStartStr = prompt('Введите новое начальное время (в секундах):', start.toFixed(1));
    if (newStartStr === null) return; // Пользователь отменил
    
    const newStart = parseFloat(newStartStr);
    if (isNaN(newStart) || newStart < 0) {
        alert('Неверное начальное время');
        return;
    }
    
    const newEndStr = prompt('Введите новое конечное время (в секундах):', end.toFixed(1));
    if (newEndStr === null) return; // Пользователь отменил
    
    const newEnd = parseFloat(newEndStr);
    if (isNaN(newEnd) || newEnd <= newStart) {
        alert('Неверное конечное время (должно быть больше начального)');
        return;
    }
    
    skipRules[filename][index] = [newStart, newEnd];
    
    // Сортируем диапазоны по времени начала
    skipRules[filename].sort((a, b) => a[0] - b[0]);
    
    updateSkipList(filename);
}

// Сохранение правил пропуска как JSON-файла
function saveSkipRulesAsJSON() {
    if (Object.keys(skipRules).length === 0) {
        alert('Нет правил пропуска для сохранения');
        return;
    }
    
    const jsonContent = JSON.stringify(skipRules, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    
    // Формируем имя файла
    let filename = 'skip_rules.json';
    if (currentPlaylistName) {
        filename = currentPlaylistName + '.skip.json';
    }
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // Удаляем элемент после скачивания
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}

// Обновление отображения текущего времени видео
function updateCurrentVideoTime() {
    if (!skipEditor.classList.contains('hidden')) {
        const time = videoPlayer.currentTime;
        currentVideoTime.textContent = formatTime(time);
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
    
    // Извлекаем имя файла без расширения для сохранения
    currentPlaylistName = file.name.replace(/\.[^/.]+$/, "");
    
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
    currentTitle.textContent = currentVideo.title;
    
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
    skipCheckInterval = setInterval(checkForSkips, 150); // Проверяем каждые 150мс (между 100-200мс как требовалось)
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