// Глобальные переменные
let playlist = [];
let currentVideoIndex = 0;
let skipRules = {}; // Хранит правила пропуска для каждого видео
let playlistKey = null; // Ключ для сохранения/загрузки правил
let autoSkipInterval = null;

// DOM элементы
const videoPlayer = document.getElementById('video-player');
const playlistFileInput = document.getElementById('playlist-file');
const playlistUrlInput = document.getElementById('playlist-url');
const loadUrlBtn = document.getElementById('load-url-btn');
const prevBtn = document.getElementById('prev-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const nextBtn = document.getElementById('next-btn');
const currentVideoInfo = document.getElementById('current-video-info');
const toggleSkipEditorBtn = document.getElementById('toggle-skip-editor');
const skipEditor = document.getElementById('skip-editor');
const skipList = document.getElementById('skip-list');
const addSkipBtn = document.getElementById('add-skip-btn');
const downloadSkipRulesBtn = document.getElementById('download-skip-rules');
const closeSkipEditorBtn = document.getElementById('close-skip-editor');
const toggleControlsBtn = document.getElementById('toggle-controls');

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Инициализация приложения
function initializeApp() {
    setupEventListeners();
    checkUrlParams();
    loadSavedSkipRules();
}

// Проверка параметров URL
function checkUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const isCleanMode = urlParams.get('clean') === '1' || urlParams.get('obs') === '1';
    
    if (isCleanMode) {
        document.body.setAttribute('data-obs-mode', 'true');
        document.body.setAttribute('data-controls-hidden', 'true');
    }
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Загрузка плейлиста из файла
    playlistFileInput.addEventListener('change', handlePlaylistFileSelect);
    
    // Загрузка плейлиста по URL
    loadUrlBtn.addEventListener('click', loadPlaylistFromUrl);
    
    // Управление воспроизведением
    prevBtn.addEventListener('click', playPreviousVideo);
    playPauseBtn.addEventListener('click', togglePlayPause);
    nextBtn.addEventListener('click', playNextVideo);
    
    // Переключение редактора пропусков
    toggleSkipEditorBtn.addEventListener('click', toggleSkipEditor);
    closeSkipEditorBtn.addEventListener('click', () => {
        skipEditor.classList.remove('active');
    });
    
    // Добавление пропуска
    addSkipBtn.addEventListener('click', openAddSkipModal);
    
    // Сохранение правил пропуска
    downloadSkipRulesBtn.addEventListener('click', downloadSkipRules);
    
    // Переключение видимости управления
    toggleControlsBtn.addEventListener('click', toggleControlsVisibility);
    
    // Обработка клавиши H для скрытия/показа управления
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'h') {
            toggleControlsVisibility();
        }
    });
    
    // Обработка окончания видео
    videoPlayer.addEventListener('ended', handleVideoEnd);
    
    // Проверка пропусков во время воспроизведения
    startAutoSkipCheck();
}

// Загрузка правил пропуска из localStorage
function loadSavedSkipRules() {
    const savedRules = localStorage.getItem('skipRules');
    if (savedRules) {
        try {
            skipRules = JSON.parse(savedRules);
        } catch (e) {
            console.error('Ошибка при загрузке правил пропуска:', e);
        }
    }
}

// Сохранение правил пропуска в localStorage
function saveSkipRules() {
    localStorage.setItem('skipRules', JSON.stringify(skipRules));
}

// Обработка выбора файла плейлиста
function handlePlaylistFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        parsePlaylist(content);
        playlistKey = file.name.replace(/\.[^/.]+$/, ""); // Имя файла без расширения
        loadSkipRulesForPlaylist(); // Загружаем соответствующие правила пропуска
        playVideoAt(0);
    };
    reader.readAsText(file);
}

// Загрузка плейлиста по URL
async function loadPlaylistFromUrl() {
    const url = playlistUrlInput.value.trim();
    if (!url) {
        alert('Пожалуйста, введите URL плейлиста');
        return;
    }
    
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const content = await response.text();
        parsePlaylist(content);
        playlistKey = url; // Используем URL как ключ
        loadSkipRulesForPlaylist(); // Загружаем соответствующие правила пропуска
        playVideoAt(0);
    } catch (error) {
        console.error('Ошибка при загрузке плейлиста:', error);
        alert('Ошибка CORS. Попробуйте открыть браузер с флагом --disable-web-security или загрузите файл вручную.');
    }
}

// Парсинг плейлиста в формате Extended M3U
function parsePlaylist(content) {
    const lines = content.split('\n').filter(line => line.trim() !== '');
    playlist = [];
    
    let currentTitle = '';
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('#EXTINF:')) {
            // Извлекаем название видео
            const info = line.substring('#EXTINF:'.length);
            const commaIndex = info.indexOf(',');
            if (commaIndex !== -1) {
                currentTitle = info.substring(commaIndex + 1);
            }
        } else if (line.startsWith('#') || line === '') {
            // Пропускаем комментарии и пустые строки
            continue;
        } else {
            // Это URL видео
            playlist.push({
                title: currentTitle || line,
                url: line
            });
            currentTitle = '';
        }
    }
    
    updateCurrentVideoInfo();
}

// Воспроизведение видео по индексу
function playVideoAt(index) {
    if (index < 0 || index >= playlist.length) return;
    
    currentVideoIndex = index;
    const video = playlist[currentVideoIndex];
    
    videoPlayer.src = video.url;
    videoPlayer.load();
    videoPlayer.play();
    
    updateCurrentVideoInfo();
}

// Обновление информации о текущем видео
function updateCurrentVideoInfo() {
    if (playlist.length > 0) {
        const video = playlist[currentVideoIndex];
        currentVideoInfo.textContent = `${currentVideoIndex + 1}/${playlist.length}: ${video.title}`;
    } else {
        currentVideoInfo.textContent = 'Нет загруженного плейлиста';
    }
}

// Воспроизведение предыдущего видео
function playPreviousVideo() {
    if (playlist.length === 0) return;
    
    let newIndex = currentVideoIndex - 1;
    if (newIndex < 0) newIndex = playlist.length - 1;
    
    playVideoAt(newIndex);
}

// Воспроизведение следующего видео
function playNextVideo() {
    if (playlist.length === 0) return;
    
    let newIndex = currentVideoIndex + 1;
    if (newIndex >= playlist.length) newIndex = 0;
    
    playVideoAt(newIndex);
}

// Переключение воспроизведения/паузы
function togglePlayPause() {
    if (videoPlayer.paused) {
        videoPlayer.play();
        playPauseBtn.textContent = 'Пауза';
    } else {
        videoPlayer.pause();
        playPauseBtn.textContent = 'Воспроизвести';
    }
}

// Обработка окончания видео
function handleVideoEnd() {
    playNextVideo();
}

// Начало проверки пропусков
function startAutoSkipCheck() {
    if (autoSkipInterval) clearInterval(autoSkipInterval);
    
    autoSkipInterval = setInterval(() => {
        if (playlist.length === 0 || !videoPlayer.src) return;
        
        const currentVideo = playlist[currentVideoIndex];
        if (!currentVideo) return;
        
        const currentTime = videoPlayer.currentTime;
        const videoTitle = currentVideo.title;
        
        if (skipRules[playlistKey] && skipRules[playlistKey][videoTitle]) {
            const rules = skipRules[playlistKey][videoTitle];
            
            for (const rule of rules) {
                const [start, end] = rule;
                
                // Проверяем, находится ли текущее время в диапазоне пропуска
                if (currentTime >= start - 0.3 && currentTime <= end) {
                    // Перематываем к концу пропуска
                    videoPlayer.currentTime = end;
                    break;
                }
            }
        }
    }, 150); // Проверяем каждые 150 мс
}

// Переключение видимости редактора пропусков
function toggleSkipEditor() {
    skipEditor.classList.toggle('active');
    renderSkipList();
}

// Отображение списка пропусков
function renderSkipList() {
    if (!playlistKey || !skipRules[playlistKey]) {
        skipList.innerHTML = '<p>Нет правил пропуска для этого плейлиста</p>';
        return;
    }
    
    const currentVideo = playlist[currentVideoIndex];
    if (!currentVideo) {
        skipList.innerHTML = '<p>Нет активного видео</p>';
        return;
    }
    
    const videoTitle = currentVideo.title;
    const videoSkipRules = skipRules[playlistKey][videoTitle] || [];
    
    if (videoSkipRules.length === 0) {
        skipList.innerHTML = '<p>Для этого видео нет правил пропуска</p>';
        return;
    }
    
    skipList.innerHTML = '';
    
    videoSkipRules.forEach((rule, index) => {
        const [start, end] = rule;
        const startTimeFormatted = formatTime(start);
        const endTimeFormatted = formatTime(end);
        
        const skipItem = document.createElement('div');
        skipItem.className = 'skip-item';
        skipItem.innerHTML = `
            <div class="skip-times">${startTimeFormatted} – ${endTimeFormatted}</div>
            <div class="skip-actions">
                <button class="edit-btn" data-index="${index}">Изменить</button>
                <button class="delete-btn" data-index="${index}">Удалить</button>
            </div>
        `;
        
        skipList.appendChild(skipItem);
    });
    
    // Добавляем обработчики для кнопок изменения и удаления
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            openEditSkipModal(index);
        });
    });
    
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            deleteSkipRule(index);
        });
    });
}

// Форматирование времени в формат MM:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Преобразование времени из формата MM:SS в секунды
function parseTime(timeStr) {
    const parts = timeStr.split(':');
    if (parts.length !== 2) return 0;
    
    const mins = parseInt(parts[0]) || 0;
    const secs = parseInt(parts[1]) || 0;
    
    return mins * 60 + secs;
}

// Открытие модального окна для добавления пропуска
function openAddSkipModal() {
    if (!playlistKey || !playlist[currentVideoIndex]) {
        alert('Сначала загрузите плейлист и начните воспроизведение');
        return;
    }
    
    const currentTime = Math.floor(videoPlayer.currentTime);
    const currentTimeFormatted = formatTime(currentTime);
    
    const modal = document.createElement('div');
    modal.className = 'add-skip-modal';
    modal.innerHTML = `
        <div class="add-skip-modal-content">
            <h3>Добавить правило пропуска</h3>
            <form class="add-skip-form">
                <div>
                    <label>Начало (текущее время):</label>
                    <input type="text" id="start-time" value="${currentTimeFormatted}" readonly>
                </div>
                <div>
                    <label>Конец (MM:SS):</label>
                    <input type="text" id="end-time" placeholder="00:15" required>
                </div>
                <div>
                    <label>Или продолжительность (секунды):</label>
                    <input type="number" id="duration" min="1" placeholder="15">
                </div>
                <div class="add-skip-form-buttons">
                    <button type="button" class="cancel-btn">Отмена</button>
                    <button type="submit" class="confirm-btn">Добавить</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const endTimeInput = modal.querySelector('#end-time');
    const durationInput = modal.querySelector('#duration');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const form = modal.querySelector('.add-skip-form');
    
    // При изменении одного поля, автоматически обновляем другое
    durationInput.addEventListener('input', () => {
        const duration = parseInt(durationInput.value) || 0;
        if (duration > 0) {
            const endTime = currentTime + duration;
            endTimeInput.value = formatTime(endTime);
        }
    });
    
    endTimeInput.addEventListener('input', () => {
        const endTime = parseTime(endTimeInput.value);
        if (endTime > currentTime) {
            durationInput.value = endTime - currentTime;
        }
    });
    
    // Обработчик формы
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const startTime = currentTime;
        const endTime = parseTime(endTimeInput.value);
        
        if (endTime <= startTime) {
            alert('Время окончания должно быть больше времени начала');
            return;
        }
        
        addSkipRule(startTime, endTime);
        document.body.removeChild(modal);
    });
    
    // Обработчик отмены
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

// Открытие модального окна для редактирования пропуска
function openEditSkipModal(index) {
    if (!playlistKey || !playlist[currentVideoIndex]) return;
    
    const videoTitle = playlist[currentVideoIndex].title;
    if (!skipRules[playlistKey] || !skipRules[playlistKey][videoTitle]) return;
    
    const rules = skipRules[playlistKey][videoTitle];
    if (index < 0 || index >= rules.length) return;
    
    const [start, end] = rules[index];
    const startTimeFormatted = formatTime(start);
    const endTimeFormatted = formatTime(end);
    const duration = end - start;
    
    const modal = document.createElement('div');
    modal.className = 'add-skip-modal';
    modal.innerHTML = `
        <div class="add-skip-modal-content">
            <h3>Редактировать правило пропуска</h3>
            <form class="add-skip-form">
                <div>
                    <label>Начало (MM:SS):</label>
                    <input type="text" id="start-time" value="${startTimeFormatted}" required>
                </div>
                <div>
                    <label>Конец (MM:SS):</label>
                    <input type="text" id="end-time" value="${endTimeFormatted}" required>
                </div>
                <div>
                    <label>Или продолжительность (секунды):</label>
                    <input type="number" id="duration" min="1" value="${duration}">
                </div>
                <div class="add-skip-form-buttons">
                    <button type="button" class="cancel-btn">Отмена</button>
                    <button type="submit" class="confirm-btn">Сохранить</button>
                </div>
            </form>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const startTimeInput = modal.querySelector('#start-time');
    const endTimeInput = modal.querySelector('#end-time');
    const durationInput = modal.querySelector('#duration');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const form = modal.querySelector('.add-skip-form');
    
    // При изменении одного поля, автоматически обновляем другие
    durationInput.addEventListener('input', () => {
        const startSeconds = parseTime(startTimeInput.value);
        const duration = parseInt(durationInput.value) || 0;
        if (duration > 0) {
            const endTime = startSeconds + duration;
            endTimeInput.value = formatTime(endTime);
        }
    });
    
    startTimeInput.addEventListener('input', () => {
        const startSeconds = parseTime(startTimeInput.value);
        const endSeconds = parseTime(endTimeInput.value);
        if (endSeconds >= startSeconds) {
            durationInput.value = endSeconds - startSeconds;
        }
    });
    
    endTimeInput.addEventListener('input', () => {
        const startSeconds = parseTime(startTimeInput.value);
        const endSeconds = parseTime(endTimeInput.value);
        if (endSeconds >= startSeconds) {
            durationInput.value = endSeconds - startSeconds;
        }
    });
    
    // Обработчик формы
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const newStart = parseTime(startTimeInput.value);
        const newEnd = parseTime(endTimeInput.value);
        
        if (newEnd <= newStart) {
            alert('Время окончания должно быть больше времени начала');
            return;
        }
        
        updateSkipRule(index, newStart, newEnd);
        document.body.removeChild(modal);
    });
    
    // Обработчик отмены
    cancelBtn.addEventListener('click', () => {
        document.body.removeChild(modal);
    });
}

// Добавление правила пропуска
function addSkipRule(startTime, endTime) {
    if (!playlistKey) return;
    
    const videoTitle = playlist[currentVideoIndex].title;
    
    // Инициализируем объект правил, если он не существует
    if (!skipRules[playlistKey]) {
        skipRules[playlistKey] = {};
    }
    
    if (!skipRules[playlistKey][videoTitle]) {
        skipRules[playlistKey][videoTitle] = [];
    }
    
    // Добавляем новое правило
    skipRules[playlistKey][videoTitle].push([startTime, endTime]);
    
    // Сортируем правила по времени начала
    skipRules[playlistKey][videoTitle].sort((a, b) => a[0] - b[0]);
    
    // Сохраняем правила
    saveSkipRules();
    
    // Обновляем список
    renderSkipList();
}

// Обновление правила пропуска
function updateSkipRule(index, startTime, endTime) {
    if (!playlistKey) return;
    
    const videoTitle = playlist[currentVideoIndex].title;
    
    if (!skipRules[playlistKey] || !skipRules[playlistKey][videoTitle]) return;
    
    const rules = skipRules[playlistKey][videoTitle];
    
    if (index < 0 || index >= rules.length) return;
    
    // Обновляем правило
    rules[index] = [startTime, endTime];
    
    // Сортируем правила по времени начала
    rules.sort((a, b) => a[0] - b[0]);
    
    // Сохраняем правила
    saveSkipRules();
    
    // Обновляем список
    renderSkipList();
}

// Удаление правила пропуска
function deleteSkipRule(index) {
    if (!playlistKey) return;
    
    const videoTitle = playlist[currentVideoIndex].title;
    
    if (!skipRules[playlistKey] || !skipRules[playlistKey][videoTitle]) return;
    
    const rules = skipRules[playlistKey][videoTitle];
    
    if (index < 0 || index >= rules.length) return;
    
    // Удаляем правило
    rules.splice(index, 1);
    
    // Если массив стал пустым, удаляем ключ
    if (rules.length === 0) {
        delete skipRules[playlistKey][videoTitle];
        
        // Если внутри плейлиста не осталось видео с правилами, удаляем и сам плейлист
        if (Object.keys(skipRules[playlistKey]).length === 0) {
            delete skipRules[playlistKey];
        }
    }
    
    // Сохраняем правила
    saveSkipRules();
    
    // Обновляем список
    renderSkipList();
}

// Загрузка правил пропуска для текущего плейлиста
function loadSkipRulesForPlaylist() {
    if (!playlistKey) return;
    
    // Проверяем, есть ли уже сохраненные правила для этого плейлиста
    if (skipRules[playlistKey]) {
        console.log('Загружены сохраненные правила пропуска для плейлиста:', playlistKey);
    } else {
        console.log('Для этого плейлиста нет сохраненных правил пропуска');
    }
}

// Скачивание правил пропуска в формате JSON
function downloadSkipRules() {
    if (!playlistKey) {
        alert('Нет загруженного плейлиста');
        return;
    }
    
    if (!skipRules[playlistKey] || Object.keys(skipRules[playlistKey]).length === 0) {
        alert('Нет правил пропуска для скачивания');
        return;
    }
    
    const filename = `${playlistKey}.skip.json`;
    const jsonStr = JSON.stringify(skipRules[playlistKey], null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    // Очистка
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// Переключение видимости элементов управления
function toggleControlsVisibility() {
    const isHidden = document.body.getAttribute('data-controls-hidden') === 'true';
    
    if (isHidden) {
        document.body.setAttribute('data-controls-hidden', 'false');
        toggleControlsBtn.textContent = 'Скрыть управление';
    } else {
        document.body.setAttribute('data-controls-hidden', 'true');
        toggleControlsBtn.textContent = 'Показать управление';
    }
}