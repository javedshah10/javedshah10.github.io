// About Me intro (Javed, 2026-11-02): a 10 s Flash-style motion graphic inside the panel glass when About Me first opens.
// Storyboard: ABOUT-INTRO-STORYBOARD.md. Built and tuned in lab/about-intro.html. Words are HTML; images and sounds are decoration.
// app.js calls init() once, prime() when the menu opens (starts loading), play() from showPanel, stop() from hidePanel.
window.AboutIntro = (() => {
  const BASE = 'media/about-intro/';
  const PLATES = { A: 'plate-A', R: 'ripple-hook-still', B: 'plate-B', Cl: 'plate-C', Cr: 'plate-C', D: 'plate-D', E: 'plate-E', L: 'logo-clean', F: 'plate-F' };
  // Javed's sound picks from the AT_INTRO extraction; gains bring each peak to about -6 dB (the loop to about -16 dB).
  const GAIN = { 116: .5, 122: .35, 215: .68, 182: .67, 289: .88, 181: 1.2, 363: .46 };
  const BEATS = [
    { w: 'Think it.', s: 'An idea. A question. A messy spreadsheet.', plate: ['B'], move: 'gather' },
    { w: 'Build it.', s: 'Dashboards, data pipelines, AI agents.', plate: ['Cl', 'Cr'], move: 'slam', cls: 'ai-left' },
    { w: 'Automate it.', s: 'The reports and routine nobody wants to repeat.', plate: ['D'], move: 'pulse' },
    { w: 'Let it run.', s: 'Your daily report, already done.', plate: ['E'], move: 'rise' },
  ];
  const LEN = 10;

  let glass = null, getAudio = () => null, root = null, P = {}, el = {}, ready = null, played = false;
  let anims = [], raf = 0, t0 = 0, waitTimer = 0, running = false;
  let actx = null, master = null, a0 = 0;
  const buf = {};

  function init(opts) { glass = opts.glass; getAudio = opts.audio; }

  // Build the layer once and start loading its images (and sounds if they are on). Called when the menu opens.
  function prime() {
    if (root || !glass) return;
    root = document.createElement('div');
    root.className = 'ai-root';
    root.hidden = true;
    root.innerHTML = `
      <svg width="0" height="0" class="ai-defs" aria-hidden="true"><filter id="ai-breathe" x="-3%" y="-3%" width="106%" height="106%">
        <feTurbulence type="fractalNoise" baseFrequency="0.004 0.012" numOctaves="2" seed="7"/>
        <feDisplacementMap in="SourceGraphic" scale="4" xChannelSelector="R" yChannelSelector="G"/></filter></svg>
      <div class="ai-band" aria-hidden="true">
        <div class="ai-cam"><div class="ai-plates"></div>
          <div class="ai-rings"><i></i><i></i><i></i></div>
          <div class="ai-dot ai-drop"></div><div class="ai-dot ai-spark"></div>
          <div class="ai-streak"></div><div class="ai-burst"></div><div class="ai-beats"></div></div>
        <div class="ai-dot ai-point"></div><div class="ai-flash"></div>
      </div>
      <button class="ai-skip" type="button" aria-label="Skip intro">Skip</button>`;
    glass.after(root);
    const q = (s) => root.querySelector(s);
    el = { band: q('.ai-band'), cam: q('.ai-cam'), plates: q('.ai-plates'), flash: q('.ai-flash'), burst: q('.ai-burst'),
           streak: q('.ai-streak'), drop: q('.ai-drop'), spark: q('.ai-spark'), point: q('.ai-point'), skip: q('.ai-skip'),
           turb: q('feTurbulence'), disp: q('feDisplacementMap') };
    Object.entries(PLATES).forEach(([k, name]) => {
      const img = new Image();
      img.alt = ''; img.decoding = 'async';
      img.className = k === 'Cl' ? 'ai-half-l' : k === 'Cr' ? 'ai-half-r' : '';
      img.sizes = 'min(138vw, 1800px)';  // the glass width x 1.5: plates zoom up to 160% (quality first, Javed)
      img.srcset = `${BASE}${name}-1200.webp 1200w, ${BASE}${name}-2400.webp 2400w`;
      P[k] = el.plates.appendChild(img);
    });
    // Ready = every plate downloaded and decoded, so nothing pops in or stutters on first paint.
    ready = Promise.all(Object.values(P).map((img) => new Promise((r) => { img.onload = img.onerror = r; }).then(() => img.decode().catch(() => {}))));
    BEATS.forEach((b) => { b.el = block(b.cls, b.w, [['', b.s]]); });
    el.name = block('ai-name', 'JAVED SHAH', [['ai-tag', 'I build AI that keeps working.'], ['ai-role', 'Gen AI system developer and data analyst · Riyadh']]);
    el.skip.addEventListener('click', skip);
    loadSounds();
  }
  const letters = (text) => text.split(' ').map((w) => `<span class="ai-w">${[...w].map((c) => `<span class="ai-c">${c}</span>`).join('')}</span>`).join(' ');
  function block(cls, h, lines) {
    const d = document.createElement('div');
    d.className = `ai-words ${cls || ''}`;
    d.innerHTML = `<h3>${letters(h)}</h3>${lines.map(([c, t]) => `<p class="${c}">${letters(t)}</p>`).join('')}<h3 class="ai-echo">${h}</h3>`;
    return root.querySelector('.ai-beats').appendChild(d);
  }

  // ---------- Sound: the site's own audio context, only when the visitor has Sound effects On ----------
  function loadSounds() {
    const ctx = getAudio();
    if (!ctx || actx) return;
    actx = ctx;
    Object.keys(GAIN).forEach((id) => fetch(`${BASE}sfx/${id}.mp3`).then((r) => r.arrayBuffer())
      .then((b) => actx.decodeAudioData(b)).then((d) => { buf[id] = d; }).catch(() => { /* a missing sound stays silent */ }));
  }
  // Play sound `id` so its moment lands at intro time t; `len` cuts the tail with a quick fade.
  function snd(id, t, len = 1.2, loop = false) {
    if (!master || !buf[id]) return;
    const s = actx.createBufferSource(), g = actx.createGain(), when = a0 + t, off = Math.max(0, actx.currentTime - when);
    const start = Math.max(when, actx.currentTime);
    s.buffer = buf[id]; s.loop = loop;
    g.gain.setValueAtTime(loop ? .0001 : GAIN[id], start);
    if (loop) g.gain.exponentialRampToValueAtTime(GAIN[id], start + .8);
    g.gain.setTargetAtTime(0, start + len - off, loop ? .25 : .06);
    s.connect(g).connect(master); s.start(start, loop ? 0 : off); s.stop(start + len - off + 1.2);
  }
  function audioStart() {
    loadSounds();
    if (!actx || getAudio() !== actx || actx.state !== 'running') return;
    master = actx.createGain(); master.gain.value = .7;
    master.connect(actx.createDynamicsCompressor()).connect(actx.destination);
    a0 = actx.currentTime + .03;
  }
  function audioStop() {
    if (!master) return;
    const m = master; master = null;
    m.gain.setTargetAtTime(0, actx.currentTime, .03);
    setTimeout(() => m.disconnect(), 300);
  }
  // Each starts early by its measured attack, so its loudest moment lands on the frame.
  const S = {
    hit: (t) => snd(116, t - .24, 1.05),      // short bright hit: flashes, each new word, the name
    reveal: (t) => snd(122, t - .76, 1.9),    // big hit: JV rising out of the ripple
    lastWord: (t) => snd(363, t - .62, 2.1),  // AT's "last word lights up" sound: the "Let it run." plate
    rise: (t) => snd(215, t - 1.58, 1.9),     // riser into the logo zoom
    close: (t) => snd(182, t - .1, 1.3),      // the collapse
    last: (t) => snd(289, t - 1.64, 2.4),     // riser into the final flash
    bed: (t, len) => snd(181, t, len, true),  // quiet background loop
  };

  // ---------- Master timeline: every animation is created at once with its start time, so all share one clock ----------
  const at = (e, kf, start, dur, easing = 'ease-out') =>
    anims.push(e.animate(kf, { delay: start * 1000, duration: dur * 1000, fill: 'forwards', easing }));
  const flashAt = (t, peak = 1, dur = .14) => at(el.flash, [{ opacity: peak }, { opacity: 0 }], t, dur, 'linear');
  const punch = (t) => at(el.cam, [{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: .3 }, { transform: 'scale(1.02)' }], t, .35);
  const pull = (t) => at(el.cam, [{ transform: 'scale(1.02)' }, { transform: 'scale(.95)', offset: .45 }, { transform: 'scale(1)' }], t, .45, 'ease-in-out');
  const burstAt = (t) => at(el.burst, [{ opacity: .95, transform: 'scale(.2)' }, { opacity: 0, transform: 'scale(3)' }], t, .32);
  const show = (e, t) => at(e, [{ opacity: 1 }, { opacity: 1 }], t, .01);
  const hide = (e, t, d = .15) => at(e, [{ opacity: 1 }, { opacity: 0 }], t, d);
  const typeOn = (p, t) => p.querySelectorAll('.ai-c').forEach((s, i) => at(s, [{ opacity: 0 }, { opacity: 1 }], t + i * .012, .05, 'linear'));
  const SMEAR = '-.25em 0 .06em rgba(255,255,255,.55), -.6em 0 .12em rgba(56,189,248,.35), -1.1em 0 .2em rgba(56,189,248,.18)';
  const SHARP = '0 0 0 rgba(255,255,255,0), 0 0 0 rgba(56,189,248,0), 0 0 0 rgba(56,189,248,0)';
  const SMEAR_OUT = '.25em 0 .06em rgba(255,255,255,.55), .6em 0 .12em rgba(56,189,248,.35), 1.1em 0 .2em rgba(56,189,248,.18)';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;  // repeatable scatter

  // A verb beat, 1.2 s: flash + punch, the word's own entrance, the small line types on, the plate rushes in from 135%
  // and flies out through the camera on the burst, the word cools to silver, then smears out.
  function beat(b, t) {
    const w = b.el, h = w.querySelector('h3'), p = w.querySelector('p'), echo = w.querySelector('.ai-echo'), cs = h.querySelectorAll('.ai-c');
    flashAt(t); punch(t); show(w, t + .06); S.hit(t);
    if (b.move === 'gather') {
      cs.forEach((s, i) => at(s, [{ opacity: 0, transform: `translate(${rnd() * 3}em, ${rnd() * 1.2}em) rotate(${rnd() * 50}deg) scale(.4)` },
                                  { opacity: 1, transform: 'none' }], t + .08 + i * .022, .34, 'cubic-bezier(.2,.8,.3,1)'));
      at(el.spark, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(2.6)', offset: .35 }, { opacity: .6, transform: 'scale(1)' }], t + .3, .5);
      hide(el.spark, t + 1, .15);
    } else if (b.move === 'slam') {
      at(h, [{ opacity: 0, transform: 'translateX(5%) scale(1.3)', textShadow: SMEAR }, { opacity: 1, transform: 'none', textShadow: SHARP }], t + .1, .26, 'cubic-bezier(.2,1.35,.4,1)');
    } else if (b.move === 'pulse') {
      at(h, [{ opacity: 0, transform: 'translateX(-6%)', textShadow: SMEAR_OUT }, { opacity: 1, transform: 'none', textShadow: SHARP }], t + .1, .22);
      cs.forEach((s, i) => at(s, [{ textShadow: '0 0 0 transparent', filter: 'brightness(1)' },
                                  { textShadow: '0 0 .25em #38BDF8, 0 0 .7em #38BDF8', filter: 'brightness(1.4)', offset: .4 },
                                  { textShadow: '0 0 0 transparent', filter: 'brightness(1)' }], t + .38 + i * .035, .3, 'linear'));
    } else {
      S.lastWord(t + .2);
      at(h, [{ opacity: 0, filter: 'brightness(4) blur(.12em)' }, { opacity: 1, filter: 'brightness(1) blur(0)' }], t + .1, .5);
      at(echo, [{ opacity: 0, transform: 'scale(1.08) translateX(0)' }, { opacity: .22, offset: .3 }, { opacity: .12, transform: 'scale(1.1) translateX(3%)' }], t + .25, .8, 'linear');
    }
    typeOn(p, t + .32);
    b.plate.forEach((k, i) => {
      const x = b.plate.length > 1 ? `translateX(${i ? 7 : -7}%) ` : '';
      at(P[k], [{ opacity: 0, transform: `${x}scale(1.35)`, filter: 'brightness(2)' }, { opacity: 1, offset: .12 },
                { opacity: 1, transform: 'translateX(0) scale(1.06)', filter: 'brightness(1)' }], t + .2, .45, 'cubic-bezier(.15,.85,.3,1)');
      at(P[k], [{ transform: 'scale(1.06)' }, { transform: 'scale(1.14)' }], t + .65, .35, 'linear');
      at(P[k], [{ opacity: 1, transform: 'scale(1.14)', filter: 'brightness(1)' }, { opacity: 0, transform: 'scale(1.6)', filter: 'brightness(2.4)' }], t + 1.0, .2, 'ease-in');
    });
    at(h, [{ color: '#fff' }, { color: '#9FB3C8' }], t + .45, .55, 'ease-in');
    burstAt(t + 1.0); pull(t + 1.0);
    at(h, [{ opacity: 1, transform: 'none', textShadow: SHARP }, { opacity: 0, transform: 'translateX(-9%)', textShadow: SMEAR_OUT }], t + 1.0, .18, 'ease-in');
    hide(p, t + 1.0); hide(echo, t + 1.0, .1);
  }

  function build() {
    seed = 7;
    S.bed(0, LEN + .2); S.hit(0); S.reveal(1.0);
    S.rise(6.9); S.close(8.6); S.last(9.4);
    // 0.0-2.0 Hook: liquid titanium rushes in, a drop of light, rings, then JV rises out of overexposed white.
    flashAt(0); punch(0);
    at(P.A, [{ opacity: 0, transform: 'scale(1.3)' }, { opacity: 1, transform: 'scale(1.04)' }], 0, .5, 'cubic-bezier(.15,.85,.3,1)');
    at(P.A, [{ transform: 'scale(1.04)' }, { transform: 'scale(1.14)' }], .5, .9, 'linear');
    at(el.drop, [{ opacity: 0, transform: 'translateY(-18cqw) scale(.6)' }, { opacity: 1, offset: .3 }, { opacity: 1, transform: 'translateY(0) scale(1)' }], .4, .25, 'ease-in');
    at(el.drop, [{ opacity: 1 }, { opacity: 0, transform: 'scale(2.5)' }], .65, .2);
    root.querySelectorAll('.ai-rings i').forEach((r, i) =>
      at(r, [{ opacity: .95, transform: 'scale(.04)' }, { opacity: 0, transform: 'scale(1.6)' }], .65 + i * .14, 1.1, 'cubic-bezier(.2,.6,.3,1)'));
    flashAt(1.0, .55); punch(1.0);
    at(P.R, [{ opacity: 0, filter: 'brightness(3.2)', transform: 'scale(1.3)' }, { opacity: 1, filter: 'brightness(3.2)', offset: .2 },
             { opacity: 1, filter: 'brightness(1)', transform: 'scale(1.05)' }], 1.0, .45, 'cubic-bezier(.15,.85,.3,1)');
    hide(P.A, 1.1, .2);
    at(P.R, [{ transform: 'scale(1.05)' }, { transform: 'scale(1.16)' }], 1.45, .5, 'linear');
    at(el.streak, [{ opacity: 1, transform: 'translateX(-100%)' }, { opacity: 1, transform: 'translateX(170%)' }], 1.55, .3, 'ease-in-out');
    burstAt(1.9); pull(1.9);
    at(P.R, [{ opacity: 1, transform: 'scale(1.16)', filter: 'brightness(1)' }, { opacity: 0, transform: 'scale(1.6)', filter: 'brightness(2.4)' }], 1.9, .2, 'ease-in');

    // 2.1-6.9 The four verb beats.
    BEATS.forEach((b, i) => beat(b, 2.1 + i * 1.2));

    // 6.9-8.6 End card: the full JV, the camera rushes into it, and it hands over to the close-up behind the name.
    const e = 6.9, n = el.name, h = n.querySelector('h3'), [tag, role] = n.querySelectorAll('p'), echo = n.querySelector('.ai-echo');
    flashAt(e); punch(e); S.hit(e + .6);
    at(P.L, [{ opacity: 0, transform: 'scale(.9)', filter: 'brightness(2)' }, { opacity: 1, transform: 'scale(1)', filter: 'brightness(1)', offset: .3 },
             { opacity: 1, transform: 'scale(2.1)', filter: 'brightness(1.3)' }], e, .5, 'cubic-bezier(.5,0,.85,.4)');
    at(P.F, [{ opacity: 0, filter: 'brightness(1.3)', transform: 'scale(1)' }, { opacity: .75, filter: 'brightness(.6)', transform: 'scale(1.12) translateX(-1%)' }], e + .42, .35);
    hide(P.L, e + .45, .12);
    at(el.streak, [{ opacity: 1, transform: 'translateX(-100%)' }, { opacity: 1, transform: 'translateX(170%)' }], e + .38, .22, 'ease-in-out');
    at(P.F, [{ transform: 'scale(1.12) translateX(-1%)' }, { transform: 'scale(1.2) translateX(-3.5%)' }], e + .77, .93, 'linear');
    show(n, e + .5);
    at(h, [{ opacity: 0, transform: 'translateX(5%) scale(1.25)', textShadow: SMEAR }, { opacity: 1, transform: 'none', textShadow: SHARP }], e + .52, .28, 'cubic-bezier(.2,1.3,.4,1)');
    at(echo, [{ opacity: 0, transform: 'scale(1.06) translateX(0)' }, { opacity: .2, offset: .25 }, { opacity: .1, transform: 'scale(1.08) translateX(3%)' }], e + .65, 1.05, 'linear');
    typeOn(tag, e + .78); typeOn(role, e + 1.08);

    // 8.6-9.4 Collapse to a bright point. 9.4-10 Final flash, then the layer fades and the real About Me text shows.
    const c = 8.6;
    at(el.cam, [{ transform: 'scale(1.02)', filter: 'brightness(1)' }, { transform: 'scale(.003)', filter: 'brightness(3)' }], c, .45, 'cubic-bezier(.6,0,.9,.6)');
    at(el.point, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1.6)', offset: .3 }, { opacity: 1, transform: 'scale(1)' }], c + .38, .35);
    at(el.point, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.2)' }], c + .73, .07, 'ease-in');
    flashAt(9.4, 1, .32);
    at(root, [{ opacity: 1 }, { opacity: 0 }], 9.5, .5);
  }

  // Ripple strength: a slow breathing wave on the plates plus a strong bump when the drop lands. Stops when the intro ends.
  function tick(now) {
    const t = (now - t0) / 1000;
    el.turb.setAttribute('baseFrequency', `${(.004 + .0007 * Math.sin(t * 1.3)).toFixed(5)} ${(.012 + .002 * Math.sin(t * .9)).toFixed(5)}`);
    el.disp.setAttribute('scale', (4 + 22 * Math.exp(-(((t - .85) / .3) ** 2))).toFixed(2));
    if (t < LEN) raf = requestAnimationFrame(tick); else end();
  }

  // Called from showPanel. Returns true when the intro will play (first About Me open of the visit).
  // `onDone` runs when it ends or is skipped (app.js starts the notch flashes then, so they never compete for frames).
  let onDone = null;
  function play(done, again) {  // `again`: the "Play the intro again" button
    prime();
    if ((played && !again) || running || !root) return false;
    played = true; running = true; onDone = done;
    document.documentElement.classList.add('ai-playing');
    root.hidden = false; root.classList.add('ai-warm');  // navy cover; plates painted at near-zero opacity so the GPU has them before frame 1
    addEventListener('keydown', onKey, true);
    // Start after the panel's own 0.5 s zoom-in, once the plates are ready; give up after 2 s rather than keep the visitor waiting.
    const give = new Promise((r) => { waitTimer = setTimeout(() => r('late'), 2000); });
    const go = Promise.all([ready, new Promise((r) => setTimeout(r, 560))]).then(() => 'ok');
    Promise.race([go, give])
      .then((v) => {
        clearTimeout(waitTimer);
        if (!running) return;
        if (v !== 'ok') { end(); return; }
        root.classList.remove('ai-warm');
        audioStart();
        t0 = performance.now();
        build();
        raf = requestAnimationFrame(tick);
      });
    return true;
  }
  function onKey(e) { if (e.key === 'Escape' && running) { e.stopPropagation(); e.preventDefault(); skip(); } }
  function skip() {
    if (!running) return;
    end();
    glass.parentElement.animate([{ filter: 'brightness(2.2)' }, { filter: 'none' }], { duration: 220 });  // a quick flash as it cuts to the text
  }
  // Finish: stop sound and motion, remove the layer, and hand the panel back.
  function end() {
    running = false;
    cancelAnimationFrame(raf); raf = 0; clearTimeout(waitTimer);
    audioStop();
    anims.forEach((a) => a.cancel()); anims = [];
    removeEventListener('keydown', onKey, true);
    document.documentElement.classList.remove('ai-playing');
    if (root) { root.hidden = true; root.classList.remove('ai-warm'); }
    if (onDone) { const d = onDone; onDone = null; d(); }
    const h = glass && glass.parentElement.querySelector('.section.is-active h2');
    if (h && root && root.contains(document.activeElement)) h.focus({ preventScroll: true });
  }
  function stop() { if (running) end(); }

  return { init, prime, play, stop, loadSounds };
})();
