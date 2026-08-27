(function () {
  "use strict";

  // ============================== Sabitler ==============================
  var UNIT = 46;              // px per "world unit" (Unity taraflı tasarım birimiyle eşleşir)
  var CANVAS_W = 960, CANVAS_H = 600;
  var EDGE_MARGIN = 0.5 * UNIT;
  var BOUNDS = { minX: EDGE_MARGIN, maxX: CANVAS_W - EDGE_MARGIN, minY: EDGE_MARGIN, maxY: CANVAS_H - EDGE_MARGIN };

  var BONUS = {
    size: 0.3 * UNIT,
    speed: 6.5 * UNIT,
    visibleDur: 1.0,
    hiddenDur: 0.4,
    lifetime: 6.0,
    timeGrant: 3.0
  };
  var PULSE_SCALE_MIN = 0.5, PULSE_SCALE_MAX = 1.2;
  var TOTAL_RUN_TIME = 60;
  var SPEED_SCORE_BASE = 100;
  var OVERLAP_PADDING = 1.15, MAX_PLACEMENT_ATTEMPTS = 30;

  var COLORS = { correct: "#4ce07e", distractor: "#ff4757", bonus: "#ffc94d" };

  var SETTINGS_KEY = "reflexRange.settings";
  var LEADERBOARD_KEY = "reflexRange.leaderboard";
  var LEADERBOARD_MAX = 10;

  // ============================== Bölüm verisi ==============================
  // Unity tarafındaki LevelDatabaseGenerator.cs'teki zorluk eğrisinin portu (hedef başına
  // süre limiti artık yok — tek baskı 60 saniyelik toplam koşu süresi).
  function L(n, name, count, sizeMin, sizeMax, moves, moveSpeed, seq, showSeq, distractors, distractorCount, opts) {
    opts = opts || {};
    return {
      n: n, name: name, count: count, sizeMin: sizeMin, sizeMax: sizeMax,
      moves: moves, moveSpeed: moveSpeed, seq: seq, showSeq: showSeq,
      distractors: distractors, distractorCount: distractorCount,
      fog: !!opts.fog, fogRadius: opts.fogRadius || 2,
      strobe: !!opts.strobe, strobeLit: opts.strobeLit || 0.6, strobeDark: opts.strobeDark || 0.8,
      pulse: !!opts.pulse, pulseSpeed: opts.pulseSpeed || 0.7, pulseHitWindow: opts.pulseHitWindow || 0.35,
      bonus: opts.bonus !== false,
      twin: !!opts.twin,
      memory: !!opts.memory, memoryRevealDur: opts.memoryRevealDur || 1.2,
      camouflage: !!opts.camouflage,
      split: !!opts.split
    };
  }

  var LEVELS = [
    L(1, "First Contact", 1, 1.4, 1.4, false, 0, false, false, false, 0),
    L(2, "First Light", 1, 1.3, 1.3, false, 0, false, false, false, 0, { fog: true, fogRadius: 2.5 }),
    L(3, "Camouflage", 3, 1.15, 1.15, false, 0, false, false, true, 2, { camouflage: true }),

    L(4, "Twin Reflex", 2, 1.2, 1.2, false, 0, false, false, false, 0, { twin: true }),
    // Memory Flash: numaralar kısa süre görünüp kayboluyor — sadece pozisyonu değil,
    // vuruş SIRASINI da hafızadan hatırlaman gerekiyor (bkz. L() memory + seq birlikte).
    L(5, "Memory Flash", 3, 1.1, 1.1, false, 0, true, true, false, 0, { memory: true, memoryRevealDur: 1.5 }),
    L(6, "Pulse", 5, 1.0, 1.1, false, 0, false, false, false, 0, { pulse: true, pulseSpeed: 0.6, pulseHitWindow: 0.4 }),
    L(7, "Speed Trial", 6, 1.0, 1.1, false, 0, true, true, false, 0),

    L(8, "Motion Begins", 5, 1.0, 1.1, true, 1.5, true, true, true, 2),
    L(9, "Split Shot", 3, 0.95, 1.05, true, 1.6, false, false, true, 2, { split: true }),
    L(10, "Runners", 6, 0.95, 1.05, true, 1.8, true, true, true, 2),
    L(11, "Heavy Traffic", 7, 0.9, 1.0, true, 2.2, true, true, true, 12),
    // Twin'in geri dönüşü — ama artık hedefler hareketli ve çeldiriciler de var
    // (Twin Reflex durağandı, bkz. L4). seq YOK: ikiz/split spawn'lar seqNum=0 ile
    // doğuyor, seq kontrolüyle çakışıyor.
    L(12, "Final Warning", 4, 0.85, 0.95, true, 2.0, false, false, true, 4, { twin: true }),

    L(13, "Shrinking World", 5, 0.6, 0.7, true, 2.2, false, false, true, 4),
    L(14, "Fog Curtain", 5, 0.55, 0.65, true, 2.3, false, false, true, 4, { fog: true, fogRadius: 3.0 }),
    L(15, "Micro Targets", 6, 0.5, 0.6, true, 2.6, false, false, true, 4),
    // Pulse'un geri dönüşü — ama artık hedefler hareketli ve çeldiriciler de var
    // (Pulse durağandı, bkz. L6). Aynı anda hem nabız zamanlaması hem hareketi takip etmek gerekiyor.
    L(16, "Blackout", 6, 0.45, 0.55, true, 2.7, false, false, true, 5, { pulse: true, pulseSpeed: 0.6, pulseHitWindow: 0.4 }),

    L(17, "Strobe", 6, 0.45, 0.55, true, 3.0, false, false, true, 5, { strobe: true, strobeLit: 0.6, strobeDark: 0.6 }),
    L(18, "Chaos", 7, 0.4, 0.5, true, 3.2, true, true, true, 6),
    // Camouflage'ın geri dönüşü — ama artık hedefler hareketli ve hızlı
    // (Camouflage durağandı, bkz. L3). Hem görmesi hem yakalaması zor.
    L(19, "Breaking Point", 7, 0.4, 0.5, true, 3.4, false, false, true, 6, { camouflage: true }),
    // Split'in geri dönüşü, final yoğunluğunda — ama seq YOK (bkz. yukarıdaki not).
    L(20, "Endgame", 4, 0.35, 0.45, true, 3.8, false, false, true, 6, { split: true })
  ];

  // ============================== DOM ==============================
  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");

  // Sis modunun karartma maskesini hazırlamak için ayrı bir offscreen tuval (bkz. drawFogOverlay).
  var fogCanvas = document.createElement("canvas");
  fogCanvas.width = CANVAS_W;
  fogCanvas.height = CANVAS_H;
  var fogCtx = fogCanvas.getContext("2d");

  var screens = {
    menu: document.getElementById("screen-menu"),
    levelComplete: document.getElementById("screen-levelComplete"),
    gameOver: document.getElementById("screen-gameOver"),
    gameWon: document.getElementById("screen-gameWon"),
    settings: document.getElementById("screen-settings"),
    leaderboard: document.getElementById("screen-leaderboard")
  };
  var hudLevel = document.getElementById("hudLevel");
  var hudLevelBar = document.getElementById("hudLevelBar");
  var hudGlobal = document.getElementById("hudGlobal");
  var hudStreak = document.getElementById("hudStreak");
  var hudScore = document.getElementById("hudScore");

  var inputName = document.getElementById("inputName");
  var toggleShake = document.getElementById("toggleShake");
  var toggleReduceMotion = document.getElementById("toggleReduceMotion");
  var toggleMusic = document.getElementById("toggleMusic");
  var toggleSfx = document.getElementById("toggleSfx");
  var leaderboardList = document.getElementById("leaderboardList");
  var leaderboardEmpty = document.getElementById("leaderboardEmpty");

  // ============================== Ayarlar ==============================
  function loadSettings() {
    var defaults = { playerName: "", screenShake: true, reduceMotion: false, musicEnabled: true, sfxEnabled: true };
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return defaults;
      var parsed = JSON.parse(raw);
      return {
        playerName: typeof parsed.playerName === "string" ? parsed.playerName.slice(0, 16) : "",
        screenShake: parsed.screenShake !== false,
        reduceMotion: !!parsed.reduceMotion,
        musicEnabled: parsed.musicEnabled !== false,
        sfxEnabled: parsed.sfxEnabled !== false
      };
    } catch (e) { return defaults; }
  }

  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {}
  }

  function applySettingsToDom() {
    document.body.classList.toggle("reduce-motion", settings.reduceMotion);
    inputName.value = settings.playerName;
    toggleShake.checked = settings.screenShake;
    toggleReduceMotion.checked = settings.reduceMotion;
    toggleMusic.checked = settings.musicEnabled;
    toggleSfx.checked = settings.sfxEnabled;
  }

  var settings = loadSettings();

  // ============================== Ses ==============================
  // Dosyası olmayan sesler (henüz eklenmemiş SFX/oyun müziği) null kalır — playMusic/playSfx
  // bunları sessizce atlar, konsola hata düşmez.
  var SOUND_PATHS = {
    menuMusic: "audio/menu-music.mp3",
    gameMusic: "audio/game-music.mp3",
    hit: "audio/hit.mp3",
    miss: null,
    lose: null
  };
  var MUSIC_VOLUME = 0.4;
  var SFX_VOLUME = 0.6;
  var HIT_SFX_MAX_DURATION = 0.7; // saniye — vuruş sesi bu süreden sonra kesilir

  function createAudio(path, loop, volume) {
    if (!path) return null;
    var a = new Audio(path);
    a.loop = !!loop;
    a.volume = volume;
    return a;
  }

  var menuMusic = createAudio(SOUND_PATHS.menuMusic, true, MUSIC_VOLUME);
  var gameMusic = createAudio(SOUND_PATHS.gameMusic, true, MUSIC_VOLUME);
  var sfxHit = createAudio(SOUND_PATHS.hit, false, SFX_VOLUME);
  var sfxMiss = createAudio(SOUND_PATHS.miss, false, SFX_VOLUME);
  var sfxLose = createAudio(SOUND_PATHS.lose, false, SFX_VOLUME);

  function playMusic(track) {
    if (!track) return;
    track.play().catch(function () {});
  }

  function stopMusic(track) {
    if (!track) return;
    track.pause();
  }

  // Menü/oyun müziği aktif ekrana göre otomatik değişir (bkz. setScreen).
  // levelComplete/gameOver/gameWon da oyun akışının bir parçası sayılır — aksi halde
  // bölümler arası kısa geçiş ekranında menü müziği bir anlığına devreye giriyordu.
  var GAMEPLAY_SCREENS = { playing: true, levelComplete: true, gameOver: true, gameWon: true };
  function updateMusicForScreen() {
    var wantsGameMusic = !!GAMEPLAY_SCREENS[state.screen];
    var activeTrack = wantsGameMusic ? gameMusic : menuMusic;
    var inactiveTrack = wantsGameMusic ? menuMusic : gameMusic;
    stopMusic(inactiveTrack);
    if (settings.musicEnabled) playMusic(activeTrack);
    else stopMusic(activeTrack);
  }

  // Tarayıcılar kullanıcı etkileşimi olmadan sesli otomatik oynatmayı engeller —
  // ilk tıklamada müziği (varsa) başlatmayı deneriz.
  document.addEventListener("pointerdown", function unlockAudio() {
    document.removeEventListener("pointerdown", unlockAudio);
    updateMusicForScreen();
  }, { once: true });

  function playSfx(sound) {
    if (!sound || !settings.sfxEnabled) return;
    // Aynı ses üst üste hızlı tetiklenebildiği için her seferinde klonlayıp baştan çalıyoruz.
    var node = sound.cloneNode();
    node.volume = sound.volume;
    node.play().catch(function () {});
  }

  // Vuruş sesi: her doğru vuruşta aynı sesi en baştan başlatır (klonlamaz, üst üste
  // yığılmaz) ve en fazla HIT_SFX_MAX_DURATION saniye çalıp otomatik kesilir.
  var hitSfxStopTimer = null;
  function playHitSfx() {
    if (!sfxHit || !settings.sfxEnabled) return;
    if (hitSfxStopTimer) {
      clearTimeout(hitSfxStopTimer);
      hitSfxStopTimer = null;
    }
    sfxHit.pause();
    sfxHit.currentTime = 0;
    sfxHit.play().catch(function () {});
    hitSfxStopTimer = setTimeout(function () {
      sfxHit.pause();
      hitSfxStopTimer = null;
    }, HIT_SFX_MAX_DURATION * 1000);
  }

  // ============================== Skor tablosu ==============================
  // Sunucu tarafı yok — leaderboard sadece bu cihazda, localStorage üzerinde tutuluyor.
  // localStorage tarayıcı devtools'undan doğrudan düzenlenebilir; bu yüzden okurken
  // her kaydı katı biçimde doğruluyoruz (tip/aralık) — hem sahte/bozuk veriyi eleriz
  // hem de innerHTML'e sayısal olmayan bir alanın (XSS payload'u) sızmasını engelleriz.
  function isValidLeaderboardEntry(e) {
    return !!e && typeof e === "object" &&
      typeof e.name === "string" && e.name.length > 0 && e.name.length <= 16 &&
      Number.isFinite(e.score) && e.score >= 0 &&
      Number.isInteger(e.stage) && e.stage >= 1 && e.stage <= LEVELS.length &&
      Number.isFinite(e.streak) && e.streak >= 0;
  }

  function loadLeaderboard() {
    try {
      var raw = localStorage.getItem(LEADERBOARD_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(isValidLeaderboardEntry);
    } catch (e) { return []; }
  }

  function saveLeaderboard(list) {
    try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(list)); } catch (e) {}
  }

  function submitScore(score, stage, maxStreak) {
    var list = loadLeaderboard();
    var entry = { name: (settings.playerName || "ANONYMOUS").toUpperCase(), score: score, stage: stage, streak: maxStreak };
    list.push(entry);
    list.sort(function (a, b) { return b.score - a.score; });
    list = list.slice(0, LEADERBOARD_MAX);
    saveLeaderboard(list);
    return list.indexOf(entry) >= 0 ? entry : null;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function renderLeaderboard(highlightEntry) {
    var list = loadLeaderboard();
    leaderboardList.innerHTML = "";
    leaderboardEmpty.classList.toggle("show", list.length === 0);
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var li = document.createElement("li");
      if (highlightEntry && e === highlightEntry) li.className = "new-entry";
      li.innerHTML =
        '<span class="rank">' + (i + 1) + '</span>' +
        '<span class="name">' + escapeHtml(e.name) + '</span>' +
        '<span class="stage">stage ' + e.stage + '</span>' +
        '<span class="score">' + e.score + '</span>';
      leaderboardList.appendChild(li);
    }
  }

  // ============================== Oyun durumu ==============================
  var state = {
    screen: "menu",
    levelIndex: 0,
    targets: [],
    correctRemaining: 0,
    nextExpectedSeq: 1,
    levelActive: false,
    levelStartTime: 0,
    globalTimeRemaining: TOTAL_RUN_TIME,
    streak: 0,
    maxStreak: 0,
    score: 0,
    bonusCaughtThisLevel: false,
    mouseX: CANVAS_W / 2,
    mouseY: CANVAS_H / 2,
    hasPointer: false
  };

  var gameTime = 0;
  var idCounter = 1;
  var particles = [];
  var rings = [];
  var returnScreen = "menu";
  var lastLeaderboardEntry = null;

  // ============================== Yardımcılar ==============================
  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function currentLevel() { return LEVELS[state.levelIndex]; }

  function toCanvasCoords(evt) {
    var rect = canvas.getBoundingClientRect();
    var scaleX = CANVAS_W / rect.width;
    var scaleY = CANVAS_H / rect.height;
    return { x: (evt.clientX - rect.left) * scaleX, y: (evt.clientY - rect.top) * scaleY };
  }

  function isStrobeLitAt(t, level) {
    var cycle = level.strobeLit + level.strobeDark;
    if (cycle <= 0) return true;
    var phase = t % cycle;
    return phase < level.strobeLit;
  }

  function resolveInitialReveal(level) {
    if (level.fog) return false;
    if (level.strobe) return isStrobeLitAt(gameTime, level);
    return true;
  }


  // ============================== Hedef yönetimi ==============================
  function overlapsExisting(candidate, radius) {
    for (var i = 0; i < state.targets.length; i++) {
      var t = state.targets[i];
      if (!t.active) continue;
      var otherRadius = t.size / 2;
      var minDist = (radius + otherRadius) * OVERLAP_PADDING;
      var dx = candidate.x - t.x, dy = candidate.y - t.y;
      if (Math.sqrt(dx * dx + dy * dy) < minDist) return true;
    }
    return false;
  }

  function findNonOverlappingPosition(sizePx) {
    var radius = sizePx / 2;
    var candidate = { x: (BOUNDS.minX + BOUNDS.maxX) / 2, y: (BOUNDS.minY + BOUNDS.maxY) / 2 };
    for (var attempt = 0; attempt < MAX_PLACEMENT_ATTEMPTS; attempt++) {
      var x = rand(BOUNDS.minX + radius, BOUNDS.maxX - radius);
      var y = rand(BOUNDS.minY + radius, BOUNDS.maxY - radius);
      candidate = { x: x, y: y };
      if (!overlapsExisting(candidate, radius)) return candidate;
    }
    return candidate;
  }

  function spawnSingle(type, seqNum, level, opts) {
    opts = opts || {};
    var isBonus = type === "bonus";
    var isCorrect = type === "correct";
    var sizeUnits = isBonus ? BONUS.size / UNIT : rand(level.sizeMin, level.sizeMax);
    var sizePx = (isBonus ? BONUS.size : sizeUnits * UNIT) * (opts.sizeScale || 1);
    var r = sizePx / 2;
    var pos;
    if (opts.forcePos) {
      pos = {
        x: clamp(opts.forcePos.x, BOUNDS.minX + r, BOUNDS.maxX - r),
        y: clamp(opts.forcePos.y, BOUNDS.minY + r, BOUNDS.maxY - r)
      };
    } else {
      pos = findNonOverlappingPosition(sizePx);
    }
    var moves = isBonus || level.moves;
    var speedPx = isBonus ? BONUS.speed : level.moveSpeed * UNIT;
    var ang = Math.random() * Math.PI * 2;
    // Sadece bonus hedefin kendi ömrü (lifetime) var; doğru/sahte hedefler artık süresiz —
    // tek baskı 60 saniyelik toplam koşu süresi (bkz. tickGlobalTimer).
    var timeLimit = isBonus ? BONUS.lifetime : 0;

    var t = {
      id: idCounter++, type: type, seqNum: seqNum, isTwin: !!opts.isTwin, isSplitChild: !!opts.isSplitChild,
      x: pos.x, y: pos.y, size: sizePx, baseSize: sizePx,
      color: isCorrect ? COLORS.correct : (isBonus ? COLORS.bonus : COLORS.distractor),
      moves: moves, speed: speedPx,
      dx: moves ? Math.cos(ang) : 0, dy: moves ? Math.sin(ang) : 0,
      hasTimeLimit: timeLimit > 0, remaining: timeLimit,
      showSeq: isCorrect && level.seq && level.showSeq,
      pulses: !isBonus && level.pulse, pulseSpeed: level.pulseSpeed, pulsePhase: Math.random(), pulseHitWindow: level.pulseHitWindow,
      clickableByPulse: true,
      blinks: isBonus, blinkVisibleDur: BONUS.visibleDur, blinkHiddenDur: BONUS.hiddenDur, blinkTimer: 0, blinkVisible: true,
      revealed: isBonus ? true : resolveInitialReveal(level),
      active: true
    };
    state.targets.push(t);
    return t;
  }

  function removeTarget(t) {
    var idx = state.targets.indexOf(t);
    if (idx >= 0) state.targets.splice(idx, 1);
  }

  function clearTargets() { state.targets.length = 0; }

  function spawnBonusIfNeeded() {
    if (!state.levelActive || state.bonusCaughtThisLevel) return;
    var level = currentLevel();
    if (level.bonus) spawnSingle("bonus", 0, level);
  }

  // ============================== Bölüm akışı ==============================
  function spawnLevel(idx) {
    var level = LEVELS[idx];
    clearTargets();
    state.levelActive = true;
    state.correctRemaining = level.count;
    state.nextExpectedSeq = 1;
    state.bonusCaughtThisLevel = false;
    state.levelStartTime = gameTime;

    for (var i = 0; i < level.count; i++) spawnSingle("correct", i + 1, level);
    var dcount = level.distractors ? level.distractorCount : 0;
    for (var j = 0; j < dcount; j++) spawnSingle("distractor", 0, level);
    if (level.bonus) spawnSingle("bonus", 0, level);

    updateLevelHud();
  }

  function startGame() {
    state.levelIndex = 0;
    state.streak = 0;
    state.maxStreak = 0;
    state.score = 0;
    state.globalTimeRemaining = TOTAL_RUN_TIME;
    updateGlobalTimerDisplay();
    updateScoreDisplay();
    setScreen("playing");
    spawnLevel(state.levelIndex);
  }

  function proceedToNextLevel() {
    state.levelIndex++;
    setScreen("playing");
    spawnLevel(state.levelIndex);
  }

  function completeLevel() {
    state.levelActive = false;
    clearTargets();

    // Bölümü ne kadar hızlı bitirirsen o kadar hız bonusu — ve bu bonus mevcut
    // streak ile çarpılıyor, yani streak yükseldikçe her bölüm bitişi daha değerli olur.
    // Bonus PUANA (state.score) eklenir, streak'in kendisine değil — streak sadece
    // yeşil/sarı/miss kurallarıyla değişen ayrı bir sayaç (bkz. handleHit, registerMistake).
    var elapsed = gameTime - state.levelStartTime;
    var speedBonus = Math.round(SPEED_SCORE_BASE / Math.max(elapsed, 0.01)) * state.streak;
    state.score += speedBonus;
    updateScoreDisplay();

    if (state.levelIndex >= LEVELS.length - 1) {
      document.getElementById("gwScore").textContent = state.score;
      document.getElementById("gwStreak").textContent = state.maxStreak;
      lastLeaderboardEntry = submitScore(state.score, currentLevel().n, state.maxStreak);
      setScreen("gameWon");
    } else {
      document.getElementById("lcSub").textContent = "Stage " + LEVELS[state.levelIndex + 1].n + " — " + LEVELS[state.levelIndex + 1].name;
      setScreen("levelComplete");
      setTimeout(function () {
        if (state.screen === "levelComplete") proceedToNextLevel();
      }, 900);
    }
  }

  function registerMistake(reason) {
    state.levelActive = false;
    clearTargets();
    triggerShake();
    playSfx(sfxLose);
    // Bir hata sadece streak'i sıfırlar — o ana kadar biriktirdiğin puan (state.score) kalır.
    state.streak = 0;
    updateScoreDisplay();
    document.getElementById("goReason").textContent = reason;
    document.getElementById("goLevel").textContent = currentLevel().n;
    document.getElementById("goScore").textContent = state.score;
    document.getElementById("goMaxStreak").textContent = state.maxStreak;
    lastLeaderboardEntry = submitScore(state.score, currentLevel().n, state.maxStreak);
    setScreen("gameOver");
  }

  function failLevel(reason) { registerMistake(reason); }

  // ============================== Vuruş / süresi dolma ==============================
  function isClickable(t) {
    if (t.type === "bonus") return t.blinkVisible;
    if (t.pulses) return t.clickableByPulse;
    // Strobe'da karanlık faz sadece görünürlüğü etkiler — o an körlemesine yapılan
    // tıklamalar da hedefin gerçek konumuna göre isabet sayılır.
    if (currentLevel().strobe) return true;
    return t.revealed;
  }

  function grantBonusTime(seconds) {
    state.globalTimeRemaining += seconds;
    updateGlobalTimerDisplay();
  }

  function handleHit(t) {
    t.active = false;
    removeTarget(t);

    if (t.type === "bonus") {
      // Bölüm başına sadece bir kez yakalanabilir — bir daha bu bölümde yeniden doğmaz.
      state.bonusCaughtThisLevel = true;
      grantBonusTime(BONUS.timeGrant);
      // Sarıya tıklamak mevcut streak'i 10 katına çıkarır (puana dokunmaz, bkz. completeLevel).
      state.streak *= 10;
      state.maxStreak = Math.max(state.maxStreak, state.streak);
      updateScoreDisplay();
      playHitSfx();
      spawnHitParticles(t.x, t.y, COLORS.bonus, true);
      spawnShockwave(t.x, t.y, COLORS.bonus, 80, 0.5);
      return;
    }

    if (t.type === "distractor") { playSfx(sfxMiss); failLevel("Wrong target hit."); return; }

    var level = currentLevel();
    if (level.seq && t.seqNum !== state.nextExpectedSeq) {
      playSfx(sfxMiss);
      failLevel("Wrong order: expected " + state.nextExpectedSeq + ".");
      return;
    }

    state.nextExpectedSeq++;
    state.correctRemaining--;
    // Her doğru hedef streak'i 1 artırır (puana dokunmaz, bkz. completeLevel).
    state.streak += 1;
    state.maxStreak = Math.max(state.maxStreak, state.streak);
    updateScoreDisplay();
    playHitSfx();
    spawnHitParticles(t.x, t.y, COLORS.correct, false);

    // İkiz hedef: bu bölümde açıksa ve vurulan asıl hedefse (ikizin ikizi olmasın diye),
    // ekranın simetrik noktasında anında bir tane daha belirir; bölüm tamamlanmadan önce
    // o da vurulmalı.
    if (level.twin && !t.isTwin) {
      state.correctRemaining++;
      spawnSingle("correct", 0, level, {
        forcePos: { x: CANVAS_W - t.x, y: CANVAS_H - t.y },
        isTwin: true
      });
    }

    // Split: ana hedefi vurunca ikiye bölünüyor, iki parça da (küçük boyda) vurulmalı.
    // Parçalar tekrar bölünmüyor (isSplitChild koruması).
    if (level.split && !t.isSplitChild) {
      state.correctRemaining += 2;
      var splitAngle = Math.random() * Math.PI * 2;
      var splitOffset = 0.9 * UNIT;
      spawnSingle("correct", 0, level, {
        forcePos: { x: t.x + Math.cos(splitAngle) * splitOffset, y: t.y + Math.sin(splitAngle) * splitOffset },
        isSplitChild: true, sizeScale: 0.6
      });
      spawnSingle("correct", 0, level, {
        forcePos: { x: t.x - Math.cos(splitAngle) * splitOffset, y: t.y - Math.sin(splitAngle) * splitOffset },
        isSplitChild: true, sizeScale: 0.6
      });
    }

    if (state.correctRemaining <= 0) completeLevel();
  }

  function handleExpired(t) {
    t.active = false;
    removeTarget(t);
    if (t.type === "bonus") { spawnBonusIfNeeded(); return; }
    if (t.type === "correct") { failLevel("Time's up."); }
  }

  // ============================== Güncelleme ==============================
  function moveTarget(t, dt) {
    var r = t.size / 2;
    var nx = t.x + t.dx * t.speed * dt;
    var ny = t.y + t.dy * t.speed * dt;
    if (nx < BOUNDS.minX + r || nx > BOUNDS.maxX - r) t.dx = -t.dx;
    if (ny < BOUNDS.minY + r || ny > BOUNDS.maxY - r) t.dy = -t.dy;
    nx = clamp(t.x + t.dx * t.speed * dt, BOUNDS.minX + r, BOUNDS.maxX - r);
    ny = clamp(t.y + t.dy * t.speed * dt, BOUNDS.minY + r, BOUNDS.maxY - r);
    t.x = nx; t.y = ny;
  }

  function pulseTarget(t, dt) {
    t.pulsePhase += dt * t.pulseSpeed;
    var osc = (Math.sin(t.pulsePhase * Math.PI * 2) + 1) * 0.5;
    var scale = lerp(PULSE_SCALE_MIN, PULSE_SCALE_MAX, osc);
    t.size = t.baseSize * scale;
    t.clickableByPulse = osc >= 1 - t.pulseHitWindow;
  }

  function blinkTarget(t, dt) {
    t.blinkTimer += dt;
    var phaseDur = t.blinkVisible ? t.blinkVisibleDur : t.blinkHiddenDur;
    if (t.blinkTimer < phaseDur) return;
    t.blinkTimer = 0;
    t.blinkVisible = !t.blinkVisible;
    if (t.blinkVisible) {
      var r = t.size / 2;
      t.x = rand(BOUNDS.minX + r, BOUNDS.maxX - r);
      t.y = rand(BOUNDS.minY + r, BOUNDS.maxY - r);
    }
  }

  function updateFogStrobeReveal() {
    var level = currentLevel();
    if (level.fog) {
      if (!state.hasPointer) return;
      var r2 = Math.pow(level.fogRadius * UNIT, 2);
      for (var i = 0; i < state.targets.length; i++) {
        var t = state.targets[i];
        if (t.type === "bonus") continue;
        var dx = t.x - state.mouseX, dy = t.y - state.mouseY;
        t.revealed = (dx * dx + dy * dy) <= r2;
      }
    } else if (level.strobe) {
      var lit = isStrobeLitAt(gameTime, level);
      for (var j = 0; j < state.targets.length; j++) {
        if (state.targets[j].type === "bonus") continue;
        state.targets[j].revealed = lit;
      }
    }
  }

  function updateTargets(dt) {
    var expired = [];
    for (var i = 0; i < state.targets.length; i++) {
      var t = state.targets[i];
      if (!t.active) continue;
      if (t.moves) moveTarget(t, dt);
      if (t.pulses) pulseTarget(t, dt);
      if (t.blinks) blinkTarget(t, dt);
      if (t.hasTimeLimit) {
        t.remaining -= dt;
        if (t.remaining <= 0) expired.push(t);
      }
    }
    for (var k = 0; k < expired.length; k++) handleExpired(expired[k]);
  }

  function tickGlobalTimer(dt) {
    state.globalTimeRemaining = Math.max(0, state.globalTimeRemaining - dt);
    updateGlobalTimerDisplay();
    if (state.globalTimeRemaining <= 0) registerMistake("Total time's up.");
  }

  // ============================== Parçacıklar & shake ==============================
  function spawnHitParticles(x, y, color, big) {
    var count = big ? 28 : 10;
    var speedBase = big ? 160 : 80;
    var speedVar = big ? 200 : 120;
    var radius = big ? 4 : 2.6;
    var life = big ? 0.55 : 0.42;
    for (var i = 0; i < count; i++) {
      var ang = Math.random() * Math.PI * 2;
      var spd = speedBase + Math.random() * speedVar;
      particles.push({ x: x, y: y, dx: Math.cos(ang) * spd, dy: Math.sin(ang) * spd, life: life, maxLife: life, color: color, radius: radius });
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.dx * dt; p.y += p.dy * dt; p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  // Bonus vuruşunda genişleyip sönen bir şok dalgası halkası — parçacıklara ek görsel vurgu.
  function spawnShockwave(x, y, color, maxRadius, duration) {
    rings.push({ x: x, y: y, life: duration, maxLife: duration, color: color, maxRadius: maxRadius });
  }

  function updateRings(dt) {
    for (var i = rings.length - 1; i >= 0; i--) {
      rings[i].life -= dt;
      if (rings[i].life <= 0) rings.splice(i, 1);
    }
  }

  var shakeTimeout = null;
  function triggerShake() {
    if (!settings.screenShake) return;
    canvas.classList.remove("shake");
    void canvas.offsetWidth;
    canvas.classList.add("shake");
    if (shakeTimeout) clearTimeout(shakeTimeout);
    shakeTimeout = setTimeout(function () { canvas.classList.remove("shake"); }, 400);
  }

  // ============================== Render ==============================
  function drawBackground() {
    ctx.fillStyle = "#05070a";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.strokeStyle = "rgba(148,173,186,0.05)";
    ctx.lineWidth = 1;
    var step = UNIT;
    for (var x = 0; x <= CANVAS_W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, CANVAS_H); ctx.stroke(); }
    for (var y = 0; y <= CANVAS_H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke(); }
  }

  function drawTarget(t, level) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(t.x, t.y, Math.max(2, t.size / 2), 0, Math.PI * 2);
    if (level && level.camouflage && t.type !== "bonus") {
      // Kamuflaj: arka plana çok yakın, hafif ton farklı (yeşilimsi/kırmızımsı) ve
      // hafif titreyen (shimmer) renkler — parlama (glow) yok, aksi halde kolayca ele verirdi.
      var shimmer = 0.4 + 0.15 * Math.sin(gameTime * 3 + t.id);
      ctx.globalAlpha = shimmer;
      ctx.fillStyle = t.type === "correct" ? "#17241b" : "#242417";
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = t.type === "bonus" ? 22 : 10;
    }
    ctx.fill();
    ctx.restore();

    if (t.showSeq) {
      ctx.fillStyle = "#05070a";
      ctx.font = "700 " + Math.max(13, t.size * 0.42) + "px 'JetBrains Mono', monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(t.seqNum), t.x, t.y + 1);
    }
  }

  function drawParticles() {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawRings() {
    for (var i = 0; i < rings.length; i++) {
      var r = rings[i];
      var t = 1 - Math.max(0, r.life) / r.maxLife;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = r.color;
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 20;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.maxRadius * t, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function drawFogOverlay(level) {
    var outerR = level.fogRadius * UNIT;
    // Görünürlük dairesi artık tıklanabilir dairenin (outerR) neredeyse tamamını kaplıyor —
    // eskiden 0.35'lik bir iç yarıçapla, dış %65'lik kısım tıklanabilir olduğu halde
    // pratikte hiç görünmüyordu.
    var innerR = outerR * 0.75;

    // Boş alanı da hafifçe aydınlatan sıcak bir ışık havuzu — ana sahneye (hedeflerin de
    // bulunduğu tuvale) doğrudan ekleniyor, karartma maskesinden ÖNCE.
    ctx.save();
    var glow = ctx.createRadialGradient(state.mouseX, state.mouseY, 0, state.mouseX, state.mouseY, outerR);
    glow.addColorStop(0, "rgba(255, 238, 190, 0.22)");
    glow.addColorStop(0.7, "rgba(255, 238, 190, 0.08)");
    glow.addColorStop(1, "rgba(255, 238, 190, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(state.mouseX, state.mouseY, outerR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ÖNEMLİ: karartma maskesi AYRI bir offscreen tuvalde (fogCanvas) kuruluyor.
    // Ana tuval üzerinde doğrudan "opak siyah doldur + destination-out ile delik aç" yapmak,
    // altındaki hedefin/sahnenin piksellerini de siliyordu (canvas'ta katman yok, tek tampon) —
    // delik "hiçliği" ortaya çıkarıyordu, hedefi değil. Maske ayrı tuvalde hazırlanıp ana
    // sahnenin üstüne normal (source-over) şekilde bindirilince sahne bozulmadan kalıyor.
    fogCtx.clearRect(0, 0, CANVAS_W, CANVAS_H);
    fogCtx.fillStyle = "rgba(2,4,7,1)";
    fogCtx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    var grad = fogCtx.createRadialGradient(state.mouseX, state.mouseY, innerR, state.mouseX, state.mouseY, outerR);
    grad.addColorStop(0, "rgba(0,0,0,1)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    fogCtx.globalCompositeOperation = "destination-out";
    fogCtx.fillStyle = grad;
    fogCtx.beginPath();
    fogCtx.arc(state.mouseX, state.mouseY, outerR, 0, Math.PI * 2);
    fogCtx.fill();
    fogCtx.globalCompositeOperation = "source-over";

    ctx.drawImage(fogCanvas, 0, 0);
  }

  function drawFullDark() {
    ctx.fillStyle = "rgba(2,4,7,1)";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }


  function render() {
    drawBackground();

    var level = state.screen === "playing" ? currentLevel() : null;

    for (var i = 0; i < state.targets.length; i++) {
      var t = state.targets[i];
      if (t.type === "bonus" && !t.blinkVisible) continue;
      drawTarget(t, level);
    }

    drawRings();
    drawParticles();

    if (level) {
      if (level.fog) drawFogOverlay(level);
      else if (level.strobe && !isStrobeLitAt(gameTime, level)) drawFullDark();
      else if (level.memory && (gameTime - state.levelStartTime) >= level.memoryRevealDur) drawFullDark();
    }
  }

  // ============================== HUD ==============================
  function updateLevelHud() {
    hudLevel.textContent = currentLevel().n + " / " + LEVELS.length;
    hudLevelBar.style.width = Math.round((currentLevel().n / LEVELS.length) * 100) + "%";
  }

  function updateGlobalTimerDisplay() {
    var total = Math.max(0, Math.ceil(state.globalTimeRemaining));
    var m = Math.floor(total / 60), s = total % 60;
    hudGlobal.textContent = m + ":" + (s < 10 ? "0" : "") + s;
  }

  function updateScoreDisplay() {
    hudStreak.textContent = state.streak;
    hudScore.textContent = state.score;
  }

  // ============================== Ekran yönetimi ==============================
  function setScreen(name) {
    state.screen = name;
    screens.menu.classList.toggle("show", name === "menu");
    screens.levelComplete.classList.toggle("show", name === "levelComplete");
    screens.gameOver.classList.toggle("show", name === "gameOver");
    screens.gameWon.classList.toggle("show", name === "gameWon");
    screens.settings.classList.toggle("show", name === "settings");
    screens.leaderboard.classList.toggle("show", name === "leaderboard");
    updateMusicForScreen();
  }

  function openSettings(from) {
    returnScreen = from;
    setScreen("settings");
  }

  function openLeaderboard(from) {
    returnScreen = from;
    var highlight = (from === "gameOver" || from === "gameWon") ? lastLeaderboardEntry : null;
    renderLeaderboard(highlight);
    setScreen("leaderboard");
  }

  // ============================== Girdi ==============================
  function onPointerMove(evt) {
    var p = toCanvasCoords(evt);
    state.mouseX = p.x; state.mouseY = p.y; state.hasPointer = true;
  }

  function onPointerDown(evt) {
    if (state.screen !== "playing") return;
    var p = toCanvasCoords(evt);
    // Bir önceki pointermove hiç tetiklenmemiş olabilir (ör. dokunmatik cihazda hover yoktur,
    // ya da oyuncu mouse'u hiç oynatmadan direkt tıkladı) — bu yüzden tıklama anında da konumu
    // güncelleyip sis/flaş görünürlüğünü senkron olarak yeniden hesaplıyoruz. Aksi halde hedef
    // görsel olarak orada olsa bile "tıklanabilir" işaretlenmemiş kalabiliyordu.
    state.mouseX = p.x; state.mouseY = p.y; state.hasPointer = true;
    updateFogStrobeReveal();
    for (var i = state.targets.length - 1; i >= 0; i--) {
      var t = state.targets[i];
      if (!t.active || !isClickable(t)) continue;
      var r = t.size / 2;
      var dx = p.x - t.x, dy = p.y - t.y;
      if (dx * dx + dy * dy <= r * r) { handleHit(t); return; }
    }
    // Hiçbir hedefe isabet etmedi — oyun bitmez, sadece streak sıfırlanır
    // (bölüm tamamlama bonusu bir sonraki bölümde daha düşük çıkar).
    playSfx(sfxMiss);
    state.streak = 0;
    updateScoreDisplay();
  }

  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerdown", onPointerDown);

  document.getElementById("btnPlay").addEventListener("click", startGame);
  document.getElementById("btnRetry").addEventListener("click", startGame);
  document.getElementById("btnPlayAgain").addEventListener("click", startGame);

  document.getElementById("btnSettings").addEventListener("click", function () { openSettings("menu"); });
  document.getElementById("btnLeaderboard").addEventListener("click", function () { openLeaderboard("menu"); });
  document.getElementById("btnGoLeaderboard").addEventListener("click", function () { openLeaderboard("gameOver"); });
  document.getElementById("btnGwLeaderboard").addEventListener("click", function () { openLeaderboard("gameWon"); });
  document.getElementById("btnSettingsBack").addEventListener("click", function () { setScreen(returnScreen); });
  document.getElementById("btnLeaderboardBack").addEventListener("click", function () { setScreen(returnScreen); });

  inputName.addEventListener("input", function () {
    settings.playerName = inputName.value.slice(0, 16);
    saveSettings();
  });
  toggleShake.addEventListener("change", function () {
    settings.screenShake = toggleShake.checked;
    saveSettings();
  });
  toggleReduceMotion.addEventListener("change", function () {
    settings.reduceMotion = toggleReduceMotion.checked;
    applySettingsToDom();
    saveSettings();
  });
  toggleMusic.addEventListener("change", function () {
    settings.musicEnabled = toggleMusic.checked;
    saveSettings();
    updateMusicForScreen();
  });
  toggleSfx.addEventListener("change", function () {
    settings.sfxEnabled = toggleSfx.checked;
    saveSettings();
  });
  document.getElementById("btnClearLeaderboard").addEventListener("click", function () {
    if (confirm("Clear all leaderboard entries?")) {
      saveLeaderboard([]);
      renderLeaderboard(null);
    }
  });

  // ============================== Ana döngü ==============================
  var lastTs = null;
  function frame(ts) {
    if (lastTs === null) lastTs = ts;
    var dt = Math.min((ts - lastTs) / 1000, 0.05);
    lastTs = ts;
    gameTime += dt;

    if (state.screen === "playing") {
      tickGlobalTimer(dt);
      updateFogStrobeReveal();
      updateTargets(dt);
    }
    updateParticles(dt);
    updateRings(dt);

    render();
    requestAnimationFrame(frame);
  }

  applySettingsToDom();
  updateGlobalTimerDisplay();
  updateScoreDisplay();
  requestAnimationFrame(frame);
})();
