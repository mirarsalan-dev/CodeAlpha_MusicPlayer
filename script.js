// --- SVG DEFAULT COVER ---
const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23a1a1aa' width='150' height='150'><path d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/></svg>";

// --- INITIAL PLAYLIST ---
const songs = [
    { 
        title: "Epic Journey", 
        artist: "Audio Hero", 
        src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        cover: "https://via.placeholder.com/150/18181b/10b981?text=Epic",
        lrc: `[00:00.00] (Instrumental Intro)\n[00:05.00] Welcome to the Epic Journey\n[00:10.50] The beat starts to build...\n[00:15.00] Feeling the rhythm now!\n[00:20.00] Let the music take control.`
    },
    { 
        title: "Mellow Walk", 
        artist: "Chill Beats", 
        src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        cover: "https://via.placeholder.com/150/18181b/ff416c?text=Mellow",
        lrc: "" 
    }
];

let currentSongIndex = 0;
let isPlaying = false;
let isShuffle = false;
let isRepeat = false;
let parsedLyrics = [];
let audio = new Audio(); 
audio.crossOrigin = "anonymous"; // Required for Web Audio API with external links

// --- DOM ELEMENTS ---
const titleEl = document.getElementById("song-title");
const artistEl = document.getElementById("song-artist");
const coverEl = document.getElementById("cover");
const coverWrapper = document.getElementById("cover-wrapper");
const playBtn = document.getElementById("play-btn");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const repeatBtn = document.getElementById("repeat-btn");
const themeBtn = document.getElementById("theme-btn");
const progressBar = document.getElementById("progress-bar");
const currentTimeEl = document.getElementById("current-time");
const totalDurationEl = document.getElementById("total-duration");
const volumeBar = document.getElementById("volume-bar");
const bassBar = document.getElementById("bass-bar");
const trebleBar = document.getElementById("treble-bar");
const playlistEl = document.getElementById("playlist");
const currentLyricEl = document.getElementById("current-lyric");
const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById("drop-zone");

coverEl.addEventListener("error", () => { coverEl.src = defaultCover; });

// --- LOCAL STORAGE MANAGER ---
function loadSettings() {
    const savedVol = localStorage.getItem("player_volume");
    const savedBass = localStorage.getItem("player_bass");
    const savedTreble = localStorage.getItem("player_treble");
    const savedTheme = localStorage.getItem("player_theme");

    if (savedVol !== null) volumeBar.value = savedVol;
    if (savedBass !== null) bassBar.value = savedBass;
    if (savedTreble !== null) trebleBar.value = savedTreble;
    if (savedTheme === "sunset") document.body.setAttribute("data-theme", "sunset");
    
    audio.volume = volumeBar.value;
}

function saveSetting(key, value) {
    localStorage.setItem(key, value);
}

// --- THEME SWITCHER ---
themeBtn.addEventListener("click", () => {
    const currentTheme = document.body.getAttribute("data-theme");
    if (currentTheme === "sunset") {
        document.body.removeAttribute("data-theme");
        saveSetting("player_theme", "emerald");
    } else {
        document.body.setAttribute("data-theme", "sunset");
        saveSetting("player_theme", "sunset");
    }
});

// --- LYRICS PARSING ---
async function fetchLyrics(songTitle) {
    try {
        const cleanTitle = songTitle.replace(/\(.*\)|\[.*\]/g, '').trim();
        const response = await fetch(`https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle)}`);
        const data = await response.json();
        if (data && data.length > 0 && data[0].syncedLyrics) return data[0].syncedLyrics;
        return null;
    } catch (error) {
        return null;
    }
}

function parseLRC(lrcString) {
    if (!lrcString) return [];
    const lines = lrcString.split('\n');
    const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
    const parsed = [];
    lines.forEach(line => {
        const match = regex.exec(line);
        if (match) {
            const timeInSeconds = (parseInt(match[1], 10) * 60) + parseInt(match[2], 10);
            const text = line.replace(regex, '').trim();
            if (text) parsed.push({ time: timeInSeconds, text });
        }
    });
    return parsed;
}

// --- AUDIO VISUALIZER & EQUALIZER ---
const canvas = document.getElementById("visualizer");
const canvasCtx = canvas.getContext("2d");
let audioCtx, analyser, source, bassFilter, trebleFilter;
let isVisualizerInitialized = false;

function initAudioGraph() {
    if (isVisualizerInitialized) return;
    
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    source = audioCtx.createMediaElementSource(audio);
    
    // Create Equalizer Nodes
    bassFilter = audioCtx.createBiquadFilter();
    bassFilter.type = "lowshelf";
    bassFilter.frequency.value = 250; 
    bassFilter.gain.value = bassBar.value;

    trebleFilter = audioCtx.createBiquadFilter();
    trebleFilter.type = "highshelf";
    trebleFilter.frequency.value = 6000;
    trebleFilter.gain.value = trebleBar.value;

    // Create Analyser
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; 
    
    // Connect the chain: Source -> Bass -> Treble -> Analyser -> Speakers
    source.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    trebleFilter.connect(analyser);
    analyser.connect(audioCtx.destination);
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    function draw() {
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;
        
        // Grab CSS theme colors for the visualizer
        const style = getComputedStyle(document.body);
        const r = style.getPropertyValue('--vis-r').trim() || '16';
        const g = style.getPropertyValue('--vis-g').trim() || '185';
        const b = style.getPropertyValue('--vis-b').trim() || '129';
        
        for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i] / 2; 
            canvasCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${barHeight/100})`;
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }
    draw();
    isVisualizerInitialized = true;
}

// --- CORE PLAYBACK ---
function safePlay() {
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.then(() => {
            isPlaying = true;
            playBtn.textContent = "⏸️";
            coverWrapper.classList.add("playing");
        }).catch(e => {
            isPlaying = false;
            playBtn.textContent = "▶️";
            coverWrapper.classList.remove("playing");
        });
    }
}

async function loadSong(index) {
    if (index < 0 || index >= songs.length) return; 
    
    const song = songs[index];
    titleEl.textContent = song.title;
    artistEl.textContent = song.artist;
    coverEl.src = song.cover || defaultCover;
    
    coverEl.style.animation = 'none';
    coverEl.offsetHeight; 
    coverEl.style.animation = null; 
    
    audio.src = song.src;
    progressBar.value = 0;
    currentTimeEl.textContent = "0:00";
    totalDurationEl.textContent = "0:00"; 
    
    updatePlaylistUI();

    if (song.lrc) {
        parsedLyrics = parseLRC(song.lrc);
        currentLyricEl.textContent = parsedLyrics.length > 0 ? "🎵" : "No lyrics available";
    } else {
        currentLyricEl.textContent = "🔍 Searching...";
        parsedLyrics = [];
        const apiLyrics = await fetchLyrics(song.title);
        if (apiLyrics) {
            song.lrc = apiLyrics; 
            parsedLyrics = parseLRC(apiLyrics);
            currentLyricEl.textContent = "✅ Lyrics Found!";
            setTimeout(() => {
                if (currentLyricEl.textContent === "✅ Lyrics Found!") currentLyricEl.textContent = "🎵";
            }, 2000);
        } else {
            currentLyricEl.textContent = "No lyrics available";
        }
    }
}

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function togglePlay() {
    if (songs.length === 0) return; 
    if (isPlaying) {
        audio.pause();
        isPlaying = false;
        playBtn.textContent = "▶️";
        coverWrapper.classList.remove("playing");
    } else {
        safePlay();
    }
}

function nextSong() {
    if (songs.length === 0) return;
    if (isRepeat) {
        audio.currentTime = 0;
    } else if (isShuffle && songs.length > 1) {
        let newIndex = currentSongIndex;
        while (newIndex === currentSongIndex) {
            newIndex = Math.floor(Math.random() * songs.length);
        }
        currentSongIndex = newIndex;
    } else {
        currentSongIndex = (currentSongIndex + 1) % songs.length;
    }
    loadSong(currentSongIndex);
    if (isPlaying) safePlay();
}

function prevSong() {
    if (songs.length === 0) return;
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }
    currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    loadSong(currentSongIndex);
    if (isPlaying) safePlay();
}

// --- EVENT LISTENERS ---
audio.addEventListener('loadedmetadata', () => {
    totalDurationEl.textContent = formatTime(audio.duration);
    progressBar.max = audio.duration;
});

audio.addEventListener("timeupdate", () => {
    const currentTime = audio.currentTime;
    currentTimeEl.textContent = formatTime(currentTime);
    if (!audio.paused && audio.duration) progressBar.value = currentTime;

    if (parsedLyrics.length > 0) {
        let activeLyric = "🎵";
        for (let i = 0; i < parsedLyrics.length; i++) {
            if (currentTime >= parsedLyrics[i].time) activeLyric = parsedLyrics[i].text;
            else break; 
        }
        if (currentLyricEl.textContent !== activeLyric) {
            currentLyricEl.textContent = activeLyric;
        }
    }
});

audio.addEventListener("ended", nextSong);

playBtn.addEventListener("click", () => { initAudioGraph(); togglePlay(); });
nextBtn.addEventListener("click", nextSong);
prevBtn.addEventListener("click", prevSong);
shuffleBtn.addEventListener("click", () => { isShuffle = !isShuffle; shuffleBtn.classList.toggle("active-control"); });
repeatBtn.addEventListener("click", () => { isRepeat = !isRepeat; repeatBtn.classList.toggle("active-control"); });

// Sliders & EQ Controls
progressBar.addEventListener("input", () => audio.currentTime = progressBar.value);

volumeBar.addEventListener("input", () => {
    audio.volume = volumeBar.value;
    saveSetting("player_volume", volumeBar.value);
});

bassBar.addEventListener("input", () => {
    if (bassFilter) bassFilter.gain.value = bassBar.value;
    saveSetting("player_bass", bassBar.value);
});

trebleBar.addEventListener("input", () => {
    if (trebleFilter) trebleFilter.gain.value = trebleBar.value;
    saveSetting("player_treble", trebleBar.value);
});

// Keyboard Shortcuts
document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) { e.preventDefault(); initAudioGraph(); togglePlay(); }
    if (e.code === "ArrowRight") { e.preventDefault(); nextSong(); }
    if (e.code === "ArrowLeft") { e.preventDefault(); prevSong(); }
});

// --- PLAYLIST & FILES ---
function renderPlaylist() {
    playlistEl.innerHTML = "";
    songs.forEach((song, index) => {
        const li = document.createElement("li");
        li.textContent = `${song.title} - ${song.artist}`;
        li.addEventListener("click", () => {
            currentSongIndex = index;
            loadSong(currentSongIndex);
            initAudioGraph();
            safePlay(); 
        });
        playlistEl.appendChild(li);
    });
    updatePlaylistUI();
}

function updatePlaylistUI() {
    const listItems = playlistEl.querySelectorAll("li");
    listItems.forEach((li, index) => {
        li.classList.toggle("active", index === currentSongIndex);
    });
}

function handleFiles(files) {
    const previousLength = songs.length;
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!file.type.startsWith('audio/')) continue; 
        const cleanTitle = file.name.replace(/\.[^/.]+$/, ""); 
        songs.push({ title: cleanTitle, artist: "Local File", src: URL.createObjectURL(file), cover: null, lrc: "" });
    }
    renderPlaylist();
    if (!isPlaying && songs.length > previousLength) {
        currentSongIndex = previousLength;
        loadSong(currentSongIndex);
        initAudioGraph();
        safePlay();
    }
}

fileInput.addEventListener("change", (e) => { if (e.target.files.length > 0) handleFiles(e.target.files); });
dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
dropZone.addEventListener("dragleave", () => { dropZone.classList.remove("dragover"); });
dropZone.addEventListener("drop", (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files); });

// --- STARTUP ---
loadSettings();
if (songs.length > 0) {
    loadSong(currentSongIndex);
    renderPlaylist();
}