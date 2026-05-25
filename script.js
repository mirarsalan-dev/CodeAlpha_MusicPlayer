const defaultCover = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23a1a1aa' width='150' height='150'><path d='M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z'/></svg>";

// --- PLAYLIST EMPTIED ---
const songs = [];

let currentSongIndex = 0;
let isPlaying = false, isShuffle = false, isRepeat = false;
let parsedLyrics = [];
let audio = new Audio(); 
audio.crossOrigin = "anonymous"; 

// Looper & Cues State
let loopA = null, loopB = null, isLooping = false;
let hotCues = [null, null, null];

// Session Recording State
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;

// DOM Elements
const titleEl = document.getElementById("song-title"), artistEl = document.getElementById("song-artist"), coverEl = document.getElementById("cover"), coverWrapper = document.getElementById("cover-wrapper"), playBtn = document.getElementById("play-btn"), prevBtn = document.getElementById("prev-btn"), nextBtn = document.getElementById("next-btn"), shuffleBtn = document.getElementById("shuffle-btn"), repeatBtn = document.getElementById("repeat-btn"), themeBtn = document.getElementById("theme-btn"), progressBar = document.getElementById("progress-bar"), currentTimeEl = document.getElementById("current-time"), totalDurationEl = document.getElementById("total-duration"), volumeBar = document.getElementById("volume-bar"), playlistEl = document.getElementById("playlist"), currentLyricEl = document.getElementById("current-lyric"), fileInput = document.getElementById("file-input"), dropZone = document.getElementById("drop-zone"), recordBtn = document.getElementById("record-btn");

// DJ Controls
const eqHighBar = document.getElementById("eq-high"), eqMidBar = document.getElementById("eq-mid"), eqLowBar = document.getElementById("eq-low"), tempoBar = document.getElementById("tempo-bar"), filterBar = document.getElementById("filter-bar"), tempoLabel = document.getElementById("tempo-label"), filterLabel = document.getElementById("filter-label"), resetTempoBtn = document.getElementById("reset-tempo-btn"), resetFilterBtn = document.getElementById("reset-filter-btn"), panBar = document.getElementById("pan-bar"), panLabel = document.getElementById("pan-label");
const echoAmtBar = document.getElementById("echo-amount"), reverbAmtBar = document.getElementById("reverb-amount"), fxLabel = document.getElementById("fx-label");
const loopABtn = document.getElementById("loop-a-btn"), loopBBtn = document.getElementById("loop-b-btn"), clearLoopBtn = document.getElementById("clear-loop-btn"), loopLabel = document.getElementById("loop-label");
const cueBtns = [document.getElementById("cue-1"), document.getElementById("cue-2"), document.getElementById("cue-3")], clearCuesBtn = document.getElementById("clear-cues-btn");

coverEl.addEventListener("error", () => { coverEl.src = defaultCover; });

function loadSettings() {
    const savedVol = localStorage.getItem("player_volume");
    const savedTheme = localStorage.getItem("player_theme");
    if (savedVol !== null) volumeBar.value = savedVol;
    if (savedTheme === "sunset") document.body.setAttribute("data-theme", "sunset");
    audio.volume = volumeBar.value;
}
function saveSetting(key, value) { localStorage.setItem(key, value); }

themeBtn.addEventListener("click", () => {
    if (document.body.getAttribute("data-theme") === "sunset") { document.body.removeAttribute("data-theme"); saveSetting("player_theme", "emerald"); } 
    else { document.body.setAttribute("data-theme", "sunset"); saveSetting("player_theme", "sunset"); }
});

// --- AUDIO ROUTING ---
const canvas = document.getElementById("visualizer");
const canvasCtx = canvas.getContext("2d");
let audioCtx, analyser, source, lowFilter, midFilter, highFilter, sweepFilter, stereoPanner, delayNode, feedbackGain, reverbNode, reverbGain, masterCompressor, streamDestination;
let isVisualizerInitialized = false;

function createReverbBuffer(ctx, duration, decay) {
    const length = ctx.sampleRate * duration;
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let i = 0; i < 2; i++) {
        const channelData = impulse.getChannelData(i);
        for (let j = 0; j < length; j++) {
            channelData[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / length, decay);
        }
    }
    return impulse;
}

function initAudioGraph() {
    if (isVisualizerInitialized) return;
    
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    source = audioCtx.createMediaElementSource(audio);
    
    // 1. EQ & Panning
    lowFilter = audioCtx.createBiquadFilter(); lowFilter.type = "lowshelf"; lowFilter.frequency.value = 250; lowFilter.gain.value = eqLowBar.value;
    midFilter = audioCtx.createBiquadFilter(); midFilter.type = "peaking"; midFilter.frequency.value = 1000; midFilter.Q.value = 1; midFilter.gain.value = eqMidBar.value;
    highFilter = audioCtx.createBiquadFilter(); highFilter.type = "highshelf"; highFilter.frequency.value = 6000; highFilter.gain.value = eqHighBar.value;
    sweepFilter = audioCtx.createBiquadFilter(); sweepFilter.type = "allpass"; 
    stereoPanner = audioCtx.createStereoPanner ? audioCtx.createStereoPanner() : audioCtx.createPanner(); 

    // 2. Echo FX
    delayNode = audioCtx.createDelay(2.0); delayNode.delayTime.value = 0.4;
    feedbackGain = audioCtx.createGain(); feedbackGain.gain.value = echoAmtBar.value;

    // 3. Reverb FX
    reverbNode = audioCtx.createConvolver();
    reverbNode.buffer = createReverbBuffer(audioCtx, 3, 2); 
    reverbGain = audioCtx.createGain(); reverbGain.gain.value = reverbAmtBar.value;

    // 4. Master Compressor
    masterCompressor = audioCtx.createDynamicsCompressor();
    masterCompressor.threshold.value = -3; 
    masterCompressor.ratio.value = 4;

    // 5. Analyser & Outputs
    analyser = audioCtx.createAnalyser(); analyser.fftSize = 256; 
    streamDestination = audioCtx.createMediaStreamDestination(); 
    
    // Connect Core Chain
    source.connect(lowFilter); lowFilter.connect(midFilter); midFilter.connect(highFilter); highFilter.connect(sweepFilter); sweepFilter.connect(stereoPanner);
    
    // Branching
    stereoPanner.connect(masterCompressor); 
    stereoPanner.connect(delayNode); delayNode.connect(feedbackGain); feedbackGain.connect(delayNode); feedbackGain.connect(masterCompressor);
    stereoPanner.connect(reverbNode); reverbNode.connect(reverbGain); reverbGain.connect(masterCompressor);

    // Final Output Routing
    masterCompressor.connect(analyser);
    analyser.connect(audioCtx.destination); 
    analyser.connect(streamDestination); 
    
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    canvas.width = canvas.offsetWidth; canvas.height = canvas.offsetHeight;

    function draw() {
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / bufferLength) * 2.5; let x = 0;
        const style = getComputedStyle(document.body);
        const r = style.getPropertyValue('--vis-r').trim() || '16', g = style.getPropertyValue('--vis-g').trim() || '185', b = style.getPropertyValue('--vis-b').trim() || '129';
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

// --- MIX RECORDER LOGIC ---
recordBtn.addEventListener("click", () => {
    initAudioGraph(); 
    if (!isRecording) {
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(streamDestination.stream);
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `DJ_Mix_${new Date().getTime()}.webm`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        };
        mediaRecorder.start();
        isRecording = true;
        recordBtn.textContent = "⏹️ Stop Recording";
        recordBtn.classList.add("recording");
    } else {
        mediaRecorder.stop();
        isRecording = false;
        recordBtn.textContent = "🔴 Record Mix";
        recordBtn.classList.remove("recording");
    }
});

// --- HOT CUES LOGIC ---
cueBtns.forEach((btn, i) => {
    btn.addEventListener("click", () => {
        if (hotCues[i] === null) {
            hotCues[i] = audio.currentTime;
            btn.classList.add("active");
            btn.textContent = `Cue ${i+1}`;
        } else {
            audio.currentTime = hotCues[i];
            if (!isPlaying) safePlay();
        }
    });
});
clearCuesBtn.addEventListener("click", () => {
    hotCues = [null, null, null];
    cueBtns.forEach((btn, i) => { btn.classList.remove("active"); btn.textContent = `Set ${i+1}`; });
});

// --- DJ CONTROLS LOGIC ---
eqHighBar.addEventListener("input", () => { if (highFilter) highFilter.gain.value = eqHighBar.value; });
eqMidBar.addEventListener("input", () => { if (midFilter) midFilter.gain.value = eqMidBar.value; });
eqLowBar.addEventListener("input", () => { if (lowFilter) lowFilter.gain.value = eqLowBar.value; });

tempoBar.addEventListener("input", () => { audio.playbackRate = tempoBar.value; tempoLabel.textContent = parseFloat(tempoBar.value).toFixed(2) + "x"; });
resetTempoBtn.addEventListener("click", () => { tempoBar.value = 1; audio.playbackRate = 1; tempoLabel.textContent = "1.00x"; });

filterBar.addEventListener("input", () => {
    if (!sweepFilter) return;
    const val = parseInt(filterBar.value);
    if (val === 0) { sweepFilter.type = "allpass"; filterLabel.textContent = "OFF"; } 
    else if (val < 0) { sweepFilter.type = "lowpass"; sweepFilter.frequency.value = 20000 - (Math.abs(val) * 198); filterLabel.textContent = `LPF ${Math.abs(val)}%`; } 
    else { sweepFilter.type = "highpass"; sweepFilter.frequency.value = val * 50; filterLabel.textContent = `HPF ${val}%`; }
});
resetFilterBtn.addEventListener("click", () => { filterBar.value = 0; if (sweepFilter) sweepFilter.type = "allpass"; filterLabel.textContent = "OFF"; });

panBar.addEventListener("input", () => {
    if (stereoPanner && stereoPanner.pan) stereoPanner.pan.value = panBar.value;
});

function updateFXLabel() {
    if (echoAmtBar.value > 0 && reverbAmtBar.value > 0) fxLabel.textContent = "ECHO+VERB";
    else if (echoAmtBar.value > 0) fxLabel.textContent = "ECHO";
    else if (reverbAmtBar.value > 0) fxLabel.textContent = "REVERB";
    else fxLabel.textContent = "DRY";
}
echoAmtBar.addEventListener("input", () => { if (feedbackGain) feedbackGain.gain.value = echoAmtBar.value; updateFXLabel(); });
reverbAmtBar.addEventListener("input", () => { if (reverbGain) reverbGain.gain.value = reverbAmtBar.value; updateFXLabel(); });

loopABtn.addEventListener("click", () => { loopA = audio.currentTime; loopABtn.classList.add("active"); updateLoopLabel(); });
loopBBtn.addEventListener("click", () => { if (loopA !== null && audio.currentTime > loopA) { loopB = audio.currentTime; isLooping = true; loopBBtn.classList.add("active"); updateLoopLabel(); } });
clearLoopBtn.addEventListener("click", () => { loopA = null; loopB = null; isLooping = false; loopABtn.classList.remove("active"); loopBBtn.classList.remove("active"); updateLoopLabel(); });
function updateLoopLabel() {
    if (isLooping) loopLabel.textContent = "ACTIVE"; else if (loopA !== null) loopLabel.textContent = "SET B..."; else loopLabel.textContent = "OFF";
}

// --- LYRICS PARSING ---
async function fetchLyrics(songTitle) {
    try {
        const response = await fetch(`https://lrclib.net/api/search?track_name=${encodeURIComponent(songTitle.replace(/\(.*\)|\[.*\]/g, '').trim())}`);
        const data = await response.json();
        return (data && data.length > 0 && data[0].syncedLyrics) ? data[0].syncedLyrics : null;
    } catch (error) { return null; }
}

function parseLRC(lrcString) {
    if (!lrcString) return [];
    const lines = lrcString.split('\n'); const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/; const parsed = [];
    lines.forEach(line => {
        const match = regex.exec(line);
        if (match) {
            const text = line.replace(regex, '').trim();
            if (text) parsed.push({ time: (parseInt(match[1], 10) * 60) + parseInt(match[2], 10), text });
        }
    });
    return parsed;
}

// --- CORE PLAYBACK ---
function safePlay() {
    if (songs.length === 0) return;
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.then(() => { isPlaying = true; playBtn.textContent = "⏸️"; coverWrapper.classList.add("playing"); audio.playbackRate = tempoBar.value; }).catch(e => { isPlaying = false; playBtn.textContent = "▶️"; coverWrapper.classList.remove("playing"); });
    }
}

async function loadSong(index) {
    if (index < 0 || index >= songs.length) return; 
    clearLoopBtn.click(); 
    
    const song = songs[index];
    titleEl.textContent = song.title; artistEl.textContent = song.artist; coverEl.src = song.cover || defaultCover;
    coverEl.style.animation = 'none'; coverEl.offsetHeight; coverEl.style.animation = null; 
    
    audio.src = song.src; progressBar.value = 0; currentTimeEl.textContent = "0:00"; totalDurationEl.textContent = "0:00"; 
    updatePlaylistUI();

    if (song.lrc) {
        parsedLyrics = parseLRC(song.lrc); currentLyricEl.textContent = parsedLyrics.length > 0 ? "🎵" : "No lyrics available";
    } else {
        currentLyricEl.textContent = "🔍 Searching..."; parsedLyrics = [];
        const apiLyrics = await fetchLyrics(song.title);
        if (apiLyrics) { song.lrc = apiLyrics; parsedLyrics = parseLRC(apiLyrics); currentLyricEl.textContent = "✅ Lyrics Found!"; setTimeout(() => { if (currentLyricEl.textContent === "✅ Lyrics Found!") currentLyricEl.textContent = "🎵"; }, 2000); } 
        else currentLyricEl.textContent = "No lyrics available";
    }
}

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60); const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
}

function togglePlay() {
    if (songs.length === 0) return; 
    if (isPlaying) { audio.pause(); isPlaying = false; playBtn.textContent = "▶️"; coverWrapper.classList.remove("playing"); } 
    else safePlay();
}

function nextSong() {
    if (songs.length === 0) return;
    if (isRepeat) { audio.currentTime = 0; } 
    else if (isShuffle && songs.length > 1) {
        let newIndex = currentSongIndex; while (newIndex === currentSongIndex) newIndex = Math.floor(Math.random() * songs.length);
        currentSongIndex = newIndex;
    } else currentSongIndex = (currentSongIndex + 1) % songs.length;
    loadSong(currentSongIndex); if (isPlaying) safePlay();
}

function prevSong() {
    if (songs.length === 0) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    loadSong(currentSongIndex); if (isPlaying) safePlay();
}

// --- EVENT LISTENERS ---
audio.addEventListener('loadedmetadata', () => { totalDurationEl.textContent = formatTime(audio.duration); progressBar.max = audio.duration; });
audio.addEventListener("timeupdate", () => {
    const currentTime = audio.currentTime;
    if (isLooping && loopB !== null && currentTime >= loopB) { audio.currentTime = loopA !== null ? loopA : 0; return; }
    currentTimeEl.textContent = formatTime(currentTime);
    if (!audio.paused && audio.duration) progressBar.value = currentTime;

    if (parsedLyrics.length > 0) {
        let activeLyric = "🎵";
        for (let i = 0; i < parsedLyrics.length; i++) { if (currentTime >= parsedLyrics[i].time) activeLyric = parsedLyrics[i].text; else break; }
        if (currentLyricEl.textContent !== activeLyric) currentLyricEl.textContent = activeLyric;
    }
});
audio.addEventListener("ended", nextSong);

playBtn.addEventListener("click", () => { initAudioGraph(); togglePlay(); });
nextBtn.addEventListener("click", nextSong); prevBtn.addEventListener("click", prevSong);
shuffleBtn.addEventListener("click", () => { isShuffle = !isShuffle; shuffleBtn.classList.toggle("active-control"); });
repeatBtn.addEventListener("click", () => { isRepeat = !isRepeat; repeatBtn.classList.toggle("active-control"); });
progressBar.addEventListener("input", () => audio.currentTime = progressBar.value);
volumeBar.addEventListener("input", () => { audio.volume = volumeBar.value; saveSetting("player_volume", volumeBar.value); });

document.addEventListener("keydown", (e) => {
    if (e.code === "Space" && e.target === document.body) { e.preventDefault(); initAudioGraph(); togglePlay(); }
    if (e.code === "ArrowRight") { e.preventDefault(); nextSong(); }
    if (e.code === "ArrowLeft") { e.preventDefault(); prevSong(); }
});

// --- PLAYLIST & FILES ---
function renderPlaylist() {
    playlistEl.innerHTML = "";
    songs.forEach((song, index) => {
        const li = document.createElement("li"); li.textContent = `${song.title} - ${song.artist}`;
        li.addEventListener("click", () => { currentSongIndex = index; loadSong(currentSongIndex); initAudioGraph(); safePlay(); });
        playlistEl.appendChild(li);
    });
    updatePlaylistUI();
}
function updatePlaylistUI() {
    const listItems = playlistEl.querySelectorAll("li");
    listItems.forEach((li, index) => { li.classList.toggle("active", index === currentSongIndex); });
}

function handleFiles(files) {
    const previousLength = songs.length;
    for (let i = 0; i < files.length; i++) {
        const file = files[i]; if (!file.type.startsWith('audio/')) continue; 
        songs.push({ title: file.name.replace(/\.[^/.]+$/, ""), artist: "Local File", src: URL.createObjectURL(file), cover: null, lrc: "" });
    }
    renderPlaylist();
    if (!isPlaying && songs.length > previousLength) { currentSongIndex = previousLength; loadSong(currentSongIndex); initAudioGraph(); safePlay(); }
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
} else {
    // Empty state UI updates
    titleEl.textContent = "No Song Selected";
    artistEl.textContent = "Drop an MP3 to begin";
    coverEl.src = defaultCover;
}