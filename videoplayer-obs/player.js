// Глобальные переменные
let playlist = [];
let currentTrackIndex = 0;
let skipRules = {};
let playlistSource = null; // может быть именем файла или URL
let skipIntervalId = null;

// DOM элементы
const videoPlayer = document.getElementById('videoPlayer');
const playlistFileInput = document.getElementById('playlistFile');
const playlistUrlInput = document.getElementById('playlistUrl');
const loadFromUrlBtn = document.getElementById('loadFromUrlBtn');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const toggleControlsBtn = document.getElementById('toggleControlsBtn');
const editSkipBtn = document.getElementById('editSkipBtn');
const trackTitleSpan = document.getElementById('trackTitle');
const skipEditor = document.getElementById('skipEditor');
const skipList = document.getElementById('skipList');
const addSkipBtn = document.getElementById('addSkipBtn');
const skipDurationInput = document.getElementById('skipDuration');
const saveSkipRulesBtn = document.getElementById('saveSkipRulesBtn');
const closeEditorBtn = document.getElementById('closeEditorBtn');

// Инициализация приложения
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

// Инициализация приложения
function initializeApp() {
    // Проверяем параметры URL
    const urlParams = new URLSearchParams(window.location.search);
    const cleanMode = urlParams.get('clean') === '1' || urlParams.get('obs') === '1';
    
    if (cleanMode) {
        document.body.classList.add('obs-mode');
        document.body.classList.add('hidden-controls');
    }
    
    // Добавляем обработчики событий
    setupEventListeners();
    
    // Восстанавливаем последние правила пропуска из localStorage
    restoreLastPlaylist();
}

// Настройка обработчиков событий
function setupEventListeners() {
    // Загрузка локального плейлиста
    playlistFileInput.addEventListener('change', handleLocalPlaylistLoad);
    
    // Загрузка плейлиста по URL
    loadFromUrlBtn.addEventListener('click', handleUrlPlaylistLoad);
    
    // Навигация по плейлисту
    prevBtn.addEventListener('click', playPrevious);
    nextBtn.addEventListener('click', playNext);
    
    // Переключение видимости управления
    toggleControlsBtn.addEventListener('click', toggleControls);
    
    // Редактирование пропусков
    editSkipBtn.addEventListener('click', showSkipEditor);
    closeEditorBtn.addEventListener('click', hideSkipEditor);
    saveSkipRulesBtn.addEventListener('click', saveSkipRulesAsJson);
    
    // Добавление пропуска
    addSkipBtn.addEventListener('click', addSkipFromCurrentTime);
    
    // Переключение управления по клавише H
    document.addEventListener('keydown', handleKeyDown);
    
    // Запуск проверки пропусков при начале воспроизведения
    videoPlayer.addEventListener('play', startSkipChecking);
    videoPlayer.addEventListener('pause', stopSkipChecking);
    
    // При смене трека обновляем информацию
    videoPlayer.addEventListener('loadstart', updateTrackInfo);
}

// Обработка загрузки локального плейлиста
function handleLocalPlaylistLoad(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const content = e.target.result;
            playlist = parseM3U(content);
            playlistSource = file.name.replace('.m3u', '').replace('.m3u8', '');
            
            // Загружаем соответствующие правила пропуска
            loadSkipRulesForPlaylist();
            
            // Воспроизводим первый трек
            playTrack(0);
        } catch (error) {
            alert(`Ошибка при чтении плейлиста: ${error.message}`);
        }
    };
    reader.readAsText(file);
}

// Обработка загрузки плейлиста по URL
async function handleUrlPlaylistLoad() {
    const url = playlistUrlInput.value.trim();
    if (!url) {
        alert('Введите URL плейлиста');
        return;
    }
    
    try {
        const response = await fetch(url, { mode: 'cors' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const content = await response.text();
        playlist = parseM3U(content);
        playlistSource = url; // Сохраняем URL как источник
        
        // Загружаем соответствующие правила пропуска
        loadSkipRulesForPlaylist();
        
        // Воспроизводим первый трек
        playTrack(0);
    } catch (error) {
        console.error('Ошибка при загрузке плейлиста:', error);
        alert(`Ошибка CORS при загрузке плейлиста. Попробуйте открыть браузер с флагом --disable-web-security или загрузите файл вручную.`);
    }
}

// Парсер Extended M3U
function parseM3U(content) {
    const lines = content.split('\n').map(line => line.trim()).filter(line => line !== '');
    const tracks = [];
    
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('#EXTINF:')) {
            // Извлекаем имя файла (всё после запятой)
            const commaIndex = lines[i].indexOf(',');
            if (commaIndex !== -1) {
                const title = lines[i].substring(commaIndex + 1);
                
                // Следующая строка должна содержать URL
                if (i + 1 < lines.length) {
                    const url = lines[i + 1];
                    tracks.push({
                        title: title,
                        url: url
                    });
                    i++; // Пропускаем следующую строку (URL)
                }
            }
        }
    }
    
    return tracks;
}

// Воспроизведение трека по индексу
function playTrack(index) {
    if (playlist.length === 0) return;
    
    // Ограничиваем индекс в пределах плейлиста
    currentTrackIndex = Math.max(0, Math.min(index, playlist.length - 1));
    
    const track = playlist[currentTrackIndex];
    videoPlayer.src = track.url;
    videoPlayer.load();
    
    // Обновляем информацию о треке
    updateTrackInfo();
}

// Обновление информации о текущем треке
function updateTrackInfo() {
    if (playlist.length === 0) {
        trackTitleSpan.textContent = 'Плейлист пуст';
        return;
    }
    
    const track = playlist[currentTrackIndex];
    trackTitleSpan.textContent = `${currentTrackIndex + 1}/${playlist.length}: ${track.title}`;
}

// Воспроизведение предыдущего трека
function playPrevious() {
    if (playlist.length === 0) return;
    
    const newIndex = currentTrackIndex - 1 >= 0 ? currentTrackIndex - 1 : playlist.length - 1;
    playTrack(newIndex);
}

// Воспроизведение следующего трека
function playNext() {
    if (playlist.length === 0) return;
    
    const newIndex = currentTrackIndex + 1 < playlist.length ? currentTrackIndex + 1 : 0;
    playTrack(newIndex);
}

// Переключение видимости управления
function toggleControls() {
    const isHidden = document.body.classList.contains('hidden-controls');
    
    if (isHidden) {
        document.body.classList.remove('hidden-controls');
        toggleControlsBtn.textContent = 'Скрыть управление';
    } else {
        document.body.classList.add('hidden-controls');
        toggleControlsBtn.textContent = 'Показать управление';
    }
}

// Обработка нажатия клавиш
function handleKeyDown(event) {
    // Переключение управления по клавише H
    if (event.key.toLowerCase() === 'h') {
        toggleControls();
    }
}

// Проверка и пропуск фрагментов видео
function checkAndSkip() {
    if (playlist.length === 0) return;
    
    const track = playlist[currentTrackIndex];
    const currentTime = videoPlayer.currentTime;
    
    // Получаем правила пропуска для текущего трека
    const trackSkipRules = skipRules[track.title] || [];
    
    for (const [start, end] of trackSkipRules) {
        // Проверяем, находится ли текущее время в промежутке пропуска
        if (currentTime >= start - 0.3 && currentTime <= end) {
            // Перематываем к концу пропуска
            videoPlayer.currentTime = end;
            break;
        }
    }
}

// Запуск проверки пропусков
function startSkipChecking() {
    if (skipIntervalId) {
        clearInterval(skipIntervalId);
    }
    
    // Проверяем каждые 150 мс
    skipIntervalId = setInterval(checkAndSkip, 150);
}

// Остановка проверки пропусков
function stopSkipChecking() {
    if (skipIntervalId) {
        clearInterval(skipIntervalId);
        skipIntervalId = null;
    }
}

// Отображение редактора пропусков
function showSkipEditor() {
    skipEditor.style.display = 'block';
    renderSkipList();
}

// Скрытие редактора пропусков
function hideSkipEditor() {
    skipEditor.style.display = 'none';
}

// Рендер списка пропусков
function renderSkipList() {
    skipList.innerHTML = '';
    
    if (playlist.length === 0 || !playlist[currentTrackIndex]) {
        skipList.innerHTML = '<p>Нет активного трека</p>';
        return;
    }
    
    const track = playlist[currentTrackIndex];
    const trackSkipRules = skipRules[track.title] || [];
    
    if (trackSkipRules.length === 0) {
        skipList.innerHTML = '<p>Нет правил пропуска для этого трека</p>';
        return;
    }
    
    trackSkipRules.forEach((rule, index) => {
        const [start, end] = rule;
        const startTime = formatTime(start);
        const endTime = formatTime(end);
        
        const skipItem = document.createElement('div');
        skipItem.className = 'skip-item';
        skipItem.innerHTML = `
            <span>${startTime}–${endTime}</span>
            <div>
                <button class="edit-skip-btn" data-index="${index}">Изменить</button>
                <button class="delete-skip-btn" data-index="${index}">Удалить</button>
            </div>
        `;
        
        skipList.appendChild(skipItem);
    });
    
    // Добавляем обработчики для кнопок
    document.querySelectorAll('.delete-skip-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            deleteSkipRule(track.title, index);
        });
    });
    
    document.querySelectorAll('.edit-skip-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.getAttribute('data-index'));
            editSkipRule(track.title, index);
        });
    });
}

// Форматирование времени в формат MM:SS
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Добавление пропуска с текущей позиции
function addSkipFromCurrentTime() {
    if (playlist.length === 0) {
        alert('Нет активного трека');
        return;
    }
    
    const track = playlist[currentTrackIndex];
    const currentTime = videoPlayer.currentTime;
    const duration = parseFloat(skipDurationInput.value);
    
    if (isNaN(duration) || duration <= 0) {
        alert('Введите корректную длительность пропуска');
        return;
    }
    
    const endTime = currentTime + duration;
    
    // Добавляем правило пропуска
    if (!skipRules[track.title]) {
        skipRules[track.title] = [];
    }
    
    skipRules[track.title].push([currentTime, endTime]);
    
    // Сортируем правила по времени начала
    skipRules[track.title].sort((a, b) => a[0] - b[0]);
    
    // Сохраняем в localStorage
    saveSkipRulesToStorage();
    
    // Обновляем список
    renderSkipList();
    
    // Очищаем поле ввода
    skipDurationInput.value = '';
}

// Удаление правила пропуска
function deleteSkipRule(trackTitle, ruleIndex) {
    if (skipRules[trackTitle] && skipRules[trackTitle][ruleIndex]) {
        skipRules[trackTitle].splice(ruleIndex, 1);
        
        // Сохраняем в localStorage
        saveSkipRulesToStorage();
        
        // Обновляем список
        renderSkipList();
    }
}

// Редактирование правила пропуска
function editSkipRule(trackTitle, ruleIndex) {
    if (skipRules[trackTitle] && skipRules[trackTitle][ruleIndex]) {
        const [start, end] = skipRules[trackTitle][ruleIndex];
        
        // Пока просто удалим и добавим новое правило
        // В реальной реализации можно было бы показать форму редактирования
        const newStart = prompt('Введите новое время начала (в секундах):', start);
        const newEnd = prompt('Введите новое время окончания (в секундах):', end);
        
        if (newStart !== null && newEnd !== null) {
            const newStartNum = parseFloat(newStart);
            const newEndNum = parseFloat(newEnd);
            
            if (!isNaN(newStartNum) && !isNaN(newEndNum) && newStartNum < newEndNum) {
                skipRules[trackTitle][ruleIndex] = [newStartNum, newEndNum];
                
                // Сортируем правила по времени начала
                skipRules[trackTitle].sort((a, b) => a[0] - b[0]);
                
                // Сохраняем в localStorage
                saveSkipRulesToStorage();
                
                // Обновляем список
                renderSkipList();
            } else {
                alert('Введите корректные значения времени');
            }
        }
    }
}

// Загрузка правил пропуска для текущего плейлиста
function loadSkipRulesForPlaylist() {
    if (!playlistSource) return;
    
    // Пытаемся получить правила из localStorage
    const storedRulesKey = `skip_rules_${playlistSource}`;
    const storedRules = localStorage.getItem(storedRulesKey);
    
    if (storedRules) {
        try {
            skipRules = JSON.parse(storedRules);
        } catch (error) {
            console.error('Ошибка при загрузке правил пропуска:', error);
            skipRules = {};
        }
    } else {
        skipRules = {};
    }
}

// Сохранение правил пропуска в localStorage
function saveSkipRulesToStorage() {
    if (!playlistSource) return;
    
    const storedRulesKey = `skip_rules_${playlistSource}`;
    localStorage.setItem(storedRulesKey, JSON.stringify(skipRules));
}

// Сохранение правил пропуска как JSON-файла
function saveSkipRulesAsJson() {
    if (!playlistSource) {
        alert('Нет активного плейлиста для сохранения');
        return;
    }
    
    // Создаём объект с правилами только для текущего плейлиста
    const rulesToSave = {...skipRules};
    
    // Создаём JSON строку
    const jsonString = JSON.stringify(rulesToSave, null, 2);
    
    // Создаём Blob и ссылку для скачивания
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `${playlistSource}.skip.json`;
    document.body.appendChild(a);
    a.click();
    
    // Удаляем временную ссылку
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// Восстановление последнего использованного плейлиста
function restoreLastPlaylist() {
    // Эта функция будет вызываться при инициализации
    // В реальной реализации можно сохранять информацию о последнем плейлисте
    // и восстанавливать его при следующем запуске
}