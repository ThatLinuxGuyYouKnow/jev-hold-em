// First-visit explainer tour — 4-step spotlight overlay. No deps.
const KEY = 'jev-tour-seen-v1';

function steps() {
  const isWhot = document.body.classList.contains('mode-whot');
  return [
    {
      sel: '.mode-tabs',
      title: 'Hold\u2019em or WHOT?',
      text: 'You start on Hold\u2019em. Tap \u2717 WHOT any time to switch to Nigerian WHOT vs Jev — your stacks stay separate.',
    },
    {
      sel: isWhot ? '#whotTable' : '.board-area',
      title: isWhot ? 'Match shape or number' : 'The table',
      text: isWhot
        ? 'Play a card matching the pile by shape or number. 1 = hold on, 2/5 = pick debt (blockable), 8 = suspension, 14 = market + request, 20 = WHOT wild.'
        : 'Community cards and pot live here. Switch to WHOT to see the WHOT table instead.',
    },
    {
      sel: isWhot ? '#btnWDraw' : '.action-bar',
      title: isWhot ? 'Draw when stuck' : 'Your actions',
      text: isWhot
        ? 'Playable cards glow green. When nothing matches, this button turns gold, shakes and vibrates — hit Must draw.'
        : 'Fold / Check-Call / Bet live here on your turn.',
    },
    {
      sel: '.panel.brain',
      title: 'Jev\u2019s brain',
      text: 'Jev evaluates typed questions every turn — watch action odds and confidence before it moves.',
    },
  ];
}

let idx = 0, els = null;

function ensureEls() {
  if (els) return els;
  const overlay = document.createElement('div');
  overlay.id = 'tourOverlay';
  overlay.innerHTML = `
    <div id="tourSpot"></div>
    <div id="tourTip" role="dialog" aria-live="polite">
      <div class="tour-dots"></div>
      <h3></h3>
      <p></p>
      <div class="tour-btns">
        <button class="ghost tour-back">← Back</button>
        <button class="ghost tour-skip">Skip</button>
        <button class="primary tour-next">Next →</button>
      </div>
      <label class="tour-again"><input type="checkbox" class="tour-hide" /> Don’t show again</label>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('.tour-back').onclick = () => show(idx - 1);
  overlay.querySelector('.tour-next').onclick = () => show(idx + 1);
  overlay.querySelector('.tour-skip').onclick = done;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) done(); });
  document.addEventListener('keydown', (e) => {
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') done();
    if (e.key === 'ArrowRight') show(idx + 1);
    if (e.key === 'ArrowLeft') show(idx - 1);
  });
  window.addEventListener('resize', () => position());
  els = overlay;
  return els;
}

function position() {
  const ov = ensureEls();
  const s = steps()[idx];
  const tip = ov.querySelector('#tourTip');
  const spot = ov.querySelector('#tourSpot');
  const t = s && document.querySelector(s.sel);
  if (!t) { tip.style.left = '50%'; tip.style.top = '20%'; spot.style.display = 'none'; return; }
  t.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Wait a tick so scroll settles before measuring.
  requestAnimationFrame(() => {
    const r = t.getBoundingClientRect();
    const pad = 8;
    spot.style.display = 'block';
    spot.style.left = `${Math.max(4, r.left - pad)}px`;
    spot.style.top = `${Math.max(4, r.top - pad)}px`;
    spot.style.width = `${r.width + pad * 2}px`;
    spot.style.height = `${r.height + pad * 2}px`;
    const tw = Math.min(320, window.innerWidth - 24);
    tip.style.width = `${tw}px`;
    let top = r.bottom + 12;
    if (top + 220 > window.innerHeight) top = Math.max(12, r.top - 230);
    tip.style.left = `${Math.min(Math.max(12, r.left), window.innerWidth - tw - 12)}px`;
    tip.style.top = `${top}px`;
    if (window.innerWidth <= 640) {
      tip.style.left = '12px'; tip.style.right = '12px';
      tip.style.width = 'auto'; tip.style.top = 'auto'; tip.style.bottom = '12px';
    } else {
      tip.style.bottom = 'auto'; tip.style.right = 'auto';
    }
  });
}

function show(i) {
  const list = steps();
  if (i >= list.length) return done();
  if (i < 0) i = 0;
  idx = i;
  const ov = ensureEls();
  ov.classList.add('open');
  const s = list[idx];
  ov.querySelector('h3').textContent = `${idx + 1}. ${s.title}`;
  ov.querySelector('p').textContent = s.text;
  ov.querySelector('.tour-back').disabled = idx === 0;
  ov.querySelector('.tour-next').textContent = idx === list.length - 1 ? 'Done ✓' : 'Next →';
  const dots = ov.querySelector('.tour-dots');
  dots.innerHTML = '';
  list.forEach((_, k) => {
    const d = document.createElement('i');
    if (k === idx) d.className = 'on';
    dots.appendChild(d);
  });
  position();
}

function done() {
  const ov = ensureEls();
  ov.classList.remove('open');
  try {
    if (ov.querySelector('.tour-hide').checked || true) localStorage.setItem(KEY, '1');
  } catch { /* private mode */ }
}

export function startTour() { show(0); }

export function maybeTour() {
  let seen = null;
  try { seen = localStorage.getItem(KEY); } catch { seen = '1'; }
  if (seen) return;
  setTimeout(() => {
    // Don't hijack mid-hand thinking; still fine to show over it.
    show(0);
  }, 700);
}
