// JV regression check (Omar, 2026-11-01). Paste into the browser console on the site and do not touch the mouse for
// about 30 s. It waits for the idle JV show, then checks the two bugs Javed found stay fixed:
//   1. the mouse leaving the capsule/menu box during the show must not snap JV back (close() guard for 'jv');
//   2. hovering the capsule during the 1 s landing must not open the menu early.
// Result: logged to the console and kept in window.__jvCheck.
(async () => {
  const s = document.getElementById('stage'), widget = document.getElementById('widget'), btn = document.getElementById('explore');
  const until = (ok, ms) => new Promise((res) => {
    const t0 = performance.now();
    const iv = setInterval(() => { if (ok() || performance.now() - t0 > ms) { clearInterval(iv); res(ok()); } }, 20);
  });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = window.__jvCheck = { results: [], done: false };
  const check = (name, pass, detail) => { out.results.push({ name, pass, detail }); console[pass ? 'log' : 'error'](`${pass ? 'PASS' : 'FAIL'} ${name}: ${detail}`); };

  if (!(await until(() => s.dataset.show === 'jvf', 40000))) { check('show starts', false, `state ${s.dataset.state}; keep the mouse still`); out.done = true; return; }
  // The menu's leave timer is 10 s and the show lasts about 11 s, so a "mouse left" sent now would fire inside the show.
  widget.dispatchEvent(new PointerEvent('pointerleave', { pointerType: 'mouse' }));
  const seen = [];
  await until(() => { const k = `${s.dataset.state}/${s.dataset.show || ''}`; if (seen[seen.length - 1] !== k) seen.push(k); return s.dataset.show === 'jvland' || s.dataset.state !== 'jv'; }, 15000);
  check('mouse leaving the box keeps the show', s.dataset.show === 'jvland', seen.join(' > '));

  if (s.dataset.show !== 'jvland') { out.done = true; return; }
  btn.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
  await wait(400);
  check('hover during the landing waits', s.dataset.state === 'rest' && s.dataset.show === 'jvland', `state ${s.dataset.state}, show ${s.dataset.show}`);
  out.done = true;
})();
