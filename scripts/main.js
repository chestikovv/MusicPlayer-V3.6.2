const DEFAULT_PLAYLIST = "Все треки";
let playlists = {
    [DEFAULT_PLAYLIST]: {
        name: DEFAULT_PLAYLIST,
        tracks: [],
        cover: null
    }
};
let activePlaylist = DEFAULT_PLAYLIST;
let activeAlbum = null;
let currentTrackIndex = -1;
let isRepeat = false, isShuffle = false;
let searchQuery = "", editTarget = null, draggedIndex = null;
let bgUrl = null;
let albums = {};
let playerOrientation = 'vertical';
let displayMode = localStorage.getItem('displayMode') || 'artist';
let sleepTimerInterval = null;
let sleepTimerEndTime = null;
let abLoop = { active: false, a: null, b: null };
let isSidebarCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
let isTracksPanelCollapsed = localStorage.getItem('tracksPanelCollapsed') === 'true';

const audio = document.getElementById('audio-core');
const progress = document.getElementById('progress-slider');
const volumeSlider = document.getElementById('volume-slider');
const dz = document.getElementById('drop-zone');
const dbName = "ChestikovvMusicDB";
let db;
let currentArtistsList = [];

const DEFAULT_COLORS = {
    accent: 'rgb(180, 180, 180)',
    panel: 'rgba(0,0,0,0.6)',
    bg: '#121212'
};

// --- ИНИЦИАЛИЗАЦИЯ БАЗЫ ДАННЫХ ---
const request = indexedDB.open(dbName, 5);

request.onupgradeneeded = (e) => {
    db = e.target.result;
    if (!db.objectStoreNames.contains('songs')) {
        db.createObjectStore('songs', { keyPath: 'id', autoIncrement: true });
    }
    if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
    }
    if (!db.objectStoreNames.contains('playlist_covers')) {
        db.createObjectStore('playlist_covers');
    }
};

request.onsuccess = (e) => {
    db = e.target.result;
    loadData();
    applyPanelStates();
};

request.onerror = (e) => {
    console.error("Ошибка открытия IndexedDB:", e.target.error);
    alert("Ошибка загрузки данных плеера.");
    renderPlaylistsAndAlbums();
    renderTracksForActiveView();
};

// --- ФУНКЦИИ УПРАВЛЕНИЯ ПАНЕЛЯМИ ---
function toggleSidebar() {
    isSidebarCollapsed = !isSidebarCollapsed;
    localStorage.setItem('sidebarCollapsed', isSidebarCollapsed);
    applyPanelStates();
    renderPlaylistsAndAlbums();
    setTimeout(updateMobileNavActive, 300);
}

function toggleTracksPanel() {
    isTracksPanelCollapsed = !isTracksPanelCollapsed;
    localStorage.setItem('tracksPanelCollapsed', isTracksPanelCollapsed);
    applyPanelStates();
    renderTracksForActiveView();
    setTimeout(updateMobileNavActive, 300);
}

function applyPanelStates() {
    const sidebar = document.querySelector('.sidebar');
    const tracksPanel = document.querySelector('.tracks-panel');

    if (sidebar) {
        if (isSidebarCollapsed) {
            sidebar.classList.add('collapsed');
        } else {
            sidebar.classList.remove('collapsed');
        }
    }

    if (tracksPanel) {
        if (isTracksPanelCollapsed) {
            tracksPanel.classList.add('collapsed');
        } else {
            tracksPanel.classList.remove('collapsed');
        }
    }
}

// --- ФУНКЦИИ МЕНЮ ---
function toggleMenu() {
    const menu = document.getElementById('dropdown-menu');
    const menuBtn = document.getElementById('menu-btn');

    if (!menu || !menuBtn) return;

    if (menu.classList.contains('show')) {
        menu.classList.remove('show');
        menuBtn.classList.remove('active');
    } else {
        menu.classList.add('show');
        menuBtn.classList.add('active');
        updateMenuItems();
    }
}

document.addEventListener('click', function(e) {
    const menu = document.getElementById('dropdown-menu');
    const menuBtn = document.getElementById('menu-btn');

    if (menu && menuBtn) {
        if (!menuBtn.contains(e.target) && !menu.contains(e.target)) {
            menu.classList.remove('show');
            menuBtn.classList.remove('active');
        }
    }
});

function updateMenuItems() {
    const abLoopItem = document.getElementById('ab-loop-menu-item');
    const sleepTimerItem = document.getElementById('sleep-timer-menu-item');

    if (abLoopItem) {
        if (abLoop.active || abLoop.a !== null) {
            abLoopItem.classList.add('active');
        } else {
            abLoopItem.classList.remove('active');
        }
    }

    if (sleepTimerItem) {
        if (sleepTimerInterval) {
            sleepTimerItem.classList.add('active');
        } else {
            sleepTimerItem.classList.remove('active');
        }
    }
}

// --- ФУНКЦИИ ЭКВАЛАЙЗЕРА ---
function updateEqualizer() {
    const equalizer = document.getElementById('equalizer');
    if (!equalizer) return;

    if (!audio.paused && audio.src && !audio.src.includes('null')) {
        equalizer.style.display = 'flex';
    } else {
        equalizer.style.display = 'none';
    }
}

// --- ФУНКЦИИ ТАЙМЕРА СНА ---
function openSleepTimerModal() {
    document.getElementById('sleep-timer-modal').style.display = 'flex';
    closeMenu();
}

function closeSleepTimerModal() {
    document.getElementById('sleep-timer-modal').style.display = 'none';
}

function closeMenu() {
    const menu = document.getElementById('dropdown-menu');
    const menuBtn = document.getElementById('menu-btn');
    if (menu) menu.classList.remove('show');
    if (menuBtn) menuBtn.classList.remove('active');
}

function setSleepTimer(minutes) {
    if (sleepTimerInterval) {
        clearInterval(sleepTimerInterval);
    }

    const endTime = Date.now() + minutes * 60 * 1000;
    sleepTimerEndTime = endTime;

    sleepTimerInterval = setInterval(() => {
        const remaining = Math.max(0, sleepTimerEndTime - Date.now());

        if (remaining <= 0) {
            audio.pause();
            updatePlayIcon(false);
            cancelSleepTimer();
            showNotification('Таймер сна сработал');
        } else {
            updateSleepTimerIndicator(remaining);
        }
    }, 1000);

    document.getElementById('sleep-timer-indicator').style.display = 'inline-flex';
    closeSleepTimerModal();
    closeMenu();
    updateMenuItems();

    showNotification(`Таймер сна установлен на ${minutes} минут`);
}

function setCustomSleepTimer() {
    const minutes = parseInt(document.getElementById('custom-timer-minutes').value);
    if (minutes && minutes > 0) {
        setSleepTimer(minutes);
    }
}

function cancelSleepTimer() {
    if (sleepTimerInterval) {
        clearInterval(sleepTimerInterval);
        sleepTimerInterval = null;
    }
    sleepTimerEndTime = null;
    document.getElementById('sleep-timer-indicator').style.display = 'none';
    updateMenuItems();
}

function updateSleepTimerIndicator(remainingMs) {
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    document.getElementById('sleep-timer-time').textContent =
        `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// --- ФУНКЦИИ A-B LOOP ---
function toggleABLoop() {
    if (!audio.src || audio.src.includes('null')) {
        showNotification('Сначала выберите трек');
        return;
    }

    if (!abLoop.active) {
        if (abLoop.a === null) {
            abLoop.a = audio.currentTime;
            showNotification(`Точка A: ${formatTime(abLoop.a)}`);
        } else if (abLoop.b === null) {
            if (audio.currentTime > abLoop.a) {
                abLoop.b = audio.currentTime;
                abLoop.active = true;
                showNotification(`A-B loop активирован: ${formatTime(abLoop.a)} - ${formatTime(abLoop.b)}`);
                updateABLoopIndicators();
            } else {
                showNotification('Точка B должна быть позже точки A');
                abLoop.a = null;
            }
        } else {
            resetABLoop();
            abLoop.a = audio.currentTime;
            showNotification(`Новая точка A: ${formatTime(abLoop.a)}`);
        }
    } else {
        abLoop.active = false;
        showNotification('A-B loop отключен');
    }

    updateABLoopUI();
    updateMenuItems();
    closeMenu();
}

function resetABLoop() {
    abLoop = { active: false, a: null, b: null };
    updateABLoopUI();
    updateMenuItems();
}

function updateABLoopUI() {
    const indicator = document.getElementById('ab-loop-indicator');
    const aMarker = document.getElementById('ab-a-marker');
    const bMarker = document.getElementById('ab-b-marker');

    if (abLoop.active) {
        if (indicator) indicator.style.display = 'inline-flex';
        if (aMarker) aMarker.style.display = 'inline';
        if (bMarker) bMarker.style.display = 'inline';
    } else if (abLoop.a !== null) {
        if (indicator) indicator.style.display = 'none';
        if (aMarker) aMarker.style.display = 'inline';
        if (bMarker) bMarker.style.display = 'none';
    } else {
        if (indicator) indicator.style.display = 'none';
        if (aMarker) aMarker.style.display = 'none';
        if (bMarker) bMarker.style.display = 'none';
    }

    updateABLoopIndicators();
}

function updateABLoopIndicators() {
    if (abLoop.a !== null) {
        document.getElementById('ab-a-time').textContent = formatTime(abLoop.a);
    }
    if (abLoop.b !== null) {
        document.getElementById('ab-b-time').textContent = formatTime(abLoop.b);
    }
}

// --- ФУНКЦИИ ПОИСКА С КРЕСТИКОМ ---
function handleSearch(value) {
    searchQuery = value.toLowerCase();
    renderTracksForActiveView();

    const clearBtn = document.getElementById('search-clear-btn');
    if (clearBtn) {
        clearBtn.style.display = searchQuery ? 'flex' : 'none';
    }
}

function clearSearch() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = '';
        handleSearch('');
        searchInput.focus();
    }
}

// --- ФУНКЦИИ ДЛЯ РАБОТЫ С НЕСКОЛЬКИМИ ИСПОЛНИТЕЛЯМИ ---
function updateArtistsDisplay(artists) {
    const container = document.getElementById('current-artist');
    if (!container) return;

    if (!artists || artists.length === 0 || (artists.length === 1 && !artists[0])) {
        container.innerHTML = 'Неизвестно';
        container.onclick = () => filterByArtist('Неизвестно');
        return;
    }

    container.innerHTML = '';
    const artistsContainer = document.createElement('div');
    artistsContainer.className = 'artist-names-container';

    artists.forEach((artist, index) => {
        const chip = document.createElement('span');
        chip.className = 'artist-name-chip';
        chip.textContent = artist;
        chip.onclick = (e) => {
            e.stopPropagation();
            filterByArtist(artist);
        };
        artistsContainer.appendChild(chip);

        if (index < artists.length - 1) {
            const separator = document.createElement('span');
            separator.className = 'artist-name-separator';
            separator.textContent = ' feat. ';
            artistsContainer.appendChild(separator);
        }
    });

    container.appendChild(artistsContainer);
}

function filterByArtist(artistName) {
    if (!artistName || artistName === 'Неизвестно') {
        showNotification('Нет информации об исполнителе');
        return;
    }

    activeAlbum = null;
    activePlaylist = DEFAULT_PLAYLIST;
    searchQuery = artistName.toLowerCase();

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.value = artistName;
        handleSearch(artistName);
    }

    renderTracksForActiveView();
    renderPlaylists();
    renderAlbums();

    showNotification(`Показаны треки исполнителя: ${artistName}`);
}

// --- ФУНКЦИИ ДЛЯ РЕДАКТИРОВАНИЯ ИСПОЛНИТЕЛЕЙ ---
function addArtistField() {
    const container = document.getElementById('artists-container');
    const currentInputs = container.querySelectorAll('.edit-track-artist');
    const newIndex = currentInputs.length;

    const wrapper = document.createElement('div');
    wrapper.className = 'artist-input-wrapper';
    wrapper.innerHTML = `
        <input type="text" id="edit-track-artist-${newIndex}" class="edit-track-artist" placeholder="Имя исполнителя">
        <button class="add-artist-btn" onclick="addArtistField()">
            <svg viewBox="0 0 24 24" width="18" height="18">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>
            </svg>
        </button>
    `;

    container.appendChild(wrapper);

    // Убираем кнопку плюс у предыдущего инпута
    if (currentInputs.length > 0) {
        const prevWrapper = currentInputs[currentInputs.length - 1].parentElement;
        const prevBtn = prevWrapper.querySelector('.add-artist-btn');
        if (prevBtn) {
            const newBtn = prevBtn.cloneNode(true);
            prevBtn.parentNode.replaceChild(newBtn, prevBtn);
        }
    }
}

function getArtistsFromInputs() {
    const inputs = document.querySelectorAll('.edit-track-artist');
    const artists = [];
    inputs.forEach(input => {
        const val = input.value.trim();
        if (val) artists.push(val);
    });
    return artists;
}

function setArtistsInputs(artists) {
    const container = document.getElementById('artists-container');
    container.innerHTML = '';

    if (!artists || artists.length === 0) {
        const wrapper = document.createElement('div');
        wrapper.className = 'artist-input-wrapper';
        wrapper.innerHTML = `
            <input type="text" id="edit-track-artist-0" class="edit-track-artist" placeholder="Имя исполнителя">
            <button class="add-artist-btn" onclick="addArtistField()">
                <svg viewBox="0 0 24 24" width="18" height="18">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>
                </svg>
            </button>
        `;
        container.appendChild(wrapper);
        return;
    }

    artists.forEach((artist, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'artist-input-wrapper';
        wrapper.innerHTML = `
            <input type="text" id="edit-track-artist-${idx}" class="edit-track-artist" placeholder="Имя исполнителя" value="${escapeHtml(artist)}">
            <button class="add-artist-btn" onclick="addArtistField()">
                <svg viewBox="0 0 24 24" width="18" height="18">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" fill="currentColor"/>
                </svg>
            </button>
        `;
        container.appendChild(wrapper);
    });
}

// --- ФУНКЦИЯ УСТАНОВКИ ОРИЕНТАЦИИ ПЛЕЕРА ---
function setPlayerOrientation(orientation) {
    playerOrientation = orientation;
    localStorage.setItem('playerOrientation', orientation);

    const playerCenter = document.querySelector('.player-center');
    const verticalBtn = document.getElementById('orientation-vertical');
    const horizontalBtn = document.getElementById('orientation-horizontal');

    if (orientation === 'horizontal') {
        playerCenter.classList.add('horizontal-layout');
        if (verticalBtn) verticalBtn.classList.remove('active');
        if (horizontalBtn) horizontalBtn.classList.add('active');
    } else {
        playerCenter.classList.remove('horizontal-layout');
        if (verticalBtn) verticalBtn.classList.add('active');
        if (horizontalBtn) horizontalBtn.classList.remove('active');
    }
}

// --- ФУНКЦИИ ИЗМЕНЕНИЯ ЦВЕТОВ ---
function changeAccentColor(c) {
    document.documentElement.style.setProperty('--accent', c);
    localStorage.setItem('grig_accent_color', c);
    const picker = document.getElementById('accent-color-input');
    if (picker) picker.value = rgbToHex(c);
}

function changeMainBgColor(c) {
    document.documentElement.style.setProperty('--main-bg', c);
    localStorage.setItem('grig_main_bg_color', c);

    const bgLayer = document.getElementById('custom-bg');
    if (!bgLayer.style.backgroundImage || bgLayer.style.backgroundImage === 'none') {
        bgLayer.style.backgroundColor = c;
    }

    const picker = document.getElementById('bg-color-input');
    if (picker) picker.value = rgbToHex(c);
}

function changePanelBgColor(c) {
    document.documentElement.style.setProperty('--panel-bg', c);
    localStorage.setItem('grig_panel_bg_color', c);

    const picker = document.getElementById('panel-color-input');
    if (picker) picker.value = rgbToHex(c);
}

function resetAccentColor() {
    changeAccentColor(DEFAULT_COLORS.accent);
    const picker = document.getElementById('accent-color-input');
    if (picker) picker.value = rgbToHex(DEFAULT_COLORS.accent);
    showNotification('Цвет акцента сброшен');
}

function resetPanelColor() {
    changePanelBgColor(DEFAULT_COLORS.panel);
    const picker = document.getElementById('panel-color-input');
    if (picker) picker.value = rgbToHex(DEFAULT_COLORS.panel);
    showNotification('Цвет панелей сброшен');
}

function resetBgColor() {
    changeMainBgColor(DEFAULT_COLORS.bg);
    const picker = document.getElementById('bg-color-input');
    if (picker) picker.value = DEFAULT_COLORS.bg;

    const bgLayer = document.getElementById('custom-bg');
    if (!bgLayer.style.backgroundImage || bgLayer.style.backgroundImage === 'none') {
        bgLayer.style.backgroundColor = DEFAULT_COLORS.bg;
    }

    showNotification('Цвет фона сброшен');
}

// --- ФУНКЦИИ РЕЖИМА ОТОБРАЖЕНИЯ ---
function changeDisplayMode(mode) {
    displayMode = mode;
    localStorage.setItem('displayMode', mode);
    updateTrackInfoDisplay();
    showNotification(`Режим отображения изменён`);
}

function updateTrackInfoDisplay() {
    const artistElement = document.getElementById('current-artist');
    const playlistNameElement = document.getElementById('current-playlist-name');
    const trackInfoContainer = document.querySelector('.track-info');

    if (!artistElement || !playlistNameElement || !trackInfoContainer) return;

    const oldSecondary = document.getElementById('track-info-secondary');
    if (oldSecondary) oldSecondary.remove();

    let playlistText = playlistNameElement.textContent.replace('Плейлист: ', '').replace('Альбом: ', '');
    let isAlbum = playlistNameElement.textContent.startsWith('Альбом:');

    const secondaryInfo = document.createElement('div');
    secondaryInfo.id = 'track-info-secondary';
    secondaryInfo.className = 'track-info-secondary';

    switch(displayMode) {
        case 'artist':
            artistElement.style.display = 'block';
            playlistNameElement.style.display = 'none';
            secondaryInfo.style.display = 'none';
            break;
        case 'playlist':
            artistElement.style.display = 'none';
            playlistNameElement.style.display = 'none';
            secondaryInfo.style.display = 'block';
            secondaryInfo.textContent = isAlbum ? `Альбом: ${playlistText}` : `Плейлист: ${playlistText}`;
            break;
        case 'both':
            artistElement.style.display = 'block';
            playlistNameElement.style.display = 'none';
            secondaryInfo.style.display = 'block';
            secondaryInfo.textContent = isAlbum ? `Альбом: ${playlistText}` : `Плейлист: ${playlistText}`;
            break;
    }

    trackInfoContainer.appendChild(secondaryInfo);
}

// --- ФУНКЦИЯ ДЛЯ УВЕДОМЛЕНИЙ ---
function showNotification(message) {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: var(--accent);
        color: white;
        padding: 12px 24px;
        border-radius: 30px;
        font-size: 14px;
        font-weight: 500;
        z-index: 2000;
        animation: slideUp 0.3s ease, fadeOut 0.3s ease 1.7s forwards;
        box-shadow: 0 5px 20px rgba(0,0,0,0.4);
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 2000);
}

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---
function formatTime(s) {
    if (isNaN(s) || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60), sc = Math.floor(s % 60);
    return `${m}:${sc < 10 ? '0' : ''}${sc}`;
}

function updatePlayIcon(isPlay) {
    document.getElementById('svg-play').style.display = isPlay ? 'none' : 'block';
    document.getElementById('svg-pause').style.display = isPlay ? 'block' : 'none';
    updateEqualizer();
}

function savePlaylistStructure() {
    const playlistData = {};
    Object.keys(playlists).forEach(key => {
        playlistData[key] = {
            name: playlists[key].name || key,
            cover: playlists[key].cover || null,
            hasCoverBlob: !!playlists[key].coverBlob
        };
    });
    localStorage.setItem('playlist_structure', JSON.stringify(playlistData));
}

function rgbToHex(rgb) {
    if (rgb.startsWith('#')) return rgb;
    const match = rgb.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return '#121212';
    return '#' + ((1 << 24) + (parseInt(match[1]) << 16) + (parseInt(match[2]) << 8) + parseInt(match[3])).toString(16).slice(1);
}

function updateBackgroundUI(blobOrFile) {
    if (bgUrl) URL.revokeObjectURL(bgUrl);
    bgUrl = URL.createObjectURL(blobOrFile);
    document.getElementById('custom-bg').style.backgroundImage = `url(${bgUrl})`;
    document.getElementById('bg-preview-box').style.backgroundImage = `url(${bgUrl})`;
    document.getElementById('bg-plus-icon').style.display = 'none';
}

// --- ФУНКЦИИ АЛЬБОМОВ ---
function updateAlbumsFromTracks() {
    const albumMap = {};
    const allTracksPlaylist = playlists[DEFAULT_PLAYLIST].tracks;
    if (!allTracksPlaylist) return;

    allTracksPlaylist.forEach(track => {
        if (!track.album || !track.album.trim()) return;

        const albumName = track.album.trim();
        const albumKey = albumName.toLowerCase();
        const coverKey = track.cover || 'no-cover';

        if (!albumMap[albumKey]) {
            albumMap[albumKey] = {
                name: albumName,
                tracks: [],
                covers: {}
            };
        }

        albumMap[albumKey].tracks.push(track.id);

        if (!albumMap[albumKey].covers[coverKey]) {
            albumMap[albumKey].covers[coverKey] = 0;
        }
        albumMap[albumKey].covers[coverKey]++;
    });

    const newAlbums = {};

    Object.entries(albumMap).forEach(([albumKey, albumData]) => {
        let mostCommonCover = null;
        let maxCount = 0;

        Object.entries(albumData.covers).forEach(([coverKey, count]) => {
            if (coverKey !== 'no-cover' && count > maxCount) {
                maxCount = count;
                mostCommonCover = coverKey;
            }
        });

        if (albumData.tracks.length >= 2 && mostCommonCover) {
            const albumId = 'album_' + albumKey.replace(/\s+/g, '_');

            newAlbums[albumId] = {
                id: albumId,
                name: albumData.name,
                cover: mostCommonCover,
                trackIds: albumData.tracks
            };
        }
    });

    albums = newAlbums;
    renderAlbums();
}

function renderAlbums() {
    const albumsList = document.getElementById('albums-list');
    if (!albumsList) return;

    albumsList.innerHTML = '';

    Object.values(albums).forEach(album => {
        const el = document.createElement('div');
        el.className = `album-item ${activeAlbum === album.id ? 'active' : ''}`;
        el.setAttribute('data-title', album.name);
        el.setAttribute('data-count', album.trackIds.length);

        if (isSidebarCollapsed) {
            el.innerHTML = `<img src="${album.cover || 'assets/icons/me-question.png'}" class="album-cover">`;
        } else {
            el.innerHTML = `
                <img src="${album.cover || 'assets/icons/me-question.png'}" class="album-cover">
                <div class="album-info">
                    <div class="album-name">${escapeHtml(album.name)}</div>
                    <div class="album-track-count">${album.trackIds.length} треков</div>
                </div>
            `;
        }

        el.onclick = (e) => {
            e.stopPropagation();
            if (activeAlbum === album.id) {
                activeAlbum = null;
                activePlaylist = DEFAULT_PLAYLIST;
            } else {
                activeAlbum = album.id;
                activePlaylist = null;
                currentTrackIndex = -1;
            }
            renderTracksForActiveView();
            renderPlaylists();
            renderAlbums();
        };

        el.ondblclick = (e) => {
            e.stopPropagation();
            if (confirm(`Удалить альбом "${album.name}"?`)) {
                deleteAlbum(album.id);
            }
        };

        albumsList.appendChild(el);
    });
}

function deleteAlbum(albumId) {
    if (!albums[albumId]) return;

    delete albums[albumId];
    if (activeAlbum === albumId) {
        activeAlbum = null;
        activePlaylist = DEFAULT_PLAYLIST;
        currentTrackIndex = -1;
    }
    renderAlbums();
    renderPlaylists();
    renderTracksForActiveView();
}

function deleteTrackFromAlbum(e, trackId, index) {
    e.stopPropagation();

    if (activeAlbum && albums[activeAlbum]) {
        const album = albums[activeAlbum];
        const trackIndex = album.trackIds.indexOf(trackId);

        if (trackIndex > -1) {
            album.trackIds.splice(trackIndex, 1);

            if (album.trackIds.length < 2) {
                deleteAlbum(activeAlbum);
            } else {
                if (currentTrackIndex === index) {
                    audio.pause();
                    audio.src = "";
                    currentTrackIndex = -1;
                    updatePlayIcon(false);
                    document.getElementById('current-track-title').textContent = 'Выберите трек';
                    updateArtistsDisplay([]);
                } else if (index < currentTrackIndex) {
                    currentTrackIndex--;
                }

                updateAlbumsFromTracks();
                renderAlbums();
                renderTracksForActiveView();
            }
        }
    }
}

// --- ФУНКЦИИ ОТОБРАЖЕНИЯ ---
function renderPlaylists() {
    const pList = document.getElementById('playlist-list');
    if (!pList) return;

    pList.innerHTML = '';
    Object.keys(playlists).forEach(name => {
        const playlist = playlists[name];
        const el = document.createElement('div');
        el.className = `item ${name === activePlaylist && !activeAlbum ? 'active' : ''}`;

        const trackCount = playlist.tracks?.length || 0;
        el.setAttribute('data-title', `${playlist.name || name} (${trackCount} треков)`);
        el.setAttribute('data-count', trackCount);

        if (isSidebarCollapsed) {
            const coverSrc = playlist.cover || 'assets/icons/me-question.png';
            el.innerHTML = `<img src="${coverSrc}" class="playlist-cover-mini" onerror="this.src='assets/icons/me-question.png'">`;
        } else {
            const coverSrc = playlist.cover || 'assets/icons/me-question.png';
            el.innerHTML = `
                <img src="${coverSrc}" class="playlist-cover-mini" onerror="this.src='assets/icons/me-question.png'">
                <div style="display: flex; flex-direction: column; width: 100%; overflow: hidden;">
                    <div style="font-weight: 500; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(playlist.name || name)}</div>
                    <div style="font-size: 12px; color: #FFFFFF;">треков: ${trackCount}</div>
                </div>
            `;
        }

        el.onclick = () => {
            activePlaylist = name;
            activeAlbum = null;
            currentTrackIndex = -1;
            localStorage.setItem('activePlaylistName', name);
            renderTracksForActiveView();
            renderPlaylists();
            renderAlbums();
        };

        if (name !== DEFAULT_PLAYLIST) {
            el.ondblclick = (e) => {
                e.stopPropagation();
                openPlaylistEditModal(name);
            };
        }

        pList.appendChild(el);
    });
}

function renderPlaylistsAndAlbums() {
    renderAlbums();
    renderPlaylists();
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function renderTracksForActiveView() {
    const songList = document.getElementById('songs-container');
    if (!songList) return;

    songList.innerHTML = '';

    let tracksToShow = [];
    let viewTitle = '';

    if (activeAlbum && albums[activeAlbum]) {
        const album = albums[activeAlbum];
        viewTitle = `Альбом: ${album.name}`;

        const allTracks = playlists[DEFAULT_PLAYLIST].tracks || [];
        const albumTracks = [];

        album.trackIds.forEach(trackId => {
            const track = allTracks.find(t => t.id === trackId);
            if (track) {
                albumTracks.push({ ...track, fromAlbum: true });
            }
        });

        tracksToShow = albumTracks;
    } else {
        viewTitle = `Плейлист: ${playlists[activePlaylist]?.name || activePlaylist}`;
        tracksToShow = playlists[activePlaylist]?.tracks || [];
    }

    document.getElementById('current-playlist-name').textContent = viewTitle;

    tracksToShow.forEach((track, index) => {
        const artistMatch = track.artists ? track.artists.some(a => a.toLowerCase().includes(searchQuery)) : false;
        if (searchQuery && !track.name.toLowerCase().includes(searchQuery) &&
            !(track.artist && track.artist.toLowerCase().includes(searchQuery)) && !artistMatch) return;

        const el = document.createElement('div');
        const isCurrentTrack = currentTrackIndex === index &&
            ((activeAlbum && track.fromAlbum) || (!activeAlbum && activePlaylist === track.playlist));

        el.className = `item ${isCurrentTrack ? 'active' : ''}`;
        el.setAttribute('draggable', !activeAlbum && activePlaylist === DEFAULT_PLAYLIST && !track.fromAlbum);

        let artistDisplay = '';
        if (track.artists && track.artists.length > 0) {
            artistDisplay = track.artists.join(' feat. ');
        } else if (track.artist) {
            artistDisplay = track.artist;
        }
        el.setAttribute('data-title', `${track.name}${artistDisplay ? ` - ${artistDisplay}` : ''}`);

        if (isTracksPanelCollapsed) {
            el.innerHTML = `<img src="${track.cover || 'assets/icons/me-question.png'}" class="track-mini-cover">`;
        } else {
            let trackInfoHTML = `<span style="flex:1; overflow:hidden;">`;
            trackInfoHTML += `<div style="font-weight: 500; margin-bottom: 2px;">${escapeHtml(track.name)}</div>`;
            if (artistDisplay) {
                trackInfoHTML += `<div style="font-size: 12px; opacity: 0.7; color: var(--dim);">${escapeHtml(artistDisplay)}</div>`;
            }
            trackInfoHTML += `</span>`;

            const deleteBtn = track.fromAlbum ?
                `<span onclick="deleteTrackFromAlbum(event, '${track.id}', ${index})" style="opacity:0.3; padding:5px; cursor:pointer;">✕</span>` :
                `<span onclick="deleteTrack(event, ${index})" style="opacity:0.3; padding:5px; cursor:pointer;">✕</span>`;

            el.innerHTML = `
                <img src="${track.cover || 'assets/icons/me-question.png'}" class="track-mini-cover">
                ${trackInfoHTML}
                ${deleteBtn}
            `;
        }

        el.onclick = () => playTrack(index);
        el.ondblclick = (e) => {
            e.stopPropagation();
            if (!isTracksPanelCollapsed) {
                if (track.fromAlbum) {
                    const allTracks = playlists[DEFAULT_PLAYLIST].tracks;
                    const originalIndex = allTracks.findIndex(t => t.id === track.id);
                    if (originalIndex !== -1) {
                        openEditModal('track', track.name, originalIndex);
                    }
                } else {
                    openEditModal('track', track.name, index);
                }
            }
        };

        if (!activeAlbum && activePlaylist === DEFAULT_PLAYLIST && !track.fromAlbum) {
            el.ondragstart = () => { draggedIndex = index; };
            el.ondragover = (e) => e.preventDefault();
            el.ondrop = () => {
                if (draggedIndex === null || draggedIndex === index) return;
                const currentList = playlists[activePlaylist].tracks;
                const [movedItem] = currentList.splice(draggedIndex, 1);
                currentList.splice(index, 0, movedItem);

                updateAlbumsFromTracks();
                renderTracksForActiveView();
            };
        }

        songList.appendChild(el);
    });

    if (currentTrackIndex !== -1) {
        setTimeout(() => {
            updateTrackInfoDisplay();
        }, 50);
    }
}

// --- ЗАГРУЗКА ДАННЫХ ---
function loadData() {
    const savedStructure = localStorage.getItem('playlist_structure');
    if (savedStructure) {
        try {
            const parsed = JSON.parse(savedStructure);
            Object.entries(parsed).forEach(([key, data]) => {
                if (key && key !== DEFAULT_PLAYLIST) {
                    playlists[key] = {
                        name: data.name || key,
                        tracks: [],
                        cover: data.cover || null,
                        coverBlob: null
                    };
                }
            });
        } catch(e) {
            console.error("Ошибка структуры плейлистов", e);
        }
    }

    playlists[DEFAULT_PLAYLIST] = {
        name: DEFAULT_PLAYLIST,
        tracks: playlists[DEFAULT_PLAYLIST]?.tracks || [],
        cover: null
    };

    changeAccentColor(localStorage.getItem('grig_accent_color') || DEFAULT_COLORS.accent);
    changeMainBgColor(localStorage.getItem('grig_main_bg_color') || DEFAULT_COLORS.bg);
    changePanelBgColor(localStorage.getItem('grig_panel_bg_color') || DEFAULT_COLORS.panel);

    const savedVol = localStorage.getItem('grig_volume');
    if (savedVol !== null) {
        audio.volume = parseFloat(savedVol);
        volumeSlider.value = Math.sqrt(audio.volume) * 100;
    }

    setPlayerOrientation(localStorage.getItem('playerOrientation') || 'vertical');

    const savedDisplayMode = localStorage.getItem('displayMode');
    if (savedDisplayMode) {
        displayMode = savedDisplayMode;
    }

    if (db) {
        db.transaction(['settings'], 'readonly').objectStore('settings').get('background').onsuccess = (e) => {
            if (e.target.result) updateBackgroundUI(e.target.result);
        };
    }

    if (db) {
        const store = db.transaction(['songs'], 'readonly').objectStore('songs');
        store.getAll().onsuccess = (e) => {
            const allSongs = e.target.result || [];
            Object.keys(playlists).forEach(key => playlists[key].tracks = []);

            allSongs.forEach(track => {
                track.url = URL.createObjectURL(track.file);
                if (track.coverBlob) track.cover = URL.createObjectURL(track.coverBlob);
                if (track.artists && Array.isArray(track.artists)) {
                    track.artist = track.artists.join(' feat. ');
                }

                if (playlists[track.playlist]) {
                    if (!playlists[track.playlist].tracks) {
                        playlists[track.playlist].tracks = [];
                    }
                    playlists[track.playlist].tracks.push(track);
                } else {
                    track.playlist = DEFAULT_PLAYLIST;
                    if (!playlists[DEFAULT_PLAYLIST].tracks) {
                        playlists[DEFAULT_PLAYLIST].tracks = [];
                    }
                    playlists[DEFAULT_PLAYLIST].tracks.push(track);
                }
            });

            if (db.objectStoreNames.contains('playlist_covers')) {
                const coverTx = db.transaction(['playlist_covers'], 'readonly');
                const coverStore = coverTx.objectStore('playlist_covers');

                Object.keys(playlists).forEach(playlistName => {
                    if (playlistName !== DEFAULT_PLAYLIST) {
                        const getRequest = coverStore.get(playlistName);
                        getRequest.onsuccess = (e) => {
                            if (e.target.result) {
                                const blob = e.target.result;
                                if (playlists[playlistName]) {
                                    if (playlists[playlistName].cover) {
                                        URL.revokeObjectURL(playlists[playlistName].cover);
                                    }
                                    playlists[playlistName].cover = URL.createObjectURL(blob);
                                    playlists[playlistName].coverBlob = blob;
                                    renderPlaylists();
                                }
                            }
                        };
                    }
                });
            }

            const savedTrackIndex = localStorage.getItem('currentTrackIndex');
            const savedPlaylistName = localStorage.getItem('activePlaylistName');

            if (savedPlaylistName && playlists[savedPlaylistName]) {
                activePlaylist = savedPlaylistName;
                const idx = parseInt(savedTrackIndex);
                if (!isNaN(idx) && idx >= 0 && playlists[activePlaylist].tracks[idx]) {
                    playTrack(idx, true);
                    audio.pause();
                    updatePlayIcon(false);
                }
            }

            updateAlbumsFromTracks();
            renderPlaylistsAndAlbums();
            renderTracksForActiveView();

            setTimeout(() => {
                updateTrackInfoDisplay();
            }, 100);
        };
    }
}

// --- ВОСПРОИЗВЕДЕНИЕ ТРЕКОВ ---
function playTrack(idx) {
    let track = null;
    let list = null;

    if (activeAlbum && albums[activeAlbum]) {
        const album = albums[activeAlbum];
        const allTracks = playlists[DEFAULT_PLAYLIST].tracks || [];

        const trackId = album.trackIds[idx];
        const originalTrack = allTracks.find(t => t.id === trackId);

        if (!originalTrack) return;

        track = { ...originalTrack, fromAlbum: true };
        list = album.trackIds.map(id => allTracks.find(t => t.id === id)).filter(t => t);
    } else {
        list = playlists[activePlaylist]?.tracks;
        if (!list || !list[idx]) return;
        track = list[idx];
    }

    if (!track) return;

    currentTrackIndex = idx;
    audio.src = track.url;
    document.getElementById('current-track-title').textContent = track.name;

    const artistsList = track.artists || (track.artist ? [track.artist] : []);
    updateArtistsDisplay(artistsList);

    document.getElementById('main-cover').src = track.cover || 'assets/icons/me-question.png';

    audio.play().catch(e => console.warn("Автоплей заблокирован:", e));
    updatePlayIcon(true);

    renderTracksForActiveView();
    localStorage.setItem('currentTrackIndex', idx);
    localStorage.setItem('activePlaylistName', activePlaylist);

    resetABLoop();
    updateTrackInfoDisplay();
}

function togglePlay() {
    if (!audio.src || audio.src.includes('null')) return;
    audio.paused ? audio.play() : audio.pause();
    updatePlayIcon(!audio.paused);
}

function getCurrentTrackList() {
    if (activeAlbum && albums[activeAlbum]) {
        const album = albums[activeAlbum];
        const allTracks = playlists[DEFAULT_PLAYLIST].tracks || [];
        return album.trackIds.map(id => allTracks.find(t => t.id === id)).filter(t => t);
    } else {
        return playlists[activePlaylist]?.tracks || [];
    }
}

function nextTrack() {
    const list = getCurrentTrackList();
    if (!list || list.length === 0) return;

    if (isShuffle) {
        currentTrackIndex = Math.floor(Math.random() * list.length);
    } else {
        currentTrackIndex = (currentTrackIndex + 1) % list.length;
    }
    playTrack(currentTrackIndex);
}

function prevTrack() {
    const list = getCurrentTrackList();
    if (!list || list.length === 0) return;

    currentTrackIndex = (currentTrackIndex - 1 < 0) ? list.length - 1 : currentTrackIndex - 1;
    playTrack(currentTrackIndex);
}

audio.onended = () => isRepeat ? audio.play() : nextTrack();

audio.ontimeupdate = () => {
    if (!audio.duration) return;
    const progressPercent = (audio.currentTime / audio.duration) * 100;
    progress.value = progressPercent;
    document.getElementById('time-current').textContent = formatTime(audio.currentTime);

    if (abLoop.active && abLoop.a !== null && abLoop.b !== null) {
        if (audio.currentTime >= abLoop.b) {
            audio.currentTime = abLoop.a;
        }
    }
};

audio.onloadedmetadata = () => {
    document.getElementById('time-total').textContent = formatTime(audio.duration);
    updateEqualizer();
};

audio.onplay = () => updateEqualizer();
audio.onpause = () => updateEqualizer();

progress.oninput = () => audio.currentTime = (progress.value / 100) * audio.duration;

volumeSlider.oninput = () => {
    const val = volumeSlider.value / 100;
    audio.volume = val * val;
    localStorage.setItem('grig_volume', audio.volume);
};

// --- ИМПОРТ МЕТАДАННЫХ ТРЕКА ---
// 1. Читаем теги из файла: MP3 (ID3v2/ID3v1), FLAC, OGG/Opus, M4A/MP4.
// 2. Если в тегах чего-то нет, берём это из имени файла вида "Исполнитель - Название".
// 3. Убираем лишние знаки по краям (тире, запятые, подчёркивания) и делим строку
//    с несколькими исполнителями на отдельные имена.
// 4. Достаём встроенную обложку (APIC в MP3, PICTURE во FLAC/OGG/Opus, covr в M4A).

// По каким разделителям строка с исполнителями делится на отдельные имена:
// запятая, точка с запятой, feat. / ft. / featuring.
// Чтобы делить ещё и по "&", добавьте в конец выражения |\s+&\s+
const ARTIST_SEPARATORS = /\s*[,;]\s*|[\s(\[]+(?:feat\.?|ft\.?|featuring)\s+/i;

// Разделитель "Исполнитель - Название": тире (обычное, среднее, длинное) с пробелом хотя бы
// с одной стороны. Дефис внутри слова ("Jay-Z", "Wu-Tang") разделителем не считается.
const ARTIST_TITLE_SEPARATOR = /\s+[-–—―]\s*|\s*[-–—―]\s+|\s*[–—―]\s*/;

// Знаки, которые не должны торчать в начале и в конце названия или имени.
const EDGE_JUNK = /^[\s\-–—―_,;:|\/\\]+|[\s\-–—―_,;:|\/\\]+$/g;

function cleanTrackText(value) {
    return String(value ?? '')
        .replace(/[\u0000\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .replace(EDGE_JUNK, '')
        .trim();
}

function sameTrackText(a, b) {
    return cleanTrackText(a).toLowerCase() === cleanTrackText(b).toLowerCase();
}

// "Artist)" -> "Artist", но "(G)I-DLE" остаётся как есть
function stripUnbalancedBrackets(text) {
    let s = text;
    const count = (re) => (s.match(re) || []).length;
    while (/^[(\[]/.test(s) && count(/[(\[]/g) > count(/[)\]]/g)) s = s.slice(1);
    while (/[)\]]$/.test(s) && count(/[)\]]/g) > count(/[(\[]/g)) s = s.slice(0, -1);
    return s.trim();
}

// Строка (или массив строк) -> массив чистых уникальных имён исполнителей
function splitArtistNames(value) {
    const items = Array.isArray(value) ? value : [value];
    const result = [];
    items.forEach(item => {
        String(item ?? '').split(ARTIST_SEPARATORS).forEach(part => {
            const name = stripUnbalancedBrackets(cleanTrackText(part));
            if (name && !result.some(existing => sameTrackText(existing, name))) result.push(name);
        });
    });
    return result;
}

// "Chestikov - home" -> { artist: "Chestikov", title: "home" } (или null, если разделителя нет)
function splitArtistAndTitle(text) {
    const str = String(text ?? '');
    const match = ARTIST_TITLE_SEPARATOR.exec(str);
    if (!match) return null;
    const artist = str.slice(0, match.index);
    const title = str.slice(match.index + match[0].length);
    if (!cleanTrackText(artist) || !cleanTrackText(title)) return null;
    return { artist, title };
}

// Имя файла -> { artist, title }
function parseTrackFileName(fileName) {
    let base = String(fileName ?? '').replace(/\.[^/.]+$/, '');
    base = base.replace(/^\d{1,3}\s*(?:[.)]\s*|[-–—]\s+|_+)(?=\D)/, ''); // номер в начале: "01. ", "01 - ", "01_"
    const underscores = (base.match(/_/g) || []).length;
    const spaces = (base.match(/ /g) || []).length;
    if (underscores > spaces) base = base.replace(/_/g, ' ');               // Chestikov_-_home -> Chestikov - home
    const parts = splitArtistAndTitle(base);
    if (parts) return { artist: cleanTrackText(parts.artist), title: cleanTrackText(parts.title) };
    return { artist: '', title: cleanTrackText(base) };
}

// Итог: объединяет теги и имя файла в { title, artists[], album }
function resolveTrackInfo(fileName, tags) {
    tags = tags || {};
    const fromName = parseTrackFileName(fileName);
    let title = cleanTrackText(Array.isArray(tags.title) ? tags.title[0] : tags.title);
    let artists = splitArtistNames(tags.artist);
    const album = cleanTrackText(Array.isArray(tags.album) ? tags.album[0] : tags.album);

    if (!title) {
        title = fromName.title;
        if (!artists.length) artists = splitArtistNames(fromName.artist);
    } else {
        const parts = splitArtistAndTitle(title);
        if (parts) {
            const prefix = splitArtistNames(parts.artist);
            if (!artists.length) {
                // в теге названия записано "Исполнитель - Название"
                artists = prefix;
                title = cleanTrackText(parts.title);
            } else if (prefix.every(p => artists.some(a => sameTrackText(a, p)))) {
                // исполнитель уже указан отдельно, поэтому в названии он лишний
                title = cleanTrackText(parts.title);
            }
        } else if (!artists.length && fromName.artist && sameTrackText(fromName.title, title)) {
            artists = splitArtistNames(fromName.artist);
        }
    }

    return {
        title: title || cleanTrackText(fileName) || 'Без названия',
        artists,
        album
    };
}

// ---- Низкоуровневое чтение тегов ----
const TAG_UTF8 = new TextDecoder('utf-8');
const TAG_UTF8_STRICT = new TextDecoder('utf-8', { fatal: true });
let TAG_CP1251 = null;
try { TAG_CP1251 = new TextDecoder('windows-1251'); } catch (e) { /* нет поддержки */ }

async function tagSlice(file, start, length) {
    const end = Math.min(file.size, start + length);
    if (start >= end) return new Uint8Array(0);
    return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

function tagAscii(bytes, start, length) {
    let s = '';
    for (let i = start; i < start + length && i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
}

function tagU32BE(b, p) {
    return ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
}

function tagSynchsafe(b, p) {
    return ((b[p] & 0x7F) << 21) | ((b[p + 1] & 0x7F) << 14) | ((b[p + 2] & 0x7F) << 7) | (b[p + 3] & 0x7F);
}

function tagConcat(parts) {
    let total = 0;
    parts.forEach(p => { total += p.length; });
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach(p => { out.set(p, offset); offset += p.length; });
    return out;
}

function tagRemoveUnsync(bytes) {
    const out = new Uint8Array(bytes.length);
    let j = 0;
    for (let i = 0; i < bytes.length; i++) {
        out[j++] = bytes[i];
        if (bytes[i] === 0xFF && bytes[i + 1] === 0x00) i++;
    }
    return out.subarray(0, j);
}

function tagDecodeUtf16(bytes, littleEndian) {
    let s = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) {
        s += String.fromCharCode(littleEndian ? (bytes[i] | (bytes[i + 1] << 8)) : ((bytes[i] << 8) | bytes[i + 1]));
    }
    return s;
}

// Байты "ISO-8859-1" на деле часто бывают UTF-8 или Windows-1251 (старые русские теги).
function tagDecodeLegacy(bytes) {
    let high = 0, cyrillic = 0, run = 0, maxRun = 0;
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b >= 0x80) {
            high++;
            if (b >= 0xC0 || b === 0xA8 || b === 0xB8) {
                cyrillic++;
                run++;
                if (run > maxRun) maxRun = run;
            } else run = 0;
        } else run = 0;
    }
    if (high > 0) {
        try { return TAG_UTF8_STRICT.decode(bytes); } catch (e) { /* не UTF-8 */ }
        if (TAG_CP1251 && cyrillic / high >= 0.9 && maxRun >= 2) return TAG_CP1251.decode(bytes);
    }
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
}

// encoding: 0 = ISO-8859-1, 1 = UTF-16 с BOM, 2 = UTF-16BE, 3 = UTF-8
function tagDecodeText(bytes, encoding) {
    if (encoding === 1) {
        if (bytes[0] === 0xFE && bytes[1] === 0xFF) return tagDecodeUtf16(bytes.subarray(2), false);
        if (bytes[0] === 0xFF && bytes[1] === 0xFE) return tagDecodeUtf16(bytes.subarray(2), true);
        return tagDecodeUtf16(bytes, true);
    }
    if (encoding === 2) return tagDecodeUtf16(bytes, false);
    if (encoding === 3) return TAG_UTF8.decode(bytes);
    return tagDecodeLegacy(bytes);
}

// Текстовый кадр ID3: первый байт — кодировка, дальше одно или несколько значений через NUL
function tagDecodeID3Text(body) {
    if (!body.length) return [];
    const encoding = body[0];
    const data = body.subarray(1);
    const wide = encoding === 1 || encoding === 2;
    const step = wide ? 2 : 1;
    const chunks = [];
    let start = 0;
    for (let i = 0; i + step <= data.length; i += step) {
        const isNul = wide ? (data[i] === 0 && data[i + 1] === 0) : data[i] === 0;
        if (isNul) {
            chunks.push(data.subarray(start, i));
            start = i + step;
        }
    }
    if (start < data.length) chunks.push(data.subarray(start));
    return chunks.map(c => tagDecodeText(c, encoding)).filter(s => s.trim());
}

const TAG_ID3_FRAMES = {
    TIT2: 'title', TT2: 'title',
    TPE1: 'artist', TP1: 'artist',
    TALB: 'album', TAL: 'album',
    TPE2: 'albumArtist', TP2: 'albumArtist'
};

// Тип картинки определяем по первым байтам: MIME в тегах бывает неверным или пустым.
function tagSniffImage(bytes) {
    if (bytes.length < 4) return null;
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'image/jpeg';
    if (bytes[0] === 0x89 && tagAscii(bytes, 1, 3) === 'PNG') return 'image/png';
    if (tagAscii(bytes, 0, 3) === 'GIF') return 'image/gif';
    if (tagAscii(bytes, 0, 2) === 'BM') return 'image/bmp';
    if (tagAscii(bytes, 0, 4) === 'RIFF' && tagAscii(bytes, 8, 4) === 'WEBP') return 'image/webp';
    return null;
}

function tagMakeCover(bytes) {
    const mime = bytes.length >= 64 ? tagSniffImage(bytes) : null;
    return mime ? { data: bytes, mime, type: 0 } : null;
}

// Из нескольких картинок предпочитаем "лицевую обложку" (тип 3), иначе берём первую
function tagBetterCover(current, candidate) {
    if (!candidate) return current;
    if (!current) return candidate;
    return (candidate.type === 3 && current.type !== 3) ? candidate : current;
}

function tagBase64ToBytes(b64) {
    try {
        const bin = atob(String(b64).replace(/\s+/g, ''));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    } catch (e) {
        return null;
    }
}

// Кадр APIC (ID3v2.3/2.4) или PIC (ID3v2.2)
function tagParseID3Picture(body, major) {
    if (body.length < 8) return null;
    const encoding = body[0];
    let pos = 1;
    if (major === 2) {
        pos += 3; // PIC: формат из трёх букв ("JPG", "PNG") вместо MIME
    } else {
        while (pos < body.length && body[pos] !== 0) pos++; // MIME до NUL
        pos++;
    }
    const pictureType = body[pos++];
    if (encoding === 1 || encoding === 2) { // описание в UTF-16 заканчивается двойным NUL
        while (pos + 1 < body.length && !(body[pos] === 0 && body[pos + 1] === 0)) pos += 2;
        pos += 2;
    } else {
        while (pos < body.length && body[pos] !== 0) pos++;
        pos++;
    }
    const cover = tagMakeCover(body.subarray(pos));
    return cover ? { ...cover, type: pictureType } : null;
}

// Блок METADATA_BLOCK_PICTURE (FLAC, а также Vorbis/Opus внутри base64)
function tagParseFlacPicture(data) {
    let pos = 0;
    const type = tagU32BE(data, pos); pos += 4;
    const mimeLen = tagU32BE(data, pos); pos += 4 + mimeLen;
    const descLen = tagU32BE(data, pos); pos += 4 + descLen;
    pos += 16; // ширина, высота, глубина цвета, число цветов
    const len = tagU32BE(data, pos); pos += 4;
    const cover = tagMakeCover(data.subarray(pos, pos + len));
    return cover ? { ...cover, type } : null;
}

// Возвращает { tags, end }: end — смещение, где ID3v2 заканчивается
async function tagReadID3v2(file) {
    const head = await tagSlice(file, 0, 10);
    if (head.length < 10 || tagAscii(head, 0, 3) !== 'ID3') return null;
    const major = head[3];
    const flags = head[5];
    if (major < 2 || major > 4) return null;
    const size = tagSynchsafe(head, 6);
    const end = 10 + size + ((major === 4 && (flags & 0x10)) ? 10 : 0);

    let tag = await tagSlice(file, 10, Math.min(size, 32 * 1024 * 1024));
    if ((flags & 0x80) && major < 4) tag = tagRemoveUnsync(tag);

    let pos = 0;
    if ((flags & 0x40) && major >= 3 && tag.length >= 4) {
        pos = major === 3 ? 4 + tagU32BE(tag, 0) : tagSynchsafe(tag, 0);
    }

    const idLen = major === 2 ? 3 : 4;
    const headerLen = major === 2 ? 6 : 10;
    const found = {};
    let cover = null;

    while (pos + headerLen <= tag.length) {
        if (tag[pos] === 0) break; // дальше только заполнение
        const id = tagAscii(tag, pos, idLen);
        let frameSize;
        if (major === 2) frameSize = (tag[pos + 3] << 16) | (tag[pos + 4] << 8) | tag[pos + 5];
        else if (major === 3) frameSize = tagU32BE(tag, pos + 4);
        else frameSize = tagSynchsafe(tag, pos + 4);
        const fmt = major >= 3 ? tag[pos + 9] : 0;
        pos += headerLen;
        if (frameSize <= 0 || pos + frameSize > tag.length) break;

        let body = tag.subarray(pos, pos + frameSize);
        pos += frameSize;

        const isPicture = id === 'APIC' || id === 'PIC';
        const key = TAG_ID3_FRAMES[id];
        if (isPicture ? (cover && cover.type === 3) : (!key || found[key])) continue;

        if (major === 3) {
            if (fmt & 0xC0) continue;               // сжатие или шифрование
            if (fmt & 0x20) body = body.subarray(1); // идентификатор группы
        } else if (major === 4) {
            if (fmt & 0x0C) continue;               // сжатие или шифрование
            if (fmt & 0x40) body = body.subarray(1);
            if (fmt & 0x01) body = body.subarray(4); // индикатор длины данных
            if (fmt & 0x02) body = tagRemoveUnsync(body);
        }

        if (isPicture) {
            cover = tagBetterCover(cover, tagParseID3Picture(body, major));
            continue;
        }

        const values = tagDecodeID3Text(body);
        if (values.length) found[key] = values;
    }

    return {
        end,
        tags: {
            title: found.title,
            artist: found.artist || found.albumArtist,
            album: found.album,
            cover
        }
    };
}

async function tagReadID3v1(file) {
    if (file.size < 128) return null;
    const b = await tagSlice(file, file.size - 128, 128);
    if (tagAscii(b, 0, 3) !== 'TAG') return null;
    const field = (from, to) => {
        let end = from;
        while (end < to && b[end] !== 0) end++;
        while (end > from && b[end - 1] === 0x20) end--;
        return tagDecodeLegacy(b.subarray(from, end));
    };
    return { title: field(3, 33), artist: field(33, 63), album: field(63, 93) };
}

// Комментарии Vorbis (FLAC, OGG, Opus). Если данные обрезаны — вернёт то, что успело прочитаться.
function tagParseVorbisComments(data, pos) {
    const fields = { TITLE: [], ARTIST: [], ALBUM: [], ALBUMARTIST: [], METADATA_BLOCK_PICTURE: [] };
    const u32 = (p) => (data[p] | (data[p + 1] << 8) | (data[p + 2] << 16) | (data[p + 3] << 24)) >>> 0;

    if (pos + 4 <= data.length) {
        pos += 4 + u32(pos);              // строка-производитель
        if (pos + 4 <= data.length) {
            const count = u32(pos);
            pos += 4;
            for (let i = 0; i < count && pos + 4 <= data.length; i++) {
                const len = u32(pos);
                pos += 4;
                if (pos + len > data.length) break;
                const text = TAG_UTF8.decode(data.subarray(pos, pos + len));
                pos += len;
                const eq = text.indexOf('=');
                if (eq < 1) continue;
                const key = text.slice(0, eq).toUpperCase();
                if (fields[key]) fields[key].push(text.slice(eq + 1));
            }
        }
    }

    let cover = null;
    fields.METADATA_BLOCK_PICTURE.forEach(b64 => {
        if (cover && cover.type === 3) return;
        const bytes = tagBase64ToBytes(b64);
        if (bytes) cover = tagBetterCover(cover, tagParseFlacPicture(bytes));
    });

    return {
        title: fields.TITLE[0],
        artist: fields.ARTIST.length ? fields.ARTIST : fields.ALBUMARTIST,
        album: fields.ALBUM[0],
        cover
    };
}

async function tagReadFlac(file, offset) {
    let pos = offset + 4;
    let tags = null;
    let cover = null;
    while (pos + 4 <= file.size) {
        const h = await tagSlice(file, pos, 4);
        const isLast = (h[0] & 0x80) !== 0;
        const type = h[0] & 0x7F;
        const len = (h[1] << 16) | (h[2] << 8) | h[3];
        pos += 4;
        if (type === 4 && !tags) { // VORBIS_COMMENT
            tags = tagParseVorbisComments(await tagSlice(file, pos, Math.min(len, 8 * 1024 * 1024)), 0);
        } else if (type === 6 && !(cover && cover.type === 3)) { // PICTURE
            cover = tagBetterCover(cover, tagParseFlacPicture(await tagSlice(file, pos, len)));
        }
        pos += len;
        if (isLast) break;
    }
    if (!tags && !cover) return null;
    return { ...(tags || {}), cover: cover || (tags && tags.cover) || null };
}

// Собирает из страниц OGG первые два пакета; второй — заголовок с комментариями.
// complete = false, если буфер оборвался раньше конца пакета.
function tagOggCommentPacket(buf) {
    const packets = [];
    let current = [];
    let pos = 0;

    while (packets.length < 2 && pos + 27 <= buf.length && tagAscii(buf, pos, 4) === 'OggS') {
        const segments = buf[pos + 26];
        let dataPos = pos + 27 + segments;
        for (let i = 0; i < segments && packets.length < 2; i++) {
            const segLen = buf[pos + 27 + i];
            current.push(buf.subarray(dataPos, Math.min(dataPos + segLen, buf.length)));
            dataPos += segLen;
            if (segLen < 255) { // пакет закончился
                packets.push(tagConcat(current));
                current = [];
            }
        }
        pos = dataPos;
    }
    if (packets.length >= 2) return { packet: packets[1], complete: true };
    if (current.length) packets.push(tagConcat(current));
    return { packet: packets[1] || null, complete: false };
}

async function tagReadOgg(file) {
    // Обложка внутри комментариев может весить мегабайты, поэтому буфер растёт, пока пакет не поместится
    const limit = 16 * 1024 * 1024;
    let size = 256 * 1024;
    for (;;) {
        const buf = await tagSlice(file, 0, size);
        if (tagAscii(buf, 0, 4) !== 'OggS') return null;
        const { packet, complete } = tagOggCommentPacket(buf);
        if (complete || buf.length >= file.size || size >= limit) {
            if (!packet) return null;
            if (packet[0] === 3 && tagAscii(packet, 1, 6) === 'vorbis') return tagParseVorbisComments(packet, 7);
            if (tagAscii(packet, 0, 8) === 'OpusTags') return tagParseVorbisComments(packet, 8);
            return null;
        }
        size *= 4;
    }
}

function tagMp4Children(buf, start, end) {
    const list = [];
    let pos = start;
    while (pos + 8 <= end) {
        let size = tagU32BE(buf, pos);
        const type = tagAscii(buf, pos + 4, 4);
        let headerLen = 8;
        if (size === 1) { size = tagU32BE(buf, pos + 12); headerLen = 16; }
        else if (size === 0) size = end - pos;
        if (size < headerLen || pos + size > end) break;
        list.push({ type, start: pos + headerLen, end: pos + size });
        pos += size;
    }
    return list;
}

function tagParseMoov(moov) {
    const find = (start, end, type) => tagMp4Children(moov, start, end).find(a => a.type === type);
    const udta = find(0, moov.length, 'udta');
    if (!udta) return null;
    const meta = find(udta.start, udta.end, 'meta');
    if (!meta) return null;
    const metaBody = tagAscii(moov, meta.start + 4, 4) === 'hdlr' ? meta.start : meta.start + 4;
    const ilst = find(metaBody, meta.end, 'ilst');
    if (!ilst) return null;

    const names = { '\u00A9nam': 'title', '\u00A9ART': 'artist', 'aART': 'albumArtist', '\u00A9alb': 'album' };
    const found = {};
    let cover = null;
    tagMp4Children(moov, ilst.start, ilst.end).forEach(item => {
        if (item.type === 'covr') {
            tagMp4Children(moov, item.start, item.end).filter(a => a.type === 'data').forEach(d => {
                const c = tagMakeCover(moov.subarray(d.start + 8, d.end));
                if (c && !cover) cover = c;
            });
            return;
        }
        const key = names[item.type];
        if (!key || found[key]) return;
        const data = find(item.start, item.end, 'data');
        if (data) found[key] = TAG_UTF8.decode(moov.subarray(data.start + 8, data.end));
    });
    return { title: found.title, artist: found.artist || found.albumArtist, album: found.album, cover };
}

async function tagReadMp4(file) {
    let pos = 0;
    while (pos + 8 <= file.size) {
        const h = await tagSlice(file, pos, 16);
        let size = tagU32BE(h, 0);
        const type = tagAscii(h, 4, 4);
        let headerLen = 8;
        if (size === 1) { size = tagU32BE(h, 8) * 4294967296 + tagU32BE(h, 12); headerLen = 16; }
        else if (size === 0) size = file.size - pos;
        if (size < headerLen) return null;
        if (type === 'moov') {
            if (size > 64 * 1024 * 1024) return null;
            return tagParseMoov(await tagSlice(file, pos + headerLen, size - headerLen));
        }
        pos += size;
    }
    return null;
}

function tagHasValue(v) {
    return Array.isArray(v) ? v.some(x => String(x ?? '').trim()) : !!String(v ?? '').trim();
}

// Первое непустое значение для каждого поля
// Первое непустое значение для каждого поля
function tagMerge(...sources) {
    const out = {};
    ['title', 'artist', 'album'].forEach(key => {
        for (const src of sources) {
            if (src && tagHasValue(src[key])) { out[key] = src[key]; break; }
        }
    });
    for (const src of sources) {
        if (src && src.cover) { out.cover = src.cover; break; }
    }
    return out;
}

// Определяет формат по сигнатуре файла и возвращает { title, artist, album } (что удалось прочитать)
async function readAudioTags(file) {
    try {
        const head = await tagSlice(file, 0, 12);
        if (tagAscii(head, 0, 4) === 'OggS') return tagMerge(await tagReadOgg(file));
        if (tagAscii(head, 4, 4) === 'ftyp') return tagMerge(await tagReadMp4(file));
        if (tagAscii(head, 0, 4) === 'fLaC') return tagMerge(await tagReadFlac(file, 0));

        const id3 = await tagReadID3v2(file);
        if (id3) {
            // FLAC с ID3-тегом в начале файла
            const after = await tagSlice(file, id3.end, 4);
            if (tagAscii(after, 0, 4) === 'fLaC') return tagMerge(await tagReadFlac(file, id3.end), id3.tags);
        }
        return tagMerge(id3 && id3.tags, await tagReadID3v1(file));
    } catch (err) {
        console.warn('Не удалось прочитать теги файла:', file.name, err);
        return {};
    }
}

// Выполняет fn для всех элементов, но не больше `limit` одновременно; порядок результатов сохраняется
async function mapWithLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next++;
            results[i] = await fn(items[i], i);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
}

// --- РАБОТА С ФАЙЛАМИ И БД ---
async function handleFileUpload(files) {
    if (!db) { console.error("База данных не инициализирована!"); return; }

    const audioFiles = Array.from(files).filter(file => file.type.startsWith('audio/'));
    document.getElementById('audio-input').value = "";
    if (!audioFiles.length) return;

    // Теги читаем заранее: транзакция IndexedDB не переживает асинхронное ожидание
    const prepared = await mapWithLimit(audioFiles, 6, async (file) => {
        const tags = await readAudioTags(file);
        // Blob копирует байты, поэтому большой буфер с тегами сразу можно освободить
        const coverBlob = tags.cover ? new Blob([tags.cover.data], { type: tags.cover.mime }) : null;
        return { file, info: resolveTrackInfo(file.name, tags), coverBlob };
    });

    const tx = db.transaction(['songs'], 'readwrite');
    const store = tx.objectStore('songs');

    tx.oncomplete = () => {
        updateAlbumsFromTracks();
        renderPlaylistsAndAlbums();
        renderTracksForActiveView();
    };

    prepared.forEach(({ file, info, coverBlob }) => {
        const track = {
            name: info.title,
            artists: info.artists,
            album: info.album,
            file: file,
            playlist: DEFAULT_PLAYLIST
        };
        if (coverBlob) track.coverBlob = coverBlob;
        store.add(track).onsuccess = (ev) => {
            track.id = ev.target.result;
            track.url = URL.createObjectURL(track.file);
            if (coverBlob) track.cover = URL.createObjectURL(coverBlob);
            track.artist = track.artists.join(' feat. ');
            if (!playlists[DEFAULT_PLAYLIST].tracks) playlists[DEFAULT_PLAYLIST].tracks = [];
            playlists[DEFAULT_PLAYLIST].tracks.push(track);
        };
    });
}

function deleteTrack(e, idx) {
    e.stopPropagation();
    if (!db) return;
    const list = playlists[activePlaylist].tracks;
    const track = list[idx];
    const tx = db.transaction(['songs'], 'readwrite');
    tx.objectStore('songs').delete(track.id).onsuccess = () => {
        list.splice(idx, 1);
        if (currentTrackIndex === idx) {
            audio.pause();
            audio.src = "";
            currentTrackIndex = -1;
            updatePlayIcon(false);
            document.getElementById('current-track-title').textContent = 'Выберите трек';
            updateArtistsDisplay([]);
        }
        else if (idx < currentTrackIndex) { currentTrackIndex--; }

        updateAlbumsFromTracks();
        renderPlaylistsAndAlbums();
        renderTracksForActiveView();
    };
}

function changeTrackCover(file) {
    if (currentTrackIndex === -1 || !file || !db) return;

    let track = null;
    if (activeAlbum && albums[activeAlbum]) {
        const album = albums[activeAlbum];
        const allTracks = playlists[DEFAULT_PLAYLIST].tracks || [];
        const trackId = album.trackIds[currentTrackIndex];
        track = allTracks.find(t => t.id === trackId);
    } else {
        track = playlists[activePlaylist].tracks[currentTrackIndex];
    }

    if (!track) return;

    if (track.cover) URL.revokeObjectURL(track.cover);
    track.coverBlob = file;
    track.cover = URL.createObjectURL(file);
    const store = db.transaction(['songs'], 'readwrite').objectStore('songs');
    store.put({
        id: track.id,
        name: track.name,
        artists: track.artists || [],
        album: track.album || '',
        file: track.file,
        playlist: track.playlist,
        coverBlob: file
    }).onsuccess = () => {
        document.getElementById('main-cover').src = track.cover;
        document.getElementById('cover-input').value = "";

        updateAlbumsFromTracks();
        renderPlaylistsAndAlbums();
        renderTracksForActiveView();
    };
}

function changeBackground(file) {
    if (!file || !db) return;
    updateBackgroundUI(file);
    db.transaction(['settings'], 'readwrite').objectStore('settings').put(file, 'background');
    document.getElementById('bg-input').value = "";
}

function resetBackground() {
    if (!db) return;
    if (bgUrl) URL.revokeObjectURL(bgUrl);
    document.getElementById('custom-bg').style.backgroundImage = 'none';
    document.getElementById('bg-preview-box').style.backgroundImage = 'none';
    document.getElementById('bg-plus-icon').style.display = 'block';

    document.getElementById('custom-bg').style.backgroundColor = DEFAULT_COLORS.bg;

    changeMainBgColor(DEFAULT_COLORS.bg);

    db.transaction(['settings'], 'readwrite').objectStore('settings').delete('background');

    showNotification('Фоновое изображение удалено');
}

// --- МОДАЛЬНЫЕ ОКНА И НАСТРОЙКИ ---
function saveEdit() {
    if (!db) return;

    if (editTarget.type === 'create') {
        const val = document.getElementById('edit-input').value.trim();
        if (!val) return;

        if (!playlists[val] && val !== DEFAULT_PLAYLIST) {
            playlists[val] = {
                name: val,
                tracks: [],
                cover: null,
                coverBlob: null
            };
            savePlaylistStructure();
        }
    } else if (editTarget.type === 'playlist') {
        const val = document.getElementById('edit-input').value.trim();
        if (!val) return;

        if (editTarget.old === DEFAULT_PLAYLIST) return;
        if(playlists[val]) return alert("Плейлист с таким именем уже существует.");

        playlists[val] = playlists[editTarget.old];
        playlists[val].name = val;
        delete playlists[editTarget.old];
        if (activePlaylist === editTarget.old) activePlaylist = val;

        const store = db.transaction(['songs'], 'readwrite').objectStore('songs');
        playlists[val].tracks.forEach(t => {
            t.playlist = val;
            store.put({
                id: t.id,
                name: t.name,
                artists: t.artists || [],
                album: t.album || '',
                file: t.file,
                playlist: t.playlist,
                coverBlob: t.coverBlob
            });
        });
        savePlaylistStructure();
    } else {
        const trackName = document.getElementById('edit-track-name').value.trim();
        if (!trackName) return;

        const track = playlists[DEFAULT_PLAYLIST].tracks[editTarget.idx];
        track.name = trackName;
        track.artists = getArtistsFromInputs();
        track.album = document.getElementById('edit-track-album').value.trim();
        track.artist = track.artists.join(' feat. ');

        const store = db.transaction(['songs'], 'readwrite').objectStore('songs');
        store.put({
            id: track.id,
            name: track.name,
            artists: track.artists,
            album: track.album || '',
            file: track.file,
            playlist: track.playlist,
            coverBlob: track.coverBlob
        }).onsuccess = () => {
            updateAlbumsFromTracks();
            renderPlaylistsAndAlbums();
            renderTracksForActiveView();

            if (currentTrackIndex !== -1 && playlists[activePlaylist]?.tracks && playlists[activePlaylist].tracks[currentTrackIndex] &&
                playlists[activePlaylist].tracks[currentTrackIndex].id === track.id) {
                updateArtistsDisplay(track.artists);
            }
        };
    }

    renderPlaylistsAndAlbums();
    renderTracksForActiveView();
    closeEditModal();
}

function deleteActivePlaylist() {
    if (!db || activePlaylist === DEFAULT_PLAYLIST) return;

    const tx = db.transaction(['songs'], 'readwrite');
    const store = tx.objectStore('songs');

    if (playlists[activePlaylist] && playlists[activePlaylist].tracks) {
        playlists[activePlaylist].tracks.forEach(t => {
            t.playlist = DEFAULT_PLAYLIST;
            store.put({
                id: t.id,
                name: t.name,
                artists: t.artists || [],
                album: t.album || '',
                file: t.file,
                playlist: DEFAULT_PLAYLIST,
                coverBlob: t.coverBlob
            });

            if (!playlists[DEFAULT_PLAYLIST].tracks.find(track => track.id === t.id)) {
                playlists[DEFAULT_PLAYLIST].tracks.push(t);
            }
        });
    }

    if (db.objectStoreNames.contains('playlist_covers')) {
        const coverTx = db.transaction(['playlist_covers'], 'readwrite');
        coverTx.objectStore('playlist_covers').delete(activePlaylist);
    }

    delete playlists[activePlaylist];
    activePlaylist = DEFAULT_PLAYLIST;
    currentTrackIndex = -1;
    savePlaylistStructure();

    updateAlbumsFromTracks();
    renderPlaylistsAndAlbums();
    renderTracksForActiveView();
    closeConfirmModal();
    closePlaylistEditModal();
}

function openMoveModal() {
    if (currentTrackIndex === -1) {
        showNotification('Сначала выберите трек');
        return;
    }

    let track = null;
    if (activeAlbum && albums[activeAlbum]) {
        const album = albums[activeAlbum];
        const allTracks = playlists[DEFAULT_PLAYLIST].tracks || [];
        const trackId = album.trackIds[currentTrackIndex];
        track = allTracks.find(t => t.id === trackId);
    } else {
        track = playlists[activePlaylist].tracks[currentTrackIndex];
    }

    if (!track) return;

    const mList = document.getElementById('modal-playlist-list');
    mList.innerHTML = '';
    Object.keys(playlists).forEach(name => {
        const d = document.createElement('div');
        d.className = 'modal-playlist-btn';
        d.textContent = playlists[name].name || name;
        d.onclick = () => {
            if (!db) return;
            const trackCopy = {
                name: track.name,
                artists: track.artists || [],
                album: track.album || '',
                file: track.file,
                playlist: name,
                coverBlob: track.coverBlob
            };
            db.transaction(['songs'], 'readwrite').objectStore('songs').add(trackCopy).onsuccess = (e) => {
                trackCopy.id = e.target.result;
                trackCopy.url = URL.createObjectURL(trackCopy.file);
                if (trackCopy.coverBlob) trackCopy.cover = URL.createObjectURL(trackCopy.coverBlob);

                if (!playlists[name]) {
                    playlists[name] = {
                        name: name,
                        tracks: [],
                        cover: null,
                        coverBlob: null
                    };
                } else if (!playlists[name].tracks) {
                    const oldTracks = playlists[name];
                    playlists[name] = {
                        name: name,
                        tracks: oldTracks,
                        cover: null,
                        coverBlob: null
                    };
                }

                playlists[name].tracks.push(trackCopy);

                if (name === DEFAULT_PLAYLIST) {
                    updateAlbumsFromTracks();
                }

                closeMoveModal();
                renderPlaylistsAndAlbums();
                if (activePlaylist === name) {
                    renderTracksForActiveView();
                }
                showNotification(`Трек добавлен в плейлист "${playlists[name].name || name}"`);
            };
        };
        mList.appendChild(d);
    });
    document.getElementById('move-modal').style.display = 'flex';
}

function openSettingsModal() {
    document.getElementById('settings-modal').style.display = 'flex';

    const verticalBtn = document.getElementById('orientation-vertical');
    const horizontalBtn = document.getElementById('orientation-horizontal');

    if (verticalBtn && horizontalBtn) {
        if (playerOrientation === 'horizontal') {
            verticalBtn.classList.remove('active');
            horizontalBtn.classList.add('active');
        } else {
            verticalBtn.classList.add('active');
            horizontalBtn.classList.remove('active');
        }
    }

    const displayModeSelect = document.getElementById('display-mode-select');
    if (displayModeSelect) {
        displayModeSelect.value = displayMode;
    }
}

function closeSettingsModal() {
    document.getElementById('settings-modal').style.display = 'none';
}

function openEditModal(type, old, idx = null) {
    editTarget = { type, old, idx };

    if (type === 'playlist') {
        document.getElementById('edit-modal-title').textContent = 'Переименовать плейлист';
        document.getElementById('track-edit-fields').style.display = 'none';
        document.getElementById('edit-input').style.display = 'block';
        document.getElementById('edit-input').value = old;
        document.getElementById('edit-input').placeholder = 'Название плейлиста';
    } else if (type === 'track') {
        document.getElementById('edit-modal-title').textContent = 'Изменить трек';
        document.getElementById('track-edit-fields').style.display = 'block';
        document.getElementById('edit-input').style.display = 'none';

        let track = null;
        if (activeAlbum && albums[activeAlbum]) {
            const album = albums[activeAlbum];
            const allTracks = playlists[DEFAULT_PLAYLIST].tracks || [];
            const trackId = album.trackIds[idx];
            track = allTracks.find(t => t.id === trackId);
        } else {
            track = playlists[activePlaylist].tracks[idx];
        }

        if (track) {
            document.getElementById('edit-track-name').value = track.name || '';
            setArtistsInputs(track.artists || []);
            document.getElementById('edit-track-album').value = track.album || '';
        }
    }
    document.getElementById('edit-modal').style.display = 'flex';
}

function openCreatePlaylistModal() {
    editTarget = { type: 'create' };
    document.getElementById('edit-modal-title').textContent = 'Новый плейлист';
    document.getElementById('track-edit-fields').style.display = 'none';
    document.getElementById('edit-input').style.display = 'block';
    document.getElementById('edit-input').value = '';
    document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
    document.getElementById('track-edit-fields').style.display = 'none';
    document.getElementById('edit-input').style.display = 'block';
    document.getElementById('artists-container').innerHTML = '';
}

function openDeleteConfirmModal() {
    if (activePlaylist === DEFAULT_PLAYLIST) {
        showNotification('Нельзя удалить плейлист "Все треки"');
        return;
    }
    document.getElementById('confirm-modal-text').textContent = `Удалить "${playlists[activePlaylist].name || activePlaylist}" со всеми треками?`;
    document.getElementById('confirm-modal-btn').onclick = deleteActivePlaylist;
    document.getElementById('confirm-modal').style.display = 'flex';
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').style.display = 'none';
}

function closeMoveModal() {
    document.getElementById('move-modal').style.display = 'none';
}

function openCheckUpdates() {
    document.getElementById('CheckUpdates').style.display = 'flex';
}

function closeCheckUpdates() {
    document.getElementById('CheckUpdates').style.display = 'none';
}

// --- ФУНКЦИИ ДЛЯ РЕДАКТИРОВАНИЯ ПЛЕЙЛИСТОВ ---
function openPlaylistEditModal(playlistName) {
    const playlist = playlists[playlistName];
    if (!playlist) return;

    editTarget = { type: 'playlist', old: playlistName };

    document.getElementById('playlist-edit-name').value = playlist.name || playlistName;

    const coverImg = document.getElementById('playlist-edit-cover-img');
    if (playlist.cover) {
        coverImg.src = playlist.cover;
    } else {
        coverImg.src = 'assets/icons/me-question.png';
    }

    document.getElementById('playlist-edit-modal').style.display = 'flex';
}

function closePlaylistEditModal() {
    document.getElementById('playlist-edit-modal').style.display = 'none';
    document.getElementById('playlist-cover-input').value = '';
}

function savePlaylistEdit() {
    const newName = document.getElementById('playlist-edit-name').value.trim();
    const oldName = editTarget.old;

    if (!newName) {
        showNotification('Введите название плейлиста');
        return;
    }

    if (oldName === DEFAULT_PLAYLIST) {
        showNotification('Нельзя редактировать плейлист "Все треки"');
        closePlaylistEditModal();
        return;
    }

    if (newName !== oldName) {
        if (playlists[newName]) {
            showNotification('Плейлист с таким именем уже существует');
            return;
        }

        playlists[newName] = {
            name: newName,
            tracks: playlists[oldName].tracks,
            cover: playlists[oldName].cover,
            coverBlob: playlists[oldName].coverBlob
        };

        if (db && db.objectStoreNames.contains('playlist_covers') && playlists[oldName].coverBlob) {
            const coverTx = db.transaction(['playlist_covers'], 'readwrite');
            const coverStore = coverTx.objectStore('playlist_covers');
            coverStore.delete(oldName);
            coverStore.put(playlists[oldName].coverBlob, newName);
        }

        delete playlists[oldName];

        if (db) {
            const tx = db.transaction(['songs'], 'readwrite');
            const store = tx.objectStore('songs');
            playlists[newName].tracks.forEach(t => {
                t.playlist = newName;
                store.put({
                    id: t.id,
                    name: t.name,
                    artists: t.artists || [],
                    album: t.album || '',
                    file: t.file,
                    playlist: t.playlist,
                    coverBlob: t.coverBlob
                });
            });
        }

        if (activePlaylist === oldName) {
            activePlaylist = newName;
        }
    }

    savePlaylistStructure();
    renderPlaylists();
    closePlaylistEditModal();
    showNotification('Плейлист сохранён');
}

function changePlaylistCover(file) {
    if (!file || !editTarget || !editTarget.old) return;

    const playlistName = editTarget.old;
    const playlist = playlists[playlistName];

    if (!playlist) return;

    if (db && db.objectStoreNames.contains('playlist_covers')) {
        const tx = db.transaction(['playlist_covers'], 'readwrite');
        const store = tx.objectStore('playlist_covers');
        store.put(file, playlistName).onsuccess = () => {
            console.log('Обложка плейлиста сохранена');
        };
    }

    if (playlist.cover) URL.revokeObjectURL(playlist.cover);
    const coverUrl = URL.createObjectURL(file);

    document.getElementById('playlist-edit-cover-img').src = coverUrl;

    playlist.cover = coverUrl;
    playlist.coverBlob = file;

    savePlaylistStructure();
    renderPlaylists();

    showNotification('Обложка плейлиста сохранена');
}

// --- ОБРАБОТЧИКИ СОБЫТИЙ ---
function toggleShuffle() {
    isShuffle = !isShuffle;
    document.getElementById('shuffle-btn').classList.toggle('active', isShuffle);
}

function toggleRepeat() {
    isRepeat = !isRepeat;
    document.getElementById('repeat-btn').classList.toggle('active', isRepeat);
}

document.getElementById('audio-input').onchange = (e) => handleFileUpload(e.target.files);

if (dz) {
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag-over'); };
    dz.ondragleave = () => dz.classList.remove('drag-over');
    dz.ondrop = (e) => {
        e.preventDefault();
        dz.classList.remove('drag-over');
        handleFileUpload(e.dataTransfer.files);
    };
}

// Обработка клавиш
document.addEventListener('keydown', (e) => {
    if (!audio.src || audio.src.includes('null')) return;

    if (e.altKey && e.key === 'a') {
        e.preventDefault();
        if (!abLoop.active) {
            abLoop.a = audio.currentTime;
            showNotification(`Точка A: ${formatTime(abLoop.a)}`);
            updateABLoopUI();
            updateMenuItems();
        }
    }

    if (e.altKey && e.key === 'b') {
        e.preventDefault();
        if (abLoop.a !== null && !abLoop.active) {
            if (audio.currentTime > abLoop.a) {
                abLoop.b = audio.currentTime;
                abLoop.active = true;
                showNotification(`A-B loop активирован: ${formatTime(abLoop.a)} - ${formatTime(abLoop.b)}`);
                updateABLoopUI();
                updateMenuItems();
            } else {
                showNotification('Точка B должна быть позже точки A');
                abLoop.a = null;
            }
        }
    }

    if (e.altKey && e.key === 'r') {
        e.preventDefault();
        resetABLoop();
        showNotification('A-B loop сброшен');
        updateMenuItems();
    }
});

// --- МОБИЛЬНАЯ НАВИГАЦИЯ ---
function createMobileNavigation() {
    if (document.getElementById('mobile-nav-bar')) return;

    const mobileNav = document.createElement('div');
    mobileNav.id = 'mobile-nav-bar';
    mobileNav.className = 'mobile-nav-bar';
    mobileNav.innerHTML = `
        <button class="mobile-nav-btn" onclick="toggleSidebar()" id="mobile-nav-left">
            <svg viewBox="0 0 24 24"><path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>
            <span>Панель</span>
        </button>
        <button class="mobile-nav-btn active" onclick="showMainPlayer()" id="mobile-nav-player">
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13v6l5-3-5-3z"/></svg>
            <span>Плеер</span>
        </button>
        <button class="mobile-nav-btn" onclick="toggleTracksPanel()" id="mobile-nav-right">
            <svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
            <span>Треки</span>
        </button>
    `;

    document.body.appendChild(mobileNav);
    updateMobileNavActive();
}

function showMainPlayer() {
    updateMobileNavActive();
}

function updateMobileNavActive() {
    const leftBtn = document.getElementById('mobile-nav-left');
    const playerBtn = document.getElementById('mobile-nav-player');
    const rightBtn = document.getElementById('mobile-nav-right');

    if (!leftBtn || !playerBtn || !rightBtn) return;

    leftBtn.classList.remove('active');
    playerBtn.classList.remove('active');
    rightBtn.classList.remove('active');

    const sidebar = document.querySelector('.sidebar');
    const tracksPanel = document.querySelector('.tracks-panel');

    if (window.innerWidth <= 900) {
        if (sidebar && !sidebar.classList.contains('collapsed')) {
            leftBtn.classList.add('active');
        } else if (tracksPanel && !tracksPanel.classList.contains('collapsed')) {
            rightBtn.classList.add('active');
        } else {
            playerBtn.classList.add('active');
        }
    } else {
        playerBtn.classList.add('active');
    }
}

window.addEventListener('resize', function() {
    if (window.innerWidth <= 900) {
        createMobileNavigation();
    } else {
        const mobileNav = document.getElementById('mobile-nav-bar');
        if (mobileNav) mobileNav.remove();
    }
    updateMobileNavActive();
});

function openMoreActionsModal() {
    document.getElementById('more-actions-modal').style.display = 'flex';
}

function closeMoreActionsModal() {
    document.getElementById('more-actions-modal').style.display = 'none';
}

// --- ОБРАБОТКА СВАЙПОВ ---
let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', function(e) {
    touchStartX = e.changedTouches[0].screenX;
}, false);

document.addEventListener('touchend', function(e) {
    if (window.innerWidth > 900) return;

    touchEndX = e.changedTouches[0].screenX;
    handleSwipe();
}, false);

function handleSwipe() {
    const swipeThreshold = 50;
    const diff = touchEndX - touchStartX;

    const sidebar = document.querySelector('.sidebar');
    const tracksPanel = document.querySelector('.tracks-panel');

    if (Math.abs(diff) < swipeThreshold) return;

    if (diff > 0) {
        if (sidebar && sidebar.classList.contains('collapsed')) {
            toggleSidebar();
        }
        if (tracksPanel && !tracksPanel.classList.contains('collapsed')) {
            toggleTracksPanel();
        }
    } else {
        if (tracksPanel && tracksPanel.classList.contains('collapsed')) {
            toggleTracksPanel();
        }
        if (sidebar && !sidebar.classList.contains('collapsed')) {
            toggleSidebar();
        }
    }
}

// --- ИНИЦИАЛИЗАЦИЯ ---
window.addEventListener('load', function() {
    setTimeout(() => {
        const accentColor = localStorage.getItem('grig_accent_color') || DEFAULT_COLORS.accent;
        const panelColor = localStorage.getItem('grig_panel_bg_color') || DEFAULT_COLORS.panel;
        const bgColor = localStorage.getItem('grig_main_bg_color') || DEFAULT_COLORS.bg;

        document.getElementById('accent-color-input').value = rgbToHex(accentColor);
        document.getElementById('panel-color-input').value = rgbToHex(panelColor);
        document.getElementById('bg-color-input').value = rgbToHex(bgColor);

        const displayModeSelect = document.getElementById('display-mode-select');
        if (displayModeSelect) {
            displayModeSelect.value = displayMode;
        }

        setPlayerOrientation(localStorage.getItem('playerOrientation') || 'vertical');
        applyPanelStates();

        if (!document.getElementById('sleep-timer-btn')) {
            const timerBtn = document.createElement('button');
            timerBtn.id = 'sleep-timer-btn';
            timerBtn.style.display = 'none';
            document.body.appendChild(timerBtn);
        }

        if (!document.getElementById('ab-loop-btn')) {
            const abBtn = document.createElement('button');
            abBtn.id = 'ab-loop-btn';
            abBtn.style.display = 'none';
            document.body.appendChild(abBtn);
        }

        if (window.innerWidth <= 900) {
            createMobileNavigation();
        }
    }, 100);
});