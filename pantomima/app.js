(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // Δεδομένα & σταθερές
  // ---------------------------------------------------------------------------
  const DATA = window.PANTOMIMA_DATA;
  const CATS = DATA.categories;
  const CAT_BY_ID = Object.fromEntries(CATS.map((c) => [c.id, c]));

  const LS_SAVES = 'pantomima.saves.v1';
  const LS_PREFS = 'pantomima.prefs.v1';

  const MIN_TEAMS = 2;
  const MAX_TEAMS = 8;
  const TIME_OPTIONS = [30, 45, 60, 90, 120, 180];
  const COLORS = [
    '#e11d48', '#2563eb', '#16a34a', '#f59e0b', '#7c3aed', '#0891b2',
    '#db2777', '#ea580c', '#4f46e5', '#65a30d', '#0f766e', '#9333ea',
    '#facc15', '#38bdf8', '#a16207', '#475569',
  ];
  const DEFAULT_NAMES = [
    'Οι Κεραυνοί', 'Οι Πειρατές', 'Οι Μάγοι', 'Οι Νίντζα',
    'Οι Αστροναύτες', 'Οι Θρύλοι', 'Οι Τίγρεις', 'Οι Αετοί',
  ];

  // ---------------------------------------------------------------------------
  // Βοηθητικά
  // ---------------------------------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const rand = (n) => Math.floor(Math.random() * n);

  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }
  function load(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }

  // Ανοιχτό ή σκούρο κείμενο ανάλογα με το χρώμα φόντου
  function inkFor(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.62 ? '#1f1a3d' : '#ffffff';
  }

  function fmtDate(ts) {
    const d = new Date(ts);
    return d.toLocaleDateString('el-GR', { day: 'numeric', month: 'short', year: 'numeric' }) + ', ' +
      d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' });
  }

  function plural(n, one, many) { return n === 1 ? `${n} ${one}` : `${n} ${many}`; }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  // ---------------------------------------------------------------------------
  // Ήχος & δόνηση
  // ---------------------------------------------------------------------------
  let prefs = Object.assign({ sound: true, lastSetup: null }, load(LS_PREFS, {}));
  let audioCtx = null;

  function audio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, dur = 0.12, type = 'sine', vol = 0.2, when = 0) {
    if (!prefs.sound) return;
    const ctx = audio();
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const sfx = {
    tick: () => tone(880, 0.08, 'square', 0.08),
    correct: () => { tone(660, 0.12, 'triangle', 0.25); tone(990, 0.18, 'triangle', 0.25, 0.1); tone(1320, 0.25, 'triangle', 0.2, 0.2); },
    skip: () => { tone(500, 0.1, 'sine', 0.15); tone(350, 0.15, 'sine', 0.15, 0.08); },
    buzzer: () => { tone(160, 0.6, 'sawtooth', 0.25); tone(120, 0.6, 'sawtooth', 0.2, 0.05); },
    start: () => { tone(523, 0.1, 'triangle', 0.2); tone(784, 0.15, 'triangle', 0.2, 0.1); },
    fanfare: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, i * 0.14)),
  };

  function vibrate(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* τίποτα */ } }

  // Η οθόνη να μη σβήνει όσο παίζουμε
  let wakeLock = null;
  async function keepAwake(on) {
    try {
      if (on && !wakeLock && 'wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { /* δεν υποστηρίζεται */ }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && game && !game.finished) keepAwake(true);
  });

  // ---------------------------------------------------------------------------
  // Οθόνες
  // ---------------------------------------------------------------------------
  const TEAM_SCREENS = new Set(['turn', 'play', 'result']);
  let currentScreen = 'home';

  function show(name) {
    currentScreen = name;
    $$('.screen').forEach((s) => { s.hidden = s.dataset.screen !== name; });
    document.body.classList.toggle('in-team', TEAM_SCREENS.has(name));
    if (!TEAM_SCREENS.has(name)) setThemeColor('#1b1640');
    window.scrollTo(0, 0);
  }

  function setThemeColor(c) {
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', c);
  }

  function applyTeamColors(team) {
    const root = document.documentElement.style;
    root.setProperty('--team', team.color);
    root.setProperty('--team-ink', inkFor(team.color));
    setThemeColor(team.color);
  }

  // ---------------------------------------------------------------------------
  // Διάλογοι
  // ---------------------------------------------------------------------------
  function dialog({ title, text = '', input = null, buttons }) {
    return new Promise((resolve) => {
      const modal = $('#dialog');
      const form = $('#dialog-form');
      const inp = $('#dialog-input');
      $('#dialog-title').textContent = title;
      $('#dialog-text').textContent = text;
      $('#dialog-text').hidden = !text;
      inp.hidden = input === null;
      if (input !== null) inp.value = input;

      const actions = form.querySelector('.dialog-actions');
      actions.innerHTML = '';
      actions.style.flexDirection = buttons.length > 2 ? 'column' : 'row';
      const finish = (val) => {
        modal.hidden = true;
        form.onsubmit = null;
        resolve(val);
      };
      buttons.forEach((b, i) => {
        const el = document.createElement('button');
        el.type = b.submit ? 'submit' : 'button';
        el.className = 'btn ' + (b.cls || 'btn-ghost-dark');
        el.textContent = b.label;
        if (!b.submit) el.onclick = () => finish(b.value === 'input' ? inp.value.trim() : b.value);
        actions.appendChild(el);
      });
      form.onsubmit = (e) => {
        e.preventDefault();
        const sub = buttons.find((b) => b.submit);
        finish(sub ? (sub.value === 'input' ? inp.value.trim() : sub.value) : null);
      };
      modal.hidden = false;
      if (input !== null) setTimeout(() => { inp.focus(); inp.select(); }, 50);
    });
  }

  const confirmDialog = (title, text, okLabel = 'Ναι', cls = 'btn-primary') =>
    dialog({ title, text, buttons: [{ label: 'Άκυρο', value: false }, { label: okLabel, value: true, cls, submit: true }] });

  // ---------------------------------------------------------------------------
  // Ρύθμιση νέου παιχνιδιού
  // ---------------------------------------------------------------------------
  let setup = null;

  function defaultSetup() {
    const last = prefs.lastSetup;
    const base = {
      teams: [
        { name: '', color: COLORS[0] },
        { name: '', color: COLORS[1] },
      ],
      time: 60,
      rounds: 5,
      skips: 3,
      unlimited: false,
      cats: CATS.map((c) => c.id),
    };
    if (!last) return base;
    const s = Object.assign(base, clone(last));
    s.cats = s.cats.filter((id) => CAT_BY_ID[id]);
    if (!s.cats.length) s.cats = CATS.map((c) => c.id);
    return s;
  }

  function teamDisplayName(t, i) { return (t.name || '').trim() || DEFAULT_NAMES[i % DEFAULT_NAMES.length]; }

  function renderTeamsEditor() {
    $('#team-count').textContent = setup.teams.length;
    const box = $('#teams-editor');
    box.innerHTML = setup.teams.map((t, i) => {
      const taken = new Set(setup.teams.filter((_, j) => j !== i).map((x) => x.color.toLowerCase()));
      const isCustom = !COLORS.includes(t.color.toLowerCase());
      return `
        <div class="card team-edit" style="--c:${t.color}">
          <div class="row">
            <span class="dot" style="--c:${t.color}"></span>
            <input type="text" maxlength="30" data-team-name="${i}" value="${esc(t.name)}"
              placeholder="${esc(DEFAULT_NAMES[i % DEFAULT_NAMES.length])}" aria-label="Όνομα ομάδας ${i + 1}">
          </div>
          <div class="swatches" role="radiogroup" aria-label="Χρώμα φόντου ομάδας ${i + 1}">
            ${COLORS.map((c) => `<button class="swatch ${c === t.color.toLowerCase() ? 'active' : ''} ${taken.has(c) ? 'taken' : ''}"
                style="--c:${c}" data-action="pick-color" data-team="${i}" data-color="${c}" aria-label="Χρώμα ${c}"></button>`).join('')}
            <label class="swatch-custom ${isCustom ? 'active' : ''}" title="Άλλο χρώμα" style="${isCustom ? `background:${t.color}` : ''}">🎨
              <input type="color" data-team-color="${i}" value="${t.color}">
            </label>
          </div>
        </div>`;
    }).join('');
  }

  function changeTeamCount(delta) {
    const n = clamp(setup.teams.length + delta, MIN_TEAMS, MAX_TEAMS);
    if (n === setup.teams.length) return;
    if (n > setup.teams.length) {
      const used = new Set(setup.teams.map((t) => t.color.toLowerCase()));
      const color = COLORS.find((c) => !used.has(c)) || COLORS[rand(COLORS.length)];
      setup.teams.push({ name: '', color });
    } else {
      setup.teams.pop();
    }
    renderTeamsEditor();
  }

  function renderSettings() {
    // Χρόνος
    $('#time-chips').innerHTML = TIME_OPTIONS.map((s) =>
      `<button class="chip ${setup.time === s ? 'active' : ''}" data-action="pick-time" data-time="${s}">${s < 60 ? s + '″' : Math.floor(s / 60) + '′' + (s % 60 ? (s % 60) + '″' : '')}</button>`
    ).join('');
    $('#time-custom').value = TIME_OPTIONS.includes(setup.time) ? '' : setup.time;

    $('#rounds').textContent = setup.rounds;
    $('#skips').textContent = setup.unlimited ? '∞' : setup.skips;
    $('#skips-unlimited').checked = setup.unlimited;
    $('#skips').parentElement.classList.toggle('disabled', setup.unlimited);

    renderCats();
  }

  function renderCats() {
    const on = new Set(setup.cats);
    $('#cats').innerHTML = CATS.map((c) => `
      <label class="cat ${on.has(c.id) ? 'on' : ''}">
        <input type="checkbox" data-cat="${c.id}" ${on.has(c.id) ? 'checked' : ''}>
        <span class="ico">${c.icon}</span>
        <span>${esc(c.name)}<small>${c.items.length.toLocaleString('el-GR')}${c.note ? ' · ' + esc(c.note) : ''}</small></span>
      </label>`).join('');
    const total = CATS.filter((c) => on.has(c.id)).reduce((n, c) => n + c.items.length, 0);
    $('#cats-total').textContent = on.size
      ? `${plural(on.size, 'κατηγορία', 'κατηγορίες')} · ${total.toLocaleString('el-GR')} ερωτήσεις`
      : 'Διάλεξε τουλάχιστον μία κατηγορία.';
  }

  // ---------------------------------------------------------------------------
  // Παιχνίδι
  // ---------------------------------------------------------------------------
  let game = null;   // η τρέχουσα κατάσταση (αποθηκεύεται)
  let turn = null;   // ο τρέχων γύρος μιας ομάδας (δεν αποθηκεύεται)
  let timerId = null;

  function newGameFromSetup(s) {
    return {
      id: uid(),
      saveName: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      teams: s.teams.map((t, i) => ({
        name: teamDisplayName(t, i), color: t.color, score: 0, skipsUsed: 0, correct: 0, missed: 0,
      })),
      settings: {
        time: s.time, rounds: s.rounds, skips: s.skips, unlimited: s.unlimited, categories: s.cats.slice(),
      },
      round: 1,
      turnIndex: 0,
      used: {},
      lastCat: null,
      history: [],
      finished: false,
      dirty: true,
    };
  }

  function startGame(s) {
    game = newGameFromSetup(s);
    keepAwake(true);
    showTurn();
  }

  function skipsLeft(team) {
    return game.settings.unlimited ? Infinity : Math.max(0, game.settings.skips - team.skipsUsed);
  }

  // Τυχαία ερώτηση χωρίς επαναλήψεις μέσα στο ίδιο παιχνίδι
  function drawPrompt() {
    let cats = game.settings.categories.filter((id) => CAT_BY_ID[id]);
    if (cats.length > 1 && game.lastCat) cats = cats.filter((id) => id !== game.lastCat);
    const catId = cats[rand(cats.length)];
    const items = CAT_BY_ID[catId].items;
    let used = game.used[catId] || (game.used[catId] = []);
    if (used.length >= items.length) used = game.used[catId] = [];
    const usedSet = new Set(used);
    let idx = -1;
    for (let tries = 0; tries < 40; tries++) {
      const r = rand(items.length);
      if (!usedSet.has(r)) { idx = r; break; }
    }
    if (idx < 0) {
      const free = [];
      for (let i = 0; i < items.length; i++) if (!usedSet.has(i)) free.push(i);
      idx = free[rand(free.length)];
    }
    used.push(idx);
    game.lastCat = catId;
    game.dirty = true;
    return { cat: catId, idx, text: items[idx] };
  }

  function currentTeam() { return game.teams[game.turnIndex]; }

  function miniScores(container, highlight) {
    container.innerHTML = game.teams.map((t, i) => `
      <span class="mini-score ${i === highlight ? 'current' : ''}">
        <span class="dot" style="--c:${t.color}"></span>${esc(t.name)} · ${t.score}
      </span>`).join('');
  }

  function showTurn() {
    stopTimer();
    turn = null;
    const team = currentTeam();
    applyTeamColors(team);
    $('#turn-round').textContent = `Γύρος ${game.round} / ${game.settings.rounds}`;
    $('#turn-team').textContent = team.name;
    const sl = skipsLeft(team);
    $('#turn-meta').innerHTML = `
      <span class="pill">⭐ ${plural(team.score, 'πόντος', 'πόντοι')}</span>
      <span class="pill">⏱️ ${game.settings.time}″</span>
      <span class="pill">⏭️ ${sl === Infinity ? '∞' : sl} skip</span>`;
    miniScores($('#turn-scores'), game.turnIndex);
    show('turn');
  }

  function reveal() {
    audio(); // ξεκλειδώνει τον ήχο σε κινητά
    turn = {
      teamIndex: game.turnIndex,
      prompt: drawPrompt(),
      remaining: game.settings.time,
      phase: 'ready',
      endAt: 0,
      lastSec: null,
    };
    renderPlay();
    show('play');
  }

  function renderPlay() {
    const team = game.teams[turn.teamIndex];
    const cat = CAT_BY_ID[turn.prompt.cat];
    $('#play-team').textContent = team.name;
    $('#prompt-cat').textContent = `${cat.icon} ${cat.name}`;
    $('#prompt-text').textContent = turn.prompt.text;
    $('#prompt-text').lang = cat.id === 'videogames' ? 'en' : 'el';
    // ξανα-ενεργοποίηση animation
    const card = $('#prompt-card');
    card.style.animation = 'none'; void card.offsetWidth; card.style.animation = '';
    card.classList.toggle('hidden-prompt', turn.phase === 'paused');

    const sl = skipsLeft(team);
    $('#play-skips').textContent = `⏭️ ${sl === Infinity ? '∞' : sl}`;
    ['#btn-skip-ready', '#btn-skip-running'].forEach((s) => {
      $(s).disabled = sl <= 0;
      $(s).textContent = `⏭️ Skip${sl === Infinity ? '' : ` (${sl})`}`;
    });

    const running = turn.phase === 'running' || turn.phase === 'paused';
    $('#play-actions-ready').hidden = running;
    $('#play-actions-running').hidden = !running;
    $('[data-action="pause"]').textContent = turn.phase === 'paused' ? '▶' : '❚❚';
    $('#timer').classList.toggle('paused', turn.phase === 'paused');
    drawTimer(turn.remaining);
  }

  function drawTimer(rem) {
    const total = game.settings.time;
    const sec = Math.ceil(rem);
    $('#timer-text').textContent = sec;
    const C = 2 * Math.PI * 54;
    $('#timer-bar').style.strokeDashoffset = String(C * (1 - rem / total));
    $('#timer').classList.toggle('warn', turn && turn.phase === 'running' && sec <= 5);
  }

  function startTimer() {
    if (!turn) return;
    turn.phase = 'running';
    turn.endAt = performance.now() + turn.remaining * 1000;
    turn.lastSec = Math.ceil(turn.remaining);
    sfx.start();
    vibrate(40);
    clearInterval(timerId);
    timerId = setInterval(onTick, 100);
    renderPlay();
  }

  function onTick() {
    if (!turn || turn.phase !== 'running') return;
    const rem = Math.max(0, (turn.endAt - performance.now()) / 1000);
    turn.remaining = rem;
    const sec = Math.ceil(rem);
    if (sec !== turn.lastSec) {
      turn.lastSec = sec;
      if (sec <= 5 && sec > 0) { sfx.tick(); vibrate(30); }
    }
    drawTimer(rem);
    if (rem <= 0) timeUp();
  }

  function stopTimer() {
    clearInterval(timerId);
    timerId = null;
  }

  function pauseTimer() {
    if (!turn || turn.phase !== 'running') return false;
    stopTimer();
    turn.remaining = Math.max(0, (turn.endAt - performance.now()) / 1000);
    turn.phase = 'paused';
    renderPlay();
    return true;
  }

  function resumeTimer() {
    if (!turn || turn.phase !== 'paused') return;
    turn.phase = 'running';
    turn.endAt = performance.now() + turn.remaining * 1000;
    clearInterval(timerId);
    timerId = setInterval(onTick, 100);
    renderPlay();
  }

  function logTurn(result) {
    game.history.push({
      round: game.round, team: turn.teamIndex, cat: turn.prompt.cat, text: turn.prompt.text, result, at: Date.now(),
    });
    game.updatedAt = Date.now();
    game.dirty = true;
  }

  function skip() {
    if (!turn) return;
    const team = game.teams[turn.teamIndex];
    if (skipsLeft(team) <= 0) { toast('Δεν σας έμειναν άλλα skip!'); return; }
    team.skipsUsed += 1;
    logTurn('skip');
    sfx.skip();
    vibrate(20);
    turn.prompt = drawPrompt();
    turn.remaining = game.settings.time;
    if (turn.phase === 'running' || turn.phase === 'paused') {
      turn.phase = 'running';
      turn.endAt = performance.now() + turn.remaining * 1000;
      turn.lastSec = Math.ceil(turn.remaining);
      clearInterval(timerId);
      timerId = setInterval(onTick, 100);
    }
    renderPlay();
  }

  function correct() {
    if (!turn || turn.phase === 'done') return;
    stopTimer();
    turn.phase = 'done';
    const team = game.teams[turn.teamIndex];
    team.score += 1;
    team.correct += 1;
    logTurn('correct');
    sfx.correct();
    vibrate([60, 40, 60]);
    showResult(true);
  }

  function timeUp() {
    if (!turn || turn.phase === 'done') return;
    stopTimer();
    turn.phase = 'done';
    const team = game.teams[turn.teamIndex];
    team.missed += 1;
    logTurn('miss');
    sfx.buzzer();
    vibrate([300]);
    showResult(false);
  }

  // Προχωράει τη σειρά στην επόμενη ομάδα / γύρο
  function advance() {
    game.turnIndex += 1;
    if (game.turnIndex >= game.teams.length) {
      game.turnIndex = 0;
      game.round += 1;
    }
    if (game.round > game.settings.rounds) {
      game.round = game.settings.rounds;
      game.finished = true;
    }
    game.dirty = true;
  }

  function showResult(ok) {
    const team = game.teams[turn.teamIndex];
    applyTeamColors(team);
    $('#result-team').textContent = team.name;
    $('#result-emoji').textContent = ok ? '🎉' : '⏰';
    $('#result-title').textContent = ok ? 'Μπράβο! +1' : 'Τέλος χρόνου!';
    $('#result-answer').textContent = turn.prompt.text;
    $('#result-answer').lang = turn.prompt.cat === 'videogames' ? 'en' : 'el';
    $('#btn-override').hidden = ok;
    $('#btn-undo').hidden = !ok;
    advance();
    $('#btn-next-turn').textContent = game.finished ? 'Δες τα αποτελέσματα 🏆' : 'Επόμενη ομάδα →';
    miniScores($('#result-scores'), turn.teamIndex);
    show('result');
  }

  function setLastResult(ok) {
    const team = game.teams[turn.teamIndex];
    const last = [...game.history].reverse().find((h) => h.team === turn.teamIndex && h.result !== 'skip');
    if (!last) return;
    if (ok && last.result === 'miss') {
      last.result = 'correct'; team.score += 1; team.correct += 1; team.missed -= 1;
      sfx.correct();
    } else if (!ok && last.result === 'correct') {
      last.result = 'miss'; team.score -= 1; team.correct -= 1; team.missed += 1;
    }
    game.dirty = true;
    $('#result-emoji').textContent = ok ? '🎉' : '⏰';
    $('#result-title').textContent = ok ? 'Μπράβο! +1' : 'Δεν μετράει';
    $('#btn-override').hidden = ok;
    $('#btn-undo').hidden = !ok;
    miniScores($('#result-scores'), turn.teamIndex);
  }

  function nextTurn() {
    if (game.finished) showFinal();
    else showTurn();
  }

  // ---------------------------------------------------------------------------
  // Τελικό σκορ
  // ---------------------------------------------------------------------------
  function ranking() {
    const sorted = game.teams.map((t, i) => ({ ...t, i }))
      .sort((a, b) => b.score - a.score || a.skipsUsed - b.skipsUsed || a.i - b.i);
    let pos = 0, prev = null;
    sorted.forEach((t, k) => {
      if (prev === null || t.score !== prev) pos = k + 1;
      t.pos = pos;
      prev = t.score;
    });
    return sorted;
  }

  function showFinal() {
    stopTimer();
    turn = null;
    game.finished = true;
    keepAwake(false);
    const r = ranking();
    const top = r.filter((t) => t.pos === 1);
    const medal = (p) => (p === 1 ? '🥇' : p === 2 ? '🥈' : p === 3 ? '🥉' : p + '.');
    const head = $('#final-head');
    if (top.length === 1) {
      head.innerHTML = `<div class="trophy">🏆</div><h1>Κέρδισε η ομάδα<br>«${esc(top[0].name)}»!</h1>
        <p>με ${plural(top[0].score, 'πόντο', 'πόντους')}</p>`;
    } else {
      head.innerHTML = `<div class="trophy">🤝</div><h1>Ισοπαλία!</h1>
        <p>${top.map((t) => '«' + esc(t.name) + '»').join(', ')} με ${plural(top[0].score, 'πόντο', 'πόντους')}</p>`;
    }
    $('#final-list').innerHTML = r.map((t) => `
      <li class="${t.pos === 1 ? 'winner' : ''}" style="--c:${t.color};--ink:${inkFor(t.color)}">
        <span class="pos">${medal(t.pos)}</span>
        <span class="name">${esc(t.name)}
          <span class="sub">✓ ${plural(t.correct, 'σωστή', 'σωστές')} · ✗ ${plural(t.missed, 'χαμένη', 'χαμένες')} · ⏭️ ${t.skipsUsed} skip</span></span>
        <span class="pts">${t.score}</span>
      </li>`).join('');
    const played = game.history.filter((h) => h.result !== 'skip').length;
    $('#final-stats').textContent =
      `${plural(game.settings.rounds, 'γύρος', 'γύροι')} · ${plural(played, 'ερώτηση', 'ερωτήσεις')} παίχτηκαν · ${game.settings.time}″ ανά ερώτηση`;
    updateFinalSaveBtn();
    show('final');
    sfx.fanfare();
    confetti(top.map((t) => t.color));
  }

  function updateFinalSaveBtn() {
    const b = $('#btn-final-save');
    const saved = game.saveName && !game.dirty;
    b.textContent = saved ? '✓ Αποθηκεύτηκε' : '💾 Αποθήκευση παιχνιδιού';
  }

  let confettiRaf = null;
  function confetti(colors) {
    const cv = $('#confetti');
    const ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = cv.width = innerWidth * dpr;
    const H = cv.height = innerHeight * dpr;
    const palette = colors.concat(['#ffffff', '#ffd166', '#ff5c8a', '#4cc9f0']);
    const parts = Array.from({ length: 160 }, () => ({
      x: Math.random() * W, y: -Math.random() * H * 0.6, s: (6 + Math.random() * 8) * dpr,
      vx: (Math.random() - 0.5) * 2 * dpr, vy: (2 + Math.random() * 3) * dpr,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.2, c: palette[rand(palette.length)],
    }));
    const t0 = performance.now();
    cancelAnimationFrame(confettiRaf);
    const frame = (t) => {
      ctx.clearRect(0, 0, W, H);
      parts.forEach((p) => {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (t - t0 < 5000 && currentScreen === 'final') confettiRaf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    };
    confettiRaf = requestAnimationFrame(frame);
  }

  // ---------------------------------------------------------------------------
  // Αποθήκευση / φόρτωση
  // ---------------------------------------------------------------------------
  const getSaves = () => load(LS_SAVES, []);
  const putSaves = (list) => store(LS_SAVES, list);

  function updateSavesBadge() {
    const n = getSaves().length;
    const b = $('#saves-badge');
    b.hidden = n === 0;
    b.textContent = n;
  }

  async function saveGame() {
    if (!game) return false;
    let name = game.saveName;
    if (!name) {
      const suggestion = game.teams.map((t) => t.name).join(' vs ');
      name = await dialog({
        title: 'Αποθήκευση παιχνιδιού',
        text: 'Δώσε ένα όνομα για να το βρίσκεις στα «Παλιά παιχνίδια».',
        input: suggestion.slice(0, 60),
        buttons: [{ label: 'Άκυρο', value: null }, { label: 'Αποθήκευση', value: 'input', cls: 'btn-primary', submit: true }],
      });
      if (name === null) return false;
      name = name || suggestion;
    }
    game.saveName = name;
    game.updatedAt = Date.now();
    game.dirty = false;
    const list = getSaves().filter((s) => s.id !== game.id);
    const snapshot = clone(game);
    list.unshift({ id: game.id, name, savedAt: Date.now(), game: snapshot });
    if (!putSaves(list)) {
      game.dirty = true;
      toast('Δεν ήταν δυνατή η αποθήκευση (γεμάτος χώρος;)');
      return false;
    }
    updateSavesBadge();
    toast('Το παιχνίδι αποθηκεύτηκε ✓');
    if (currentScreen === 'final') updateFinalSaveBtn();
    return true;
  }

  function renderSaves() {
    const list = getSaves().sort((a, b) => b.savedAt - a.savedAt);
    const box = $('#saves-list');
    if (!list.length) {
      box.innerHTML = `<div class="empty"><div class="big">🗂️</div>
        Δεν υπάρχουν αποθηκευμένα παιχνίδια ακόμα.<br>Μέσα στο παιχνίδι πάτα ☰ → «Αποθήκευση».</div>`;
      return;
    }
    box.innerHTML = list.map((s) => {
      const g = s.game;
      const best = Math.max(...g.teams.map((t) => t.score));
      const leaders = g.teams.filter((t) => t.score === best);
      const status = g.finished
        ? (leaders.length === 1 ? `🏆 Ολοκληρώθηκε · Νικητής: ${esc(leaders[0].name)}` : '🤝 Ολοκληρώθηκε · Ισοπαλία')
        : `▶ Γύρος ${g.round}/${g.settings.rounds} · σειρά: ${esc(g.teams[g.turnIndex].name)}`;
      return `
        <div class="card save-item">
          <div class="top">
            <h3>${esc(s.name)}</h3>
            <span class="date">${fmtDate(s.savedAt)}</span>
          </div>
          <div class="mini-scores" style="justify-content:flex-start">
            ${g.teams.map((t) => `<span class="mini-score"><span class="dot" style="--c:${t.color}"></span>${esc(t.name)} · ${t.score}</span>`).join('')}
          </div>
          <div class="status">${status}</div>
          <div class="actions">
            <button class="btn btn-primary" data-action="load-save" data-id="${s.id}">${g.finished ? 'Αποτελέσματα' : 'Συνέχεια'}</button>
            <button class="btn btn-secondary" data-action="rename-save" data-id="${s.id}">Μετονομασία</button>
            <button class="btn btn-ghost-dark" data-action="delete-save" data-id="${s.id}">Διαγραφή</button>
          </div>
        </div>`;
    }).join('');
  }

  function loadSave(id) {
    const s = getSaves().find((x) => x.id === id);
    if (!s) return;
    game = clone(s.game);
    game.saveName = s.name;
    game.dirty = false;
    turn = null;
    if (game.finished) {
      showFinal();
    } else {
      keepAwake(true);
      showTurn();
    }
  }

  // ---------------------------------------------------------------------------
  // Ενέργειες κουμπιών
  // ---------------------------------------------------------------------------
  function goHome() {
    stopTimer();
    keepAwake(false);
    turn = null;
    $('#menu').hidden = true;
    updateSavesBadge();
    show('home');
  }

  let menuWasRunning = false;

  const actions = {
    'new-game': () => {
      setup = defaultSetup();
      renderTeamsEditor();
      show('setup-teams');
    },
    'open-saves': () => { renderSaves(); show('saves'); },
    'go-home': async () => {
      if (currentScreen === 'final' && game && game.dirty && !game.saveName) {
        const ok = await confirmDialog('Έξοδος;', 'Το παιχνίδι δεν έχει αποθηκευτεί. Θες να βγεις χωρίς αποθήκευση;', 'Έξοδος');
        if (!ok) return;
      }
      goHome();
    },
    'toggle-sound': () => {
      prefs.sound = !prefs.sound;
      store(LS_PREFS, prefs);
      renderSoundToggle();
      if (prefs.sound) sfx.correct();
    },
    'open-rules': () => { $('#rules').hidden = false; },
    'close-rules': () => { $('#rules').hidden = true; },

    'team-count': (el) => changeTeamCount(Number(el.dataset.delta)),
    'pick-color': (el) => {
      setup.teams[Number(el.dataset.team)].color = el.dataset.color;
      renderTeamsEditor();
    },
    'teams-next': async () => {
      const names = setup.teams.map((t, i) => teamDisplayName(t, i).toLocaleLowerCase('el'));
      if (new Set(names).size !== names.length) {
        toast('Δύο ομάδες έχουν το ίδιο όνομα — άλλαξε το ένα.');
        return;
      }
      const colors = setup.teams.map((t) => t.color.toLowerCase());
      if (new Set(colors).size !== colors.length) {
        const ok = await confirmDialog('Ίδιο χρώμα', 'Κάποιες ομάδες έχουν το ίδιο χρώμα φόντου. Να συνεχίσουμε έτσι;', 'Συνέχεια');
        if (!ok) return;
      }
      renderSettings();
      show('setup-settings');
    },
    'back-to-teams': () => { renderTeamsEditor(); show('setup-teams'); },
    'pick-time': (el) => { setup.time = Number(el.dataset.time); renderSettings(); },
    'rounds': (el) => { setup.rounds = clamp(setup.rounds + Number(el.dataset.delta), 1, 50); renderSettings(); },
    'skips': (el) => { setup.skips = clamp(setup.skips + Number(el.dataset.delta), 0, 30); renderSettings(); },
    'cats-all': () => { setup.cats = CATS.map((c) => c.id); renderCats(); },
    'cats-none': () => { setup.cats = []; renderCats(); },
    'start-game': () => {
      if (!setup.cats.length) { toast('Διάλεξε τουλάχιστον μία κατηγορία.'); return; }
      prefs.lastSetup = clone(setup);
      store(LS_PREFS, prefs);
      audio();
      startGame(setup);
    },

    'reveal': reveal,
    'start-timer': startTimer,
    'skip': skip,
    'correct': correct,
    'pause': () => { if (turn && turn.phase === 'paused') resumeTimer(); else pauseTimer(); },
    'override': () => setLastResult(true),
    'undo-correct': () => setLastResult(false),
    'next-turn': nextTurn,

    'open-menu': () => {
      menuWasRunning = pauseTimer();
      const r = ranking();
      $('#menu-scores').innerHTML = `<p>Γύρος ${game.round} / ${game.settings.rounds}</p>` + r.map((t) => `
        <div class="row"><span class="dot" style="--c:${t.color}"></span>${esc(t.name)}<span class="n">${t.score}</span></div>`).join('');
      $('#menu').hidden = false;
    },
    'close-menu': () => {
      $('#menu').hidden = true;
      if (menuWasRunning) resumeTimer();
      menuWasRunning = false;
    },
    'save-game': () => saveGame(),
    'end-game': async () => {
      const ok = await confirmDialog('Τέλος παιχνιδιού;', 'Το παιχνίδι θα τελειώσει τώρα και θα δείτε το τελικό σκορ.', 'Τέλος', 'btn-danger');
      if (!ok) return;
      $('#menu').hidden = true;
      menuWasRunning = false;
      game.dirty = true;
      showFinal();
    },
    'quit': async () => {
      if (game && game.dirty) {
        const choice = await dialog({
          title: 'Έξοδος στην αρχική',
          text: game.saveName ? 'Υπάρχουν αλλαγές που δεν έχουν αποθηκευτεί.' : 'Το παιχνίδι δεν έχει αποθηκευτεί.',
          buttons: [
            { label: '💾 Αποθήκευση & έξοδος', value: 'save', cls: 'btn-primary', submit: true },
            { label: 'Έξοδος χωρίς αποθήκευση', value: 'quit', cls: 'btn-secondary' },
            { label: 'Άκυρο', value: null },
          ],
        });
        if (choice === null) return;
        if (choice === 'save' && !(await saveGame())) return;
      }
      goHome();
    },
    'rematch': () => {
      const s = {
        teams: game.teams.map((t) => ({ name: t.name, color: t.color })),
        time: game.settings.time,
        rounds: game.settings.rounds,
        skips: game.settings.skips,
        unlimited: game.settings.unlimited,
        cats: game.settings.categories.slice(),
      };
      startGame(s);
    },

    'load-save': (el) => loadSave(el.dataset.id),
    'rename-save': async (el) => {
      const list = getSaves();
      const s = list.find((x) => x.id === el.dataset.id);
      if (!s) return;
      const name = await dialog({
        title: 'Μετονομασία', input: s.name,
        buttons: [{ label: 'Άκυρο', value: null }, { label: 'OK', value: 'input', cls: 'btn-primary', submit: true }],
      });
      if (!name) return;
      s.name = name;
      s.game.saveName = name;
      putSaves(list);
      if (game && game.id === s.id) game.saveName = name;
      renderSaves();
    },
    'delete-save': async (el) => {
      const ok = await confirmDialog('Διαγραφή;', 'Το αποθηκευμένο παιχνίδι θα διαγραφεί οριστικά.', 'Διαγραφή', 'btn-danger');
      if (!ok) return;
      putSaves(getSaves().filter((x) => x.id !== el.dataset.id));
      if (game && game.id === el.dataset.id) { game.saveName = null; game.dirty = true; }
      updateSavesBadge();
      renderSaves();
    },
  };

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  // Είσοδοι φόρμας
  document.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.teamName !== undefined) {
      setup.teams[Number(t.dataset.teamName)].name = t.value;
    } else if (t.dataset.teamColor !== undefined) {
      setup.teams[Number(t.dataset.teamColor)].color = t.value.toLowerCase();
    } else if (t.id === 'time-custom') {
      const v = Number(t.value);
      if (v >= 10 && v <= 600) {
        setup.time = Math.round(v);
        $$('#time-chips .chip').forEach((c) => c.classList.toggle('active', Number(c.dataset.time) === setup.time));
      }
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.teamColor !== undefined) {
      renderTeamsEditor();
    } else if (t.id === 'time-custom') {
      const v = Number(t.value);
      if (t.value && !(v >= 10 && v <= 600)) toast('Ο χρόνος πρέπει να είναι από 10 έως 600 δευτερόλεπτα.');
      renderSettings();
    } else if (t.id === 'skips-unlimited') {
      setup.unlimited = t.checked;
      renderSettings();
    } else if (t.dataset.cat) {
      const set = new Set(setup.cats);
      if (t.checked) set.add(t.dataset.cat); else set.delete(t.dataset.cat);
      setup.cats = CATS.map((c) => c.id).filter((id) => set.has(id));
      renderCats();
    }
  });

  // Προειδοποίηση πριν κλείσει η σελίδα με μη αποθηκευμένο παιχνίδι
  window.addEventListener('beforeunload', (e) => {
    if (game && game.dirty && !game.finished && currentScreen !== 'home') {
      e.preventDefault();
      e.returnValue = '';
    }
  });

  // Πλήκτρα για υπολογιστή: Space = έναρξη/σωστό, S = skip, Esc = μενού
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    if (!$('#dialog').hidden || !$('#rules').hidden) return;
    if (!$('#menu').hidden) { if (e.key === 'Escape') actions['close-menu'](); return; }
    if (currentScreen === 'turn' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); reveal(); }
    else if (currentScreen === 'play') {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (turn.phase === 'ready') startTimer(); else if (turn.phase === 'running') correct();
      } else if (e.key.toLowerCase() === 's') skip();
      else if (e.key === 'Escape') actions['open-menu']();
    } else if (currentScreen === 'result' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); nextTurn(); }
  });

  function renderSoundToggle() {
    $('#sound-toggle').textContent = prefs.sound ? '🔊 Ήχος: ναι' : '🔇 Ήχος: όχι';
  }

  // ---------------------------------------------------------------------------
  // Εκκίνηση
  // ---------------------------------------------------------------------------
  $('#home-count').textContent = `${DATA.total.toLocaleString('el-GR')} ερωτήσεις σε ${CATS.length} κατηγορίες`;
  renderSoundToggle();
  updateSavesBadge();
  show('home');

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
