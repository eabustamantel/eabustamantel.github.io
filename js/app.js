/* =========================================================
   CINTA — Reproductor de música local
   JavaScript puro (sin frameworks ni dependencias).

   Índice:
   1. Referencias al DOM
   2. Estado de la aplicación
   3. Utilidades
   4. Carga de la biblioteca (fetch de musica/playlist.json
      + alternativa manual con selector de carpeta)
   5. Render de la lista de pistas
   6. Motor de reproducción (audio + Web Audio API)
   7. Controles de transporte (play, prev, next, seek, volumen)
   8. Modos: aleatorio y repetición
   9. Visualizador (canvas en anillo)
   10. Atajos de teclado y Media Session
   11. Persistencia (localStorage)
   12. Arranque
   ========================================================= */

(function () {
  'use strict';

  /* ---------- 1. REFERENCIAS AL DOM ---------- */
  const dom = {
    deck: document.querySelector('.deck'),
    tracklist: document.getElementById('tracklist'),
    libraryStatus: document.getElementById('libraryStatus'),
    libraryCount: document.getElementById('libraryCount'),
    searchInput: document.getElementById('searchInput'),

    disc: document.getElementById('disc'),
    discArt: document.getElementById('discArt'),
    visualizer: document.getElementById('visualizer'),

    nowPlayingEyebrow: document.getElementById('nowPlayingEyebrow'),
    nowPlayingTitle: document.getElementById('nowPlayingTitle'),
    nowPlayingArtist: document.getElementById('nowPlayingArtist'),

    seekBar: document.getElementById('seekBar'),
    currentTime: document.getElementById('currentTime'),
    durationTime: document.getElementById('durationTime'),

    playBtn: document.getElementById('playBtn'),
    playIcon: document.getElementById('playIcon'),
    pauseIcon: document.getElementById('pauseIcon'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),

    shuffleBtn: document.getElementById('shuffleBtn'),
    repeatBtn: document.getElementById('repeatBtn'),

    muteBtn: document.getElementById('muteBtn'),
    volIconOn: document.getElementById('volIconOn'),
    volIconOff: document.getElementById('volIconOff'),
    volumeBar: document.getElementById('volumeBar'),

    toast: document.getElementById('toast'),
  };

  /* ---------- 2. ESTADO DE LA APLICACIÓN ---------- */
  const state = {
    tracks: [],            // { title, artist, album, src, cover }
    filteredIndices: [],   // índices visibles según el buscador
    currentIndex: -1,
    isPlaying: false,
    shuffle: false,
    repeatMode: 'off',     // 'off' | 'all' | 'one'
    volume: 0.8,
    muted: false,
    shuffleHistory: [],    // pila de índices ya reproducidos en modo aleatorio
  };

  /* Elemento de audio real que reproduce el sonido */
  const audio = new Audio();
  audio.preload = 'metadata';

  /* Web Audio API — se inicializa de forma perezosa tras la primera
     interacción del usuario (los navegadores lo exigen). */
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let freqData = null;

  /* ---------- 3. UTILIDADES ---------- */

  /** Formatea segundos a "m:ss" */
  function formatTime(seconds) {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  /** Muestra un aviso flotante temporal */
  let toastTimer = null;
  function showToast(message, kind = 'error') {
    dom.toast.textContent = message;
    dom.toast.classList.toggle('is-info', kind === 'info');
    dom.toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => dom.toast.classList.remove('is-visible'), 4200);
  }

  /** Deriva "Artista" y "Título" a partir de un nombre de archivo,
   *  aceptando la convención habitual "Artista - Título.ext" */
  function parseFilename(filename) {
    const base = filename.replace(/\.[^/.]+$/, '');
    const parts = base.split(' - ');
    if (parts.length >= 2) {
      return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
    }
    return { artist: 'Artista desconocido', title: base.trim() };
  }

  /** Actualiza una variable CSS custom (--val) para pintar el progreso
   *  de un <input type="range"> de forma consistente entre navegadores */
  function paintRange(input) {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const pct = ((input.value - min) / (max - min)) * 100;
    input.style.setProperty('--val', `${pct}%`);
  }

  /* ---------- 4. CARGA DE LA BIBLIOTECA (100% AUTOMÁTICA) ----------
     La carpeta "musica" NUNCA se lista a mano: el reproductor detecta
     los archivos que hay dentro probando, en orden, estas estrategias:

     1) API de GitHub → funciona cuando el sitio está publicado en
        GitHub Pages (lee el contenido real de la carpeta "musica"
        del repositorio, sin importar cuántos archivos agregues o
        quites).
     2) Listado de directorio del servidor → funciona al probar en
        local con un servidor que muestra el índice de la carpeta
        (por ejemplo "python3 -m http.server").
     3) musica/playlist.json → único respaldo final, por si el sitio
        se aloja en un servidor que no permite ninguna de las dos
        opciones anteriores. No es obligatorio mantenerlo.
  */

  const AUDIO_EXT = /\.(mp3|wav|ogg|oga|m4a|flac|aac|weba)$/i;

  async function init() {
    restoreSettings();
    wireStaticControls();

    dom.libraryStatus.textContent = 'Detectando canciones en “musica”…';

    const estrategias = [loadFromGitHubApi, loadFromDirectoryListing, loadFromManifest];
    let cargado = false;

    for (const estrategia of estrategias) {
      try {
        const tracks = await estrategia();
        if (tracks && tracks.length > 0) { cargado = true; break; }
      } catch (err) {
        // Se prueba la siguiente estrategia en silencio
      }
    }

    if (!cargado) {
      dom.libraryStatus.textContent = 'No se encontraron canciones en “musica”.';
      showToast(
        'No se detectó ninguna canción. Si estás en local, usa un servidor (python3 -m http.server). Si estás en GitHub Pages, confirma que los archivos están dentro de la carpeta "musica" del repositorio.',
        'error'
      );
      renderEmptyLibrary();
    }
  }

  /** Estrategia 1: lee el contenido real de la carpeta "musica" del
   *  repositorio de GitHub mediante la API pública de GitHub. Así, al
   *  agregar o quitar archivos en el repo, la lista se actualiza sola
   *  sin tocar ningún archivo de configuración. */
  async function loadFromGitHubApi() {
    if (!location.hostname.endsWith('github.io')) throw new Error('no-es-github-pages');

    const owner = location.hostname.split('.')[0];
    const segmentoRepo = location.pathname.split('/').filter(Boolean)[0];

    // Prueba primero como página de usuario/organización (repo == hostname)
    // y, si no existe, como página de proyecto (repo == primer segmento de la URL).
    const repositoriosCandidatos = [location.hostname];
    if (segmentoRepo) repositoriosCandidatos.push(segmentoRepo);

    let ultimoError = null;

    for (const repo of repositoriosCandidatos) {
      try {
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/musica`;
        const res = await fetch(apiUrl, { headers: { Accept: 'application/vnd.github+json' } });
        if (!res.ok) { ultimoError = new Error(`github-api-${res.status}`); continue; }

        const items = await res.json();
        if (!Array.isArray(items)) { ultimoError = new Error('respuesta-no-es-lista'); continue; }

        const audioItems = items
          .filter((it) => it.type === 'file' && AUDIO_EXT.test(it.name))
          .sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));

        if (audioItems.length === 0) { ultimoError = new Error('sin-audio-en-repo'); continue; }

        state.tracks = audioItems.map((it) => {
          const meta = parseFilename(it.name);
          return { title: meta.title, artist: meta.artist, album: '', src: it.download_url, cover: '' };
        });

        dom.libraryStatus.textContent = '';
        finishLibraryLoad('GitHub · detección automática');
        return state.tracks;
      } catch (e) {
        ultimoError = e;
      }
    }

    throw ultimoError || new Error('github-api-fallo');
  }

  /** Estrategia 2: cuando se sirve la carpeta con un servidor local que
   *  muestra el índice de directorio (por ejemplo "python3 -m http.server"),
   *  se lee ese listado HTML y se extraen los enlaces a archivos de audio. */
  async function loadFromDirectoryListing() {
    const res = await fetch('musica/', { cache: 'no-store' });
    if (!res.ok) throw new Error('sin-listado-de-directorio');

    const html = await res.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');

    const nombres = Array.from(doc.querySelectorAll('a'))
      .map((a) => decodeURIComponent((a.getAttribute('href') || '').split('?')[0]))
      .filter((href) => AUDIO_EXT.test(href) && !href.includes('/'))
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true }));

    if (nombres.length === 0) throw new Error('listado-sin-audio');

    state.tracks = nombres.map((nombre) => {
      const meta = parseFilename(nombre);
      return { title: meta.title, artist: meta.artist, album: '', src: `musica/${nombre}`, cover: '' };
    });

    dom.libraryStatus.textContent = '';
    finishLibraryLoad('listado de carpeta (servidor local)');
    return state.tracks;
  }

  /** Estrategia 3 (respaldo final, opcional): musica/playlist.json.
   *  Solo se usa si las dos estrategias automáticas anteriores fallan. */
  async function loadFromManifest() {
    const res = await fetch('musica/playlist.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('sin-playlist-json');
    const data = await res.json();
    const pistas = Array.isArray(data.pistas) ? data.pistas : [];

    if (pistas.length === 0) throw new Error('playlist-json-vacio');

    state.tracks = pistas.map((p) => ({
      title: p.titulo || parseFilename(p.src).title,
      artist: p.artista || 'Artista desconocido',
      album: p.album || '',
      src: `musica/${p.src}`,
      cover: p.cover ? `musica/${p.cover}` : '',
    }));

    dom.libraryStatus.textContent = '';
    finishLibraryLoad('musica/playlist.json (respaldo)');
    return state.tracks;
  }

  function finishLibraryLoad(origen) {
    state.filteredIndices = state.tracks.map((_, i) => i);
    renderTracklist();
    dom.libraryCount.textContent =
      `${state.tracks.length} pista${state.tracks.length === 1 ? '' : 's'} · fuente: ${origen}`;

    // Restaura la última pista escuchada si sigue existiendo (solo modo manifest)
    const savedIndex = Number(localStorage.getItem('cinta:lastIndex'));
    if (!Number.isNaN(savedIndex) && savedIndex >= 0 && savedIndex < state.tracks.length) {
      loadTrack(savedIndex, { autoplay: false });
    } else {
      loadTrack(0, { autoplay: false });
    }
  }

  function renderEmptyLibrary() {
    dom.tracklist.innerHTML = `
      <li class="library__empty">
        No hay pistas cargadas todavía.<br>
        Solo coloca tus archivos de audio dentro de la carpeta
        <code>musica</code> del repositorio y recarga la página: se
        detectan automáticamente, sin editar nada.
      </li>`;
    dom.libraryCount.textContent = '';
  }

  /* ---------- 5. RENDER DE LA LISTA DE PISTAS ---------- */

  function renderTracklist() {
    if (state.tracks.length === 0) return renderEmptyLibrary();

    dom.tracklist.innerHTML = '';
    const fragment = document.createDocumentFragment();

    state.filteredIndices.forEach((trackIndex) => {
      const track = state.tracks[trackIndex];
      const li = document.createElement('li');
      li.className = 'track';
      li.dataset.index = String(trackIndex);
      if (trackIndex === state.currentIndex) {
        li.classList.add('is-active');
        if (state.isPlaying) li.classList.add('is-playing');
      }

      li.innerHTML = `
        <button class="track__btn" type="button" aria-label="Reproducir ${escapeHtml(track.title)}">
          <span class="track__index">${String(trackIndex + 1).padStart(2, '0')}</span>
          <span class="eq-mini"><span></span><span></span><span></span></span>
        </button>
        <span class="track__info">
          <span class="track__title">${escapeHtml(track.title)}</span>
          <span class="track__artist">${escapeHtml(track.artist)}</span>
        </span>
        <span class="track__duration" data-duration></span>
      `;

      li.addEventListener('click', () => {
        loadTrack(trackIndex, { autoplay: true });
      });

      fragment.appendChild(li);
    });

    dom.tracklist.appendChild(fragment);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /** Filtra la lista visible según el texto del buscador */
  function applySearchFilter() {
    const q = dom.searchInput.value.trim().toLowerCase();
    state.filteredIndices = state.tracks
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => !q || t.title.toLowerCase().includes(q) || t.artist.toLowerCase().includes(q))
      .map(({ i }) => i);
    renderTracklist();
  }

  /* ---------- 6. MOTOR DE REPRODUCCIÓN ---------- */

  function ensureAudioGraph() {
    if (audioCtx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
    sourceNode = audioCtx.createMediaElementSource(audio);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    freqData = new Uint8Array(analyser.frequencyBinCount);

    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  function loadTrack(trackIndex, { autoplay }) {
    if (trackIndex < 0 || trackIndex >= state.tracks.length) return;

    state.currentIndex = trackIndex;
    const track = state.tracks[trackIndex];

    audio.src = track.src;
    audio.load();

    dom.nowPlayingEyebrow.textContent = track.album ? track.album : 'Reproduciendo desde /musica';
    dom.nowPlayingTitle.textContent = track.title;
    dom.nowPlayingArtist.textContent = track.artist;
    document.title = `${track.title} · ${track.artist} — Cinta`;

    updateMediaSessionMetadata(track);
    renderTracklist();
    localStorage.setItem('cinta:lastIndex', String(trackIndex));

    if (autoplay) play();
    else pause({ silent: true });
  }

  function play() {
    ensureAudioGraph();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    audio.play().catch(() => {
      showToast('No se pudo reproducir esta pista. Comprueba el formato del archivo.');
    });
  }

  function pause({ silent = false } = {}) {
    if (!silent) audio.pause();
  }

  function togglePlay() {
    if (state.tracks.length === 0) {
      showToast('Todavía no hay ninguna pista cargada.');
      return;
    }
    if (audio.paused) play();
    else audio.pause();
  }

  function goToRelativeTrack(direction) {
    if (state.tracks.length === 0) return;

    if (state.shuffle) {
      loadTrack(pickShuffleIndex(direction), { autoplay: true });
      return;
    }

    let nextIndex = state.currentIndex + direction;
    if (nextIndex < 0) nextIndex = state.tracks.length - 1;
    if (nextIndex >= state.tracks.length) nextIndex = 0;
    loadTrack(nextIndex, { autoplay: true });
  }

  /* ---------- 7. TRANSPORTE Y CONTROLES ---------- */

  function wireStaticControls() {
    dom.playBtn.addEventListener('click', togglePlay);
    dom.prevBtn.addEventListener('click', () => goToRelativeTrack(-1));
    dom.nextBtn.addEventListener('click', () => goToRelativeTrack(1));

    audio.addEventListener('play', () => {
      state.isPlaying = true;
      dom.playIcon.hidden = true;
      dom.pauseIcon.hidden = false;
      dom.deck.classList.add('is-playing');
      syncActiveTrackPlayingClass();
    });

    audio.addEventListener('pause', () => {
      state.isPlaying = false;
      dom.playIcon.hidden = false;
      dom.pauseIcon.hidden = true;
      dom.deck.classList.remove('is-playing');
      syncActiveTrackPlayingClass();
    });

    audio.addEventListener('loadedmetadata', () => {
      dom.durationTime.textContent = formatTime(audio.duration);
      dom.seekBar.max = String(audio.duration || 0);
      const li = dom.tracklist.querySelector(`.track[data-index="${state.currentIndex}"] [data-duration]`);
      if (li) li.textContent = formatTime(audio.duration);
    });

    audio.addEventListener('timeupdate', () => {
      if (!isSeeking) {
        dom.seekBar.value = String(audio.currentTime);
        paintRange(dom.seekBar);
      }
      dom.currentTime.textContent = formatTime(audio.currentTime);
    });

    audio.addEventListener('ended', handleTrackEnded);

    audio.addEventListener('error', () => {
      if (!audio.src) return;
      showToast('Error al cargar el archivo de audio. ¿El nombre coincide con el de playlist.json?');
    });

    // Barra de progreso (seek)
    let isSeekingLocal = false;
    dom.seekBar.addEventListener('input', () => {
      isSeekingLocal = true;
      isSeeking = true;
      paintRange(dom.seekBar);
      dom.currentTime.textContent = formatTime(Number(dom.seekBar.value));
    });
    dom.seekBar.addEventListener('change', () => {
      audio.currentTime = Number(dom.seekBar.value);
      isSeeking = false;
      isSeekingLocal = false;
    });

    // Volumen
    dom.volumeBar.addEventListener('input', () => {
      state.volume = Number(dom.volumeBar.value) / 100;
      state.muted = false;
      applyVolume();
    });
    dom.muteBtn.addEventListener('click', () => {
      state.muted = !state.muted;
      applyVolume();
    });

    // Modos
    dom.shuffleBtn.addEventListener('click', () => {
      state.shuffle = !state.shuffle;
      state.shuffleHistory = [];
      dom.shuffleBtn.setAttribute('aria-pressed', String(state.shuffle));
      saveSettings();
    });
    dom.repeatBtn.addEventListener('click', () => {
      const order = ['off', 'all', 'one'];
      const next = order[(order.indexOf(state.repeatMode) + 1) % order.length];
      state.repeatMode = next;
      dom.repeatBtn.dataset.mode = next;
      dom.repeatBtn.setAttribute('aria-pressed', String(next !== 'off'));
      saveSettings();
    });

    // Buscador
    dom.searchInput.addEventListener('input', applySearchFilter);

    // Inicializa el pintado de los sliders
    paintRange(dom.seekBar);
    paintRange(dom.volumeBar);

    window.addEventListener('keydown', handleKeydown);
  }

  let isSeeking = false;

  function syncActiveTrackPlayingClass() {
    dom.tracklist.querySelectorAll('.track').forEach((li) => {
      li.classList.toggle('is-playing', Number(li.dataset.index) === state.currentIndex && state.isPlaying);
    });
  }

  function handleTrackEnded() {
    if (state.repeatMode === 'one') {
      audio.currentTime = 0;
      play();
      return;
    }

    const isLast = !state.shuffle && state.currentIndex === state.tracks.length - 1;
    if (isLast && state.repeatMode === 'off') {
      pause();
      return;
    }
    goToRelativeTrack(1);
  }

  function applyVolume() {
    audio.volume = state.muted ? 0 : state.volume;
    dom.volumeBar.value = String(Math.round(state.volume * 100));
    paintRange(dom.volumeBar);
    dom.volIconOn.hidden = state.muted || state.volume === 0;
    dom.volIconOff.hidden = !(state.muted || state.volume === 0);
    saveSettings();
  }

  /* ---------- 8. MODOS: ALEATORIO Y REPETICIÓN ---------- */

  function pickShuffleIndex(direction) {
    const total = state.tracks.length;
    if (total <= 1) return 0;

    if (direction > 0) {
      let next;
      do { next = Math.floor(Math.random() * total); } while (next === state.currentIndex);
      state.shuffleHistory.push(state.currentIndex);
      return next;
    }
    // "anterior" en modo aleatorio: vuelve al historial si existe
    return state.shuffleHistory.pop() ?? Math.floor(Math.random() * total);
  }

  /* ---------- 9. VISUALIZADOR (CANVAS EN ANILLO) ---------- */

  function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);

    const canvas = dom.visualizer;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    const baseRadius = w * 0.34;
    const bars = 64;

    if (analyser && state.isPlaying) {
      analyser.getByteFrequencyData(freqData);
    }

    for (let i = 0; i < bars; i++) {
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const dataIndex = Math.floor((i / bars) * (freqData ? freqData.length : 0));
      const value = freqData && state.isPlaying ? freqData[dataIndex] : 0;
      const barLength = 6 + (value / 255) * (w * 0.11);

      const x1 = cx + Math.cos(angle) * baseRadius;
      const y1 = cy + Math.sin(angle) * baseRadius;
      const x2 = cx + Math.cos(angle) * (baseRadius + barLength);
      const y2 = cy + Math.sin(angle) * (baseRadius + barLength);

      const hueMix = i / bars;
      ctx.strokeStyle = hueMix < 0.5 ? '#f2a93b' : '#38c6b4';
      ctx.globalAlpha = 0.55 + (value / 255) * 0.45;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 10. ATAJOS DE TECLADO Y MEDIA SESSION ---------- */

  function handleKeydown(e) {
    // Ignora atajos si el foco está en un campo de texto
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
      if (e.key === 'Escape') document.activeElement.blur();
      return;
    }

    switch (e.key) {
      case ' ':
        e.preventDefault();
        togglePlay();
        break;
      case 'ArrowRight':
        audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
        break;
      case 'ArrowLeft':
        audio.currentTime = Math.max(0, audio.currentTime - 5);
        break;
      case 'ArrowUp':
        e.preventDefault();
        state.volume = Math.min(1, state.volume + 0.05);
        state.muted = false;
        applyVolume();
        break;
      case 'ArrowDown':
        e.preventDefault();
        state.volume = Math.max(0, state.volume - 0.05);
        state.muted = false;
        applyVolume();
        break;
      case 'n':
      case 'N':
        goToRelativeTrack(1);
        break;
      case 'p':
      case 'P':
        goToRelativeTrack(-1);
        break;
      case 'm':
      case 'M':
        state.muted = !state.muted;
        applyVolume();
        break;
      case 's':
      case 'S':
        dom.shuffleBtn.click();
        break;
      case 'r':
      case 'R':
        dom.repeatBtn.click();
        break;
      default:
        break;
    }
  }

  function updateMediaSessionMetadata(track) {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist,
      album: track.album || 'Cinta',
    });
    navigator.mediaSession.setActionHandler('play', play);
    navigator.mediaSession.setActionHandler('pause', () => audio.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => goToRelativeTrack(-1));
    navigator.mediaSession.setActionHandler('nexttrack', () => goToRelativeTrack(1));
  }

  /* ---------- 11. PERSISTENCIA ---------- */

  function saveSettings() {
    localStorage.setItem('cinta:settings', JSON.stringify({
      volume: state.volume,
      muted: state.muted,
      shuffle: state.shuffle,
      repeatMode: state.repeatMode,
    }));
  }

  function restoreSettings() {
    try {
      const raw = localStorage.getItem('cinta:settings');
      if (!raw) { applyVolume(); return; }
      const saved = JSON.parse(raw);

      state.volume = typeof saved.volume === 'number' ? saved.volume : 0.8;
      state.muted = Boolean(saved.muted);
      state.shuffle = Boolean(saved.shuffle);
      state.repeatMode = ['off', 'all', 'one'].includes(saved.repeatMode) ? saved.repeatMode : 'off';

      dom.shuffleBtn.setAttribute('aria-pressed', String(state.shuffle));
      dom.repeatBtn.dataset.mode = state.repeatMode;
      dom.repeatBtn.setAttribute('aria-pressed', String(state.repeatMode !== 'off'));
      applyVolume();
    } catch {
      applyVolume();
    }
  }

  /* ---------- 12. ARRANQUE ---------- */

  document.addEventListener('DOMContentLoaded', () => {
    init();
    requestAnimationFrame(drawVisualizer);
  });
})();
