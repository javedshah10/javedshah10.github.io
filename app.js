// Javed Profile — About Me slice. States: rest -> opening -> menu -> panel, and menu -> closing -> rest.
// Video is decorative: every path also works with CSS only (reduced motion, Save-Data, slow or failed media).
(() => {
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage'), widget = $('#widget'), btn = $('#explore'), menu = $('#menu');
  const panel = $('#panel'), closeBtn = $('#panel-close');
  const fwd = $('.clip-fwd'), rev = $('.clip-rev'), intro = $('.clip-intro');
  const jvf = $('.clip-jvf'), jvr = $('.clip-jvr'), jvHold = $('.still-jv');
  const links = [...menu.querySelectorAll('a')];
  const sections = [...panel.querySelectorAll('.section')];
  const DUR = 1.5;  // Sol's edit: 45 frames at 30 fps; the end pose holds from 1.4 s
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  let state = 'rest', token = 0, playing = null, watchdog = 0, hoverTimer = 0, leaveTimer = 0;
  let quietFocus = false, lastLink = null, openedFromMenu = false;

  const short = matchMedia('(max-height: 500px)');  // matches the compact stage in styles.css
  const allowVideo = () => !reduced.matches && !short.matches && !(navigator.connection && navigator.connection.saveData);
  const ready = (v) => v.getAttribute('src') && !v.error && v.readyState >= 4;

  function src(dir) {
    const narrow = innerWidth < 768;
    if (!narrow && fwd.canPlayType('video/webm; codecs="vp9"')) return `media/01-${dir}-v3-desktop.webm`;
    return `media/01-${dir}-v3-${narrow ? 'mobile' : 'desktop'}.mp4`;
  }
  function prime(v, dir) {
    if (!allowVideo() || v.getAttribute('src')) return;
    v.src = src(dir); v.preload = 'auto'; v.load();
  }

  function setState(s, via) {
    state = s;
    stage.dataset.state = s;
    stage.dataset.via = via || '';
    if (s === 'rest') armNudge(); else stopNudge();
    btn.setAttribute('aria-expanded', String(s === 'opening' || s === 'menu'));
  }
  function stopVideos() {
    clearTimeout(watchdog);
    fwd.pause(); rev.pause(); fwd.onended = rev.onended = null;
    stage.dataset.show = ''; playing = null;
  }

  // Play one direction from `from` seconds. Show it only once a frame is on screen, so there is no blank flash.
  function playClip(v, from, t, done) {
    const other = v === fwd ? rev : fwd;
    clearTimeout(watchdog);
    v.onended = () => done(t, 'video');
    try { v.currentTime = from; } catch (e) { /* not seekable yet: start from 0 */ }
    // A late frame callback must not show a clip that has already been stopped (e.g. play() was refused).
    const show = () => { if (t !== token || playing !== v) return; other.pause(); stage.dataset.show = v === fwd ? 'fwd' : 'rev'; };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(show);
    else v.addEventListener('playing', () => requestAnimationFrame(show), { once: true });
    playing = v;
    watchdog = setTimeout(() => done(t, 'video'), (DUR - from) * 1000 + 900);  // ended may never fire
    v.play().catch(() => done(t, 'css'));  // e.g. Chrome pauses silent video in hidden tabs to save power
  }

  function open() {
    if (state === 'intro' || state === 'opening' || state === 'menu' || state === 'panel') return;
    if (state === 'jv') endJV('css');  // hovering or clicking the capsule during the show goes straight to the menu
    const t = ++token;
    sfx('open');
    const midway = state === 'closing' && playing === rev;
    if (allowVideo() && ready(fwd)) {
      setState('opening');
      playClip(fwd, midway ? Math.max(0, DUR - rev.currentTime) : 0, t, toMenu);
    } else { stopVideos(); toMenu(t, 'css'); }
    prime(rev, 'B-to-A');
  }
  function toMenu(t, via) {
    if (t !== token) return;
    stopVideos(); setState('menu', via); armIdle();
  }
  // Idle menu (Javed, 2026-11-01): after 19 s with no pointer, touch or key activity, fold back to the button.
  const IDLE_MS = 19000;
  let idleTimer = 0;
  function armIdle() {
    clearTimeout(idleTimer);
    if (state !== 'menu') return;
    idleTimer = setTimeout(() => {
      if (state !== 'menu') return;
      const hadFocus = widget.contains(document.activeElement);
      close();
      if (hadFocus) { quietFocus = true; btn.focus({ preventScroll: true }); quietFocus = false; }
    }, IDLE_MS);
  }
  ['pointermove', 'pointerdown', 'keydown', 'wheel'].forEach((ev) => document.addEventListener(ev, armIdle, { passive: true }));
  function close() {
    // 'jv': the mouse leaving the widget box during the JV show used to run this and snap JV back to the capsule.
    if (state === 'intro' || state === 'rest' || state === 'closing' || state === 'panel' || state === 'jv') return;
    const t = ++token;
    sfx('close');
    const midway = state === 'opening' && playing === fwd;
    if (allowVideo() && ready(rev)) {
      setState('closing');
      playClip(rev, midway ? Math.max(0, DUR - fwd.currentTime) : 0, t, toRest);
    } else { stopVideos(); toRest(t, 'css'); }
  }
  function toRest(t, via) {
    if (t !== token) return;
    stopVideos(); setState('rest', via);
  }

  // ---------- Notch flashes: each side fires 3-4 quick flashes, then rests 2-4.5 s, on its own random clock. ----------
  const notches = [...panel.querySelectorAll('.notch')];
  let flickerOn = false;
  function burst(el) {
    if (!flickerOn || reduced.matches) return;
    const marks = [];
    let t = 0;
    for (let i = 0, n = 3 + Math.floor(Math.random() * 2); i < n; i++) {
      marks.push([t, t + 35, t + 140, 0.55 + Math.random() * 0.45]);  // start, peak, end (ms), brightness
      t += 180 + Math.random() * 90;
    }
    const total = t;
    const kf = [{ opacity: 0, offset: 0 }];
    marks.forEach(([s, p, e, a]) => kf.push({ opacity: 0, offset: s / total }, { opacity: a, offset: p / total }, { opacity: 0, offset: e / total }));
    kf.push({ opacity: 0, offset: 1 });
    el.animate(kf, { duration: total }).finished
      .then(() => { el._t = setTimeout(() => burst(el), 2000 + Math.random() * 2500); })
      .catch(() => {});  // cancelled by stopFlicker
  }
  function startFlicker() {
    if (flickerOn || reduced.matches) return;
    flickerOn = true;
    notches.forEach((el, i) => { el._t = setTimeout(() => burst(el), 500 + i * 700 + Math.random() * 900); });
  }
  function stopFlicker() {
    flickerOn = false;
    notches.forEach((el) => { clearTimeout(el._t); el.getAnimations().forEach((a) => a.cancel()); });
  }

  // ---------- Idle nudge on the resting button (Javed, 2026-11-01): after 5 s with no activity the button "breathes"
  // (zoom out and in, brighter label glow) and repeats every 5 s while the visitor stays idle. The sound plays only on
  // the first two breaths of each idle spell, so it never nags. Any pointer, key, wheel or touch activity cancels it and
  // restarts the count. Never with reduced motion.
  const NUDGE_EVERY = 5000, NUDGE_SOUNDS = 2, NUDGE_MS = 1900;
  let nudgeTimer = 0, nudgeEnd = 0, nudges = 0;
  // JV show (Javed's logo, Gemini clip edited by Sol): at 15 s idle, then every 30 s while idle, the button bursts into
  // cyan fire and becomes "JV" (5.96 s), the sharp logo and caption hold 2.2 s, then it implodes back (reverse at 2x,
  // 2.98 s) and the capsule lands softly. Files load at 10 s idle; if they are not ready the tick is a normal breath.
  // Mouse movement never interrupts it; a click, tap or key ends it at once.
  const JV_AFTER = 15000, JV_EVERY = 30000, JV_PRELOAD = 10000, JV_HOLD = 2200, JV_COVER = 5.3;  // hold long enough to read the caption
  let idleSince = performance.now(), lastJV = -Infinity, jvTimer = 0, jvWatch = 0;
  function stopNudge() { clearTimeout(nudgeTimer); clearTimeout(nudgeEnd); delete stage.dataset.nudge; }
  function armNudge() {
    clearTimeout(nudgeTimer);
    if (state !== 'rest' || reduced.matches) return;
    // first breath 5 s after activity stops, then one every 5 s (start to start) while idle
    nudgeTimer = setTimeout(() => {
      if (state !== 'rest') return;
      const now = performance.now(), idleFor = now - idleSince;
      if (idleFor >= JV_PRELOAD - 100) primeJV();
      if (idleFor >= JV_AFTER - 100 && now - lastJV >= JV_EVERY && ready(jvf) && ready(jvr)) { lastJV = now; runJV(); return; }
      nudges++;
      stage.dataset.nudge = '';
      if (nudges <= NUDGE_SOUNDS) sfx('nudge');
      clearTimeout(nudgeEnd);
      nudgeEnd = setTimeout(() => { delete stage.dataset.nudge; }, NUDGE_MS);
      armNudge();
    }, NUDGE_EVERY);
  }
  ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, (e) => {
    nudges = 0; idleSince = performance.now(); lastJV = -Infinity;
    // Play-through (Javed, 2026-11-01): moving or scrolling lets the show finish, so visitors see the whole JV reveal.
    // Keys still stop it at once (keyboard users want in). The mouse-move rewind is in git at 40fa0a0.
    // A click or tap stops the show only on the capsule, and opens the menu (Javed, 2026-11-01); elsewhere it plays on.
    if (state === 'jv' && (ev === 'pointerdown' || ev === 'touchstart') && widget.contains(e.target)) { endJV('css'); open(); }
    else if (state === 'jv' && ev === 'keydown') endJV('css');
    if (state === 'rest') { stopNudge(); armNudge(); }
  }, { passive: true, capture: true }));  // capture: cancel the show before a click reaches the button

  function primeJV() {
    if (!allowVideo() || jvf.getAttribute('src')) return;
    const size = innerWidth < 768 ? 'mobile' : 'desktop';
    jvf.src = `media/jv-forward-${size}.mp4?v=2`; jvr.src = `media/jv-reverse-${size}.mp4?v=2`;
    [jvf, jvr].forEach((v) => { v.preload = 'auto'; v.load(); });
    jvHold.src = 'media/jv-end.webp';
    loadSound('jv');
  }
  function playJV(v, t, done, maxMs) {
    clearTimeout(jvTimer);
    v.currentTime = 0;
    const show = () => { if (t === token && state === 'jv') stage.dataset.show = v === jvf ? 'jvf' : 'jvr'; };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(show);
    else v.addEventListener('playing', () => requestAnimationFrame(show), { once: true });
    // Finish once: the backup timer (ended may never fire) used to fire as well and replay the hold and the reverse.
    let fired = false;
    const finish = () => { if (fired || t !== token) return; fired = true; clearTimeout(jvWatch); v.onended = null; done(); };
    v.onended = finish;
    clearTimeout(jvWatch);
    jvWatch = setTimeout(finish, maxMs);
    v.play().catch(() => { if (t === token) endJV('css'); });
  }
  let fireGain = null;
  function hushFire() { if (fireGain) fireGain.gain.setTargetAtTime(0, actx.currentTime, 0.12); fireGain = null; }
  function runJV() {
    const t = ++token;
    // Phones (Javed, 2026-11-01): JV is about 53 % of the stage wide, wider than a phone screen, so the scene zooms out
    // while the fire grows (and back in after the landing) to keep JV inside 92 % of the screen width.
    const fit = Math.min(1, innerWidth * 0.92 / (0.53 * stage.getBoundingClientRect().width));
    if (fit < 1) { stage.style.setProperty('--jvs', fit.toFixed(3)); stage.classList.add('jv-zoom'); }
    setState('jv');
    delete stage.dataset.hold;
    fireGain = sfx('jv');
    // From 5.3 s the JV shape no longer moves (measured), only stray sparks hang in the air: the sharp, spark-free logo
    // starts to focus in over the still-playing clip, so the sparks dissolve under it (Javed, 2026-11-01).
    const cover = (now, meta) => {
      if (t !== token || state !== 'jv') return;
      if (meta.mediaTime >= JV_COVER) stage.dataset.show = 'jvhold'; else jvf.requestVideoFrameCallback(cover);
    };
    if (jvf.requestVideoFrameCallback) jvf.requestVideoFrameCallback(cover);
    playJV(jvf, t, () => {
      stage.dataset.show = 'jvhold';  // the sharp logo still covers the video's last frame
      jvTimer = setTimeout(() => {
        if (t !== token) return;
        stage.dataset.hold = 'out';  // the sharp logo fades out, sharp to blurred, as the reverse starts
        sfx('open');  // "Transformation" whoosh for the implosion
        playJV(jvr, t, () => endJV('video'), 2979 + 1500);
      }, JV_HOLD);
    }, 5958 + 1500);
  }
  function endJV(via) {
    if (state !== 'jv') return;
    ++token;
    clearTimeout(jvTimer); clearTimeout(jvWatch);
    hushFire();
    delete stage.dataset.hold;
    [jvf, jvr].forEach((v) => { v.pause(); v.onended = null; });
    // After a full show the reverse's last frame stays up and the sharp capsule fades in over it, blurred to sharp,
    // so the small size difference between the video and the still is not seen (Javed, 2026-11-01).
    stage.dataset.show = via === 'video' ? 'jvland' : '';
    setState('rest', via === 'video' ? 'css' : via);
    if (via === 'video') setTimeout(() => {
      if (stage.dataset.show === 'jvland') stage.dataset.show = '';
      if (state === 'rest' && btn.matches(':hover')) open();  // the mouse rested on the capsule while it came back
    }, 1050);
    setTimeout(() => { if (state !== 'jv') stage.classList.remove('jv-zoom'); }, 1300);  // after the zoom back in
  }

  // ---------- Panel (section content). The URL hash owns it, so the browser Back button closes it. ----------
  function showPanel(section, instant) {
    ++token; stopVideos();
    sections.forEach((s) => s.classList.toggle('is-active', s === section));
    lastLink = links.find((a) => a.hash === '#' + section.id) || null;
    widget.inert = true;
    setState('panel');
    panel.hidden = false;
    if (!instant) sfx('panelOpen');
    const go = () => { panel.classList.add('is-in'); section.querySelector('h2').focus({ preventScroll: true }); startFlicker(); };
    if (instant || reduced.matches) go(); else requestAnimationFrame(() => requestAnimationFrame(go));
  }
  function hidePanel() {
    panel.classList.remove('is-in');
    stopFlicker();
    sfx('panelClose');
    links.forEach((a) => a.classList.remove('is-picked'));
    widget.inert = false;
    setState('menu', 'css');
    const finish = () => { if (!panel.classList.contains('is-in')) panel.hidden = true; };
    reduced.matches ? finish() : setTimeout(finish, 450);
    if (lastLink) { quietFocus = true; lastLink.focus({ preventScroll: true }); quietFocus = false; }
  }
  function route(instant) {
    const id = decodeURIComponent(location.hash.slice(1));
    const section = id && sections.find((s) => s.id === id);
    if (section) showPanel(section, instant);
    else if (state === 'panel') hidePanel();
  }
  function closePanel() {
    if (openedFromMenu) { openedFromMenu = false; history.back(); return; }
    history.replaceState(null, '', location.pathname + location.search);
    route();
  }

  // ---------- Input ----------
  btn.addEventListener('click', open);  // the button only opens; leaving, Escape or clicking outside closes
  btn.addEventListener('focus', () => { if (!quietFocus && btn.matches(':focus-visible')) open(); });
  btn.addEventListener('pointerenter', (e) => {
    // No hover-open during the JV show (Javed, 2026-11-01); it checks again once the capsule has landed.
    // ...nor during the 1 s landing ('jvland'), which it would cut short.
    if (e.pointerType === 'mouse' && state !== 'jv' && stage.dataset.show !== 'jvland') hoverTimer = setTimeout(open, 120);  // small intent delay against fly-overs
  });
  btn.addEventListener('pointerleave', () => clearTimeout(hoverTimer));
  widget.addEventListener('pointerenter', () => clearTimeout(leaveTimer));
  widget.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse') return;
    clearTimeout(hoverTimer); clearTimeout(leaveTimer);
    leaveTimer = setTimeout(() => {
      const a = document.activeElement;
      if (!(widget.contains(a) && a.matches(':focus-visible'))) close();
    }, 10000);  // the menu waits 10 s after the mouse leaves before folding back (Javed, 2026-11-01)
  });
  // Clicking a section link moves focus off the menu for a moment before 'hashchange' opens the panel;
  // `picking` stops that gap from closing the menu (it played the close sound under the panel sound).
  let picking = false;
  widget.addEventListener('focusout', () => setTimeout(() => {
    if (!picking && !widget.contains(document.activeElement) && state !== 'panel') close();
  }, 0));
  document.addEventListener('pointerdown', (e) => {
    if ((state === 'menu' || state === 'opening') && !widget.contains(e.target)) close();
  });
  links.forEach((a) => {
    a.addEventListener('click', () => {
      a.classList.add('is-picked'); openedFromMenu = true; picking = true; sfx('select');
      setTimeout(() => { picking = false; }, 400);  // safety: never leave it set if no hashchange follows
    });
    a.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && state === 'menu') sfx('hover'); });
  });
  closeBtn.addEventListener('click', closePanel);
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (state === 'panel') closePanel();
    else if (state === 'menu' || state === 'opening') {
      close(); quietFocus = true; btn.focus({ preventScroll: true }); quietFocus = false;
    }
  });
  addEventListener('hashchange', () => route(false));
  [fwd, rev].forEach((v) => v.addEventListener('error', () => { if (playing === v) stopVideos(); }));

  // Navy fix: read the decoded background of the first frame and offset the clip so it equals #080C14.
  // Only small offsets are corrected; anything larger means a wrong file, so leave it alone.
  const NAVY = [8, 12, 20];
  // Each clip gets its own filter: encodes differ (Chrome decoded clip 01 at +1, the re-edited intro at -1).
  function calibrate(v) {
    try {
      const c = document.createElement('canvas'); c.width = 64; c.height = 36;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(v, 0, 0, 64, 36);
      // Average the outer 3-pixel ring (background only) instead of one pixel: a clip whose navy sits half a level
      // off would otherwise round to a full-level "fix" that makes it worse (seen with the re-edited intro).
      const px = g.getImageData(0, 0, 64, 36).data, sum = [0, 0, 0];
      let n = 0;
      for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) {
        if (x > 2 && x < 61 && y > 2 && y < 33) continue;
        const k = (y * 64 + x) * 4; sum[0] += px[k]; sum[1] += px[k + 1]; sum[2] += px[k + 2]; n++;
      }
      const raw = NAVY.map((c, i) => c - sum[i] / n);
      const off = raw.map((o) => (Math.abs(o) >= 0.75 ? Math.round(o) : 0));  // only a clear full-level offset
      if (off.every((o) => o === 0) || off.some((o) => Math.abs(o) > 6)) return;
      const id = 'navyfix-' + v.dataset.name;
      let f = document.getElementById(id);
      if (!f) {
        f = document.getElementById('navyfix').cloneNode(true);
        f.id = id;
        document.getElementById('navyfix').after(f);
      }
      ['R', 'G', 'B'].forEach((ch, i) => f.querySelector('feFunc' + ch).setAttribute('intercept', off[i] / 255));
      v.style.filter = `url(#${id})`;
    } catch (e) { /* canvas blocked: keep the clip as is */ }
  }
  [fwd, rev, jvf, jvr].forEach((v) => v.addEventListener('loadeddata', () => calibrate(v), { once: true }));

  // ---------- Sound effects (Javed's own Flash sounds, picked 2026-11-01; swap a file name here to change one).
  // [file in media/sfx, gain]; gains even out loudness (loudest 50 ms about -18 to -22 dBFS, hover softer).
  // Browsers only allow sound after a click, tap or key press, so the intro and a hover before any click stay silent.
  const SOUNDS = {
    open: ['transformation', 0.6],   // "Transformation" (Flash 318), 1.67 s, menu opening
    close: ['ipm-403', 1.7],          // 1.09 s, menu closing
    hover: ['button-over', 0.23],     // "Button Over" (Flash 311), 0.13 s
    select: ['ipm-400', 0.51],        // 0.29 s click on a section
    panelOpen: ['ipm-64', 1.5],       // 1.41 s, Flash oval-to-panel morph
    panelClose: ['ipm-192', 1.9],     // 0.73 s
    nudge: ['ipm-58', 0.48],          // 0.52 s, idle invitation on the button
    jv: ['jv-fire', 0.28],            // 5.97 s, the JV clip's own fire sound (146 KB, loaded only with the JV show)
    orbit: ['orbit-o1', 0.35],        // 5.58 s, the orbit gyroscope's mechanical loop (every 3rd turn only)
    orbitJV: ['orbit-o2', 0.5],       // 5.92 s, the gyroscope's robot transformation into JV
  };
  const LAZY_SOUNDS = ['jv', 'orbit', 'orbitJV'];
  const soundBtn = $('#sound-toggle');
  let actx = null, soundOn = false;  // off by default (Javed, 2026-11-02); the visitor's choice is remembered
  const sbuf = {};
  try { soundOn = localStorage.getItem('jp-sound') === 'on'; } catch (e) { /* default off */ }
  function loadSound(k) {
    if (!actx || k in sbuf) return;
    sbuf[k] = null;  // mark as loading
    fetch(`media/sfx/${SOUNDS[k][0]}.mp3`)
      .then((r) => r.arrayBuffer()).then((b) => actx.decodeAudioData(b)).then((buf) => { sbuf[k] = buf; })
      .catch(() => { /* a missing sound just stays silent */ });
  }
  function loadSounds() {
    if (actx || !soundOn) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    actx = new AC();  // starts suspended until the first gesture; decoding still works
    Object.keys(SOUNDS).filter((k) => !LAZY_SOUNDS.includes(k)).forEach(loadSound);
  }
  // One sound at a time (Javed, 2026-11-01): a new sound fades the previous one out in about 0.1 s, so sounds never mix.
  // While the browser keeps audio asleep (before the first click or key), only a sound caused by that gesture plays;
  // idle sounds are skipped, otherwise they queue up and all burst out together on the first click.
  let voice = null;
  function hush(v) {
    if (!v) return;
    v.g.gain.setTargetAtTime(0, actx.currentTime, 0.02);
    try { v.src.stop(actx.currentTime + 0.12); } catch (e) { /* already stopped */ }
  }
  function sfx(k) {
    if (!soundOn || !actx || !sbuf[k]) return null;
    if (actx.state !== 'running') {
      const gesture = navigator.userActivation ? navigator.userActivation.isActive : false;
      const wake = actx.resume();
      if (gesture) wake.then(() => { if (actx.state === 'running') sfx(k); }).catch(() => {}); else wake.catch(() => {});
      return null;
    }
    hush(voice);
    const src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = sbuf[k]; g.gain.value = SOUNDS[k][1];
    src.connect(g).connect(actx.destination);
    src.start();
    const v = voice = { src, g };
    src.onended = () => { if (voice === v) voice = null; };
    return g;
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => {
    if (actx && actx.state === 'suspended' && soundOn) actx.resume().catch(() => {});
  }, { capture: true }));
  function paintSound() { soundBtn.dataset.on = String(soundOn); soundBtn.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.sound === 'on') === soundOn))); }
  soundBtn.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || (b.dataset.sound === 'on') === soundOn) return;
    soundOn = !soundOn;
    try { localStorage.setItem('jp-sound', soundOn ? 'on' : 'off'); } catch (e) { /* not remembered */ }
    paintSound();
    if (soundOn) { loadSounds(); if (actx) actx.resume().then(() => sfx('select')).catch(() => {}); }
    else if (actx) { hush(voice); voice = null; }
  });
  paintSound();
  loadSounds();  // 90 KB at startup, so the first click already has its sound (playback still waits for that click)

  // ---------- Orbit object (Javed, 2026-11-01; built and tuned in site/lab/orbit.html). A small gyroscope (Gemini, keyed
  // by Sol) floats around the capsule, always in front, on a path that never covers it. It arrives 2 s after the
  // capsule first rests, floats off-screen while the menu, a section or the capsule's JV show is on, and comes back.
  // Hover or tap it: it turns into JV (clean JV image over the seam) and back. Visitors tune it in the tray.
  // Off with reduced motion, short screens and Safari (no VP9 alpha there).
  const orbitEl = $('#orbiter'), orbitHit = $('#orbiter .ohit'), tray = $('#orbit-tray');
  const ORBIT_KEY = 'jp-orbit', CAP_CY = 34.761 + 37.232 / 2;  // capsule centre, % of stage height
  const ORBIT_DEFAULTS = innerWidth < 768
    ? { on: true, period: 19, size: 13, rx: 38, ry: 6, cy: 22, dir: -1 }   // phones: the capsule fills the width, so float above it
    : { on: true, period: 19, size: 9, rx: 28, ry: 33, cy: CAP_CY, dir: -1 };  // Javed's settings
  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const orbitOK = !!orbitEl && !isSafari && document.createElement('video').canPlayType('video/webm; codecs="vp09.00.10.08"') !== '';
  let orb = { ...ORBIT_DEFAULTS };
  try { Object.assign(orb, JSON.parse(localStorage.getItem(ORBIT_KEY) || '{}')); } catch (e) { /* defaults */ }
  let theta = Math.PI / 2, presence = 0, arriveAt = 0, oLast = 0, oShown = -1, SW = 0, SH = 0, F = 0;
  let ov1 = null, ov2 = null, ov2r = null, oBusy = false, oPending = false, oLoops = 0, oHover = false, oNextAuto = 0;
  const ORBIT_AUTO = 19000;  // transforms by itself after 19 s on screen, for visitors who never click it (Javed)
  const oT0 = performance.now();
  function oMeasure() { const r = stage.getBoundingClientRect(); SW = r.width; SH = r.height; F = Math.min(SW, innerWidth); }
  function orbitWanted(now) {
    if (!orb.on || reduced.matches || short.matches || state !== 'rest' || stage.dataset.show) return false;
    if (!arriveAt) arriveAt = now + 2000;  // the first time the capsule rests (after the intro): arrive 2 s later
    return now >= arriveAt;
  }
  // At least 1.3x the shown size: a slight downscale smooths the keyed edges (at 1:1, on phones, they looked rough).
  // Measured picks: big screen 320, 14-inch 480 (both confirmed smooth by Javed), iPhone 480.
  function oTier() { const need = orb.size / 100 * F / 0.48 * (devicePixelRatio || 1) * 1.3; return need <= 320 ? '-320' : need <= 480 ? '-mobile' : ''; }
  function oLayer(el, cls) { el.classList.add('olayer', cls); orbitEl.appendChild(el); return el; }
  function oVideo(src, cls) { const v = document.createElement('video'); Object.assign(v, { muted: true, playsInline: true, preload: 'auto', src }); return oLayer(v, cls); }
  function orbitLoad() {  // files load only when the object first arrives; size picked by the shown size (smooth edges)
    const t = oTier();
    ov1 = oVideo(`media/orbit/orbit-o1${t}.webm`, 'o1'); ov1.loop = true;
    ov2 = oVideo(`media/orbit/orbit-o2${t}.webm`, 'o2');
    ov2r = oVideo(`media/orbit/orbit-o2-reverse${t}.webm`, 'o2r');
    const img = new Image(); img.alt = '';
    img.src = `media/orbit/orbit-jv-hold-${t === '-320' ? '320' : t ? 'mobile' : 'desktop'}.png`; oLayer(img, 'ohold');
    loadSound('orbit'); loadSound('orbitJV');
    if (ov1.requestVideoFrameCallback) {
      let prev = 0;
      const tick = (n, m) => {  // the loop wrapped to its first frame, which the transformation also starts on
        if (m.mediaTime < prev && !oBusy) { if (oPending) orbitTransform(); else if (oLoops++ % 3 === 0 && presence === 1) sfx('orbit'); }
        prev = m.mediaTime; ov1.requestVideoFrameCallback(tick);
      };
      ov1.requestVideoFrameCallback(tick);
    }
  }
  function orbitTransform() {
    oPending = false; oBusy = true;
    ov1.pause(); ov1.playbackRate = 1; ov1.currentTime = 0;
    sfx('orbitJV');
    const done = () => { delete orbitEl.dataset.show; delete orbitEl.dataset.out; oBusy = false; ov1.play().catch(() => {}); };
    ov2.currentTime = 0;
    ov2.requestVideoFrameCallback(() => { orbitEl.dataset.show = 'o2'; });
    const cover = (n, m) => { if (m.mediaTime >= ov2.duration - 0.6) orbitEl.dataset.show = 'hold'; else ov2.requestVideoFrameCallback(cover); };
    ov2.requestVideoFrameCallback(cover);  // the video's final JV has a seam: the clean JV image focuses in over it
    ov2.onended = () => {
      orbitEl.dataset.show = 'hold';
      setTimeout(() => {
        orbitEl.dataset.out = ''; ov2r.currentTime = 0;
        ov2r.requestVideoFrameCallback(() => { orbitEl.dataset.show = 'o2r'; });
        ov2r.onended = done; ov2r.play().catch(done);
      }, 2000);
    };
    ov2.play().catch(done);
  }
  function oFrame(now) {
    const dt = oLast ? Math.min(now - oLast, 100) / 1000 : 0; oLast = now;
    presence = Math.max(0, Math.min(1, presence + (orbitWanted(now) ? dt : -dt) / 1.1));
    const e = presence * presence * (3 - 2 * presence);
    if (e > 0 && !ov1) orbitLoad();
    if (e <= 0.9) oHover = false;  // floating away under a still mouse sends no pointerleave
    if (presence < 1 || oBusy) oNextAuto = Math.max(oNextAuto, now + ORBIT_AUTO);  // the timer runs only while it is on screen
    else if (!oPending && ov1 && now >= oNextAuto) oPending = true;  // starts at the next loop start
    if (e > 0 || oShown !== 0) {
      if (!oBusy && !oHover) theta += orb.dir * 2 * Math.PI * dt / orb.period;  // hover: it waits under the mouse
      const depth = Math.sin(theta), bob = Math.sin((now - oT0) / 1000 * 2 * Math.PI / 7) * 1.2;
      // Shadow (Javed, 2026-11-01): it stays put while the object bobs; higher = lighter and wider, lower = darker and tighter.
      orbitEl.style.setProperty('--sy', (-bob / 100 * SH).toFixed(1) + 'px');
      orbitEl.style.setProperty('--ss', (1 - 0.1 * bob / 1.2).toFixed(3));
      orbitEl.style.setProperty('--so', (0.75 + 0.2 * bob / 1.2).toFixed(3));
      const bw = orb.size / 100 * F / 0.48, bh = bw * 9 / 16;  // the clips are a 16:9 crop, the object 48 % of its width
      const away = (1 - e) * (innerWidth / 2 + bw) * (Math.cos(theta) >= 0 ? 1 : -1);  // floats out sideways
      const x = SW / 2 + orb.rx / 100 * F * Math.cos(theta) - bw / 2 + away;
      const y = (orb.cy + orb.ry * depth + bob) / 100 * SH - bh / 2;
      orbitEl.style.width = bw + 'px'; orbitEl.style.height = bh + 'px';
      orbitEl.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${0.9 + 0.1 * (depth + 1) / 2})`;
      orbitEl.style.opacity = e.toFixed(3);
      orbitEl.style.visibility = e > 0 ? 'visible' : 'hidden';
      orbitEl.classList.toggle('is-here', e > 0.9);
      if (ov1 && !oBusy) { if (e > 0 && ov1.paused) ov1.play().catch(() => {}); else if (e === 0 && !ov1.paused) ov1.pause(); }
      oShown = e;
    }
    requestAnimationFrame(oFrame);
  }
  function oSave() { try { localStorage.setItem(ORBIT_KEY, JSON.stringify(orb)); } catch (e) { /* not kept */ } }
  function oPaint() {
    ['period', 'size', 'rx', 'ry'].forEach((k) => { $('#orbit-' + k).value = orb[k]; $('#orbit-' + k + '-v').value = orb[k]; });
    $('#orbit-dir').textContent = orb.dir < 0 ? 'Reverse' : 'Forward';
    $('#orbit-on').textContent = orb.on ? 'On' : 'Off';
    $('#orbit-on').setAttribute('aria-pressed', String(orb.on));
  }
  if (orbitOK) {
    tray.hidden = false;
    const trayBtn = $('#orbit-tray-btn'), panelEl = $('#orbit-panel');
    trayBtn.addEventListener('click', () => { panelEl.hidden = !panelEl.hidden; trayBtn.setAttribute('aria-expanded', String(!panelEl.hidden)); });
    ['period', 'size', 'rx', 'ry'].forEach((k) => $('#orbit-' + k).addEventListener('input', (e) => {
      orb[k] = +e.target.value; $('#orbit-' + k + '-v').value = e.target.value; oSave();
    }));
    $('#orbit-dir').addEventListener('click', () => { orb.dir *= -1; oSave(); oPaint(); });
    $('#orbit-on').addEventListener('click', () => { orb.on = !orb.on; oSave(); oPaint(); });
    $('#orbit-reset').addEventListener('click', () => { orb = { ...ORBIT_DEFAULTS }; oSave(); oPaint(); });
    // Hover pauses it on its path; a click or tap turns it into JV (Javed, 2026-11-01): the rings spin up at once and
    // the transformation starts at the loop start, about 4x sooner.
    const wake = () => { if (ov1 && !oBusy && presence === 1 && !oPending) { oPending = true; ov1.playbackRate = 4; } };  // rings spin up at once (instant feedback) and reach the loop start, where the transformation begins, about 4x sooner
    orbitHit.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') oHover = true; });
    orbitHit.addEventListener('pointerleave', () => { oHover = false; });
    orbitHit.addEventListener('pointerdown', wake);
    oPaint(); oMeasure(); addEventListener('resize', oMeasure);
    requestAnimationFrame(oFrame);
  }

  // ---------- Intro (orb -> button, Sol's 04 v3 edit, 3.33 s). Every page load (Javed, 2026-11-02), skipped by any
  // click or key, never with reduced motion / short screens / Save-Data / a section link, dropped if not playing in 1.5 s.
  // The stage stays hidden (html.intro-wait, set in index.html) until the intro's first frame or the fallback.
  const SKIP_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
  const reveal = () => document.documentElement.classList.remove('intro-wait');
  function runIntro() {
    if (!allowVideo() || location.hash) { reveal(); return false; }
    const t = ++token;
    setState('intro');
    let startTimer = 0, endTimer = 0;
    const finish = (via) => {
      if (t !== token || state !== 'intro') return;
      clearTimeout(startTimer); clearTimeout(endTimer);
      intro.pause(); intro.onended = null;
      stage.dataset.show = '';
      reveal();
      setState('rest', via);
      SKIP_EVENTS.forEach((ev) => document.removeEventListener(ev, skip, true));
      primeClips();
    };
    const skip = () => finish('css');
    SKIP_EVENTS.forEach((ev) => document.addEventListener(ev, skip, true));
    const narrow = innerWidth < 768;
    intro.src = !narrow && intro.canPlayType('video/webm; codecs="vp9"')
      ? 'media/04-S0-to-A-v3-desktop.webm' : `media/04-S0-to-A-v3-${narrow ? 'mobile' : 'desktop'}.mp4`;  // v3: Grok's background blotches gated to navy (v4 smoothing tried and rejected, see FIX-LOG)
    intro.preload = 'auto';
    intro.addEventListener('loadeddata', () => calibrate(intro), { once: true });
    const show = () => {
      if (t !== token || state !== 'intro') return;
      clearTimeout(startTimer);
      stage.dataset.show = 'intro';
      reveal();
      endTimer = setTimeout(() => finish('video'), 3333 + 1500);  // ended may never fire
    };
    if (intro.requestVideoFrameCallback) intro.requestVideoFrameCallback(show);
    else intro.addEventListener('playing', () => requestAnimationFrame(show), { once: true });
    intro.onended = () => finish('video');
    startTimer = setTimeout(() => finish('css'), 1500);
    intro.play().catch(() => finish('css'));
    return true;
  }
  function primeClips() {
    prime(fwd, 'A-to-B');
    fwd.addEventListener('canplaythrough', () => prime(rev, 'B-to-A'), { once: true });
  }

  route(true);
  if (!runIntro() && state === 'rest') armNudge();  // the page starts at rest without a setState call
  // Load the menu clips after the page is up (and after the intro), so they never compete with first paint.
  addEventListener('load', () => {
    const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
    idle(() => { if (state !== 'intro') primeClips(); });
  });
})();
