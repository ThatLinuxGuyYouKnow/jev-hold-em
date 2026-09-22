// WHOT vs Jev — UI + game loop. Imported by app.js; say/log/banner injected.
import { WhotGame, SPECIAL, GLYPH, SHAPE_COLOR, PICK_VALUE } from './whot.js';

const $ = (id) => document.getElementById(id);

let _say = () => {}, _log = () => {}, _banner = () => {};
export function whotWire({ say, log, banner } = {}) {
  if (say) _say = say;
  if (log) _log = log;
  if (banner) _banner = banner;
  $('btnWDraw').onclick = playerDraw;
  $('btnWDeal').onclick = () => { if (!W.busy) whotStart(); };
  const cancel = $('btnWCancel');
  if (cancel) cancel.onclick = window.whotCallCancel;
  window.addEventListener('whot-cancel-call', () => {
    if (!W.needCall) return;
    W.needCall = false;
    _say('Call cancelled — pick a card.');
    renderWhot();
  });
}
const say = (...a) => _say(...a);
const log = (...a) => _log(...a);
const banner = (...a) => _banner(...a);

const W = {
  game: null, busy: false, mode: 'holdem',
  stats: { hands: 0, you: 0, jev: 0 },
  seq: [],
  needCall: false, pendingIdx: null,
};

function setThinking(on) {
  const els = [$('jevThinking'), $('wThinking')].filter(Boolean);
  els.forEach((e) => e.classList.toggle('hidden', !on));
}

function cardLabel(c) {
  if (c.r === 20) return 'WHOT ✷';
  const sp = SPECIAL[c.r];
  return `${c.r} ${GLYPH[c.s]}${sp ? ' · ' + sp.split(' — ')[0] : ''}`;
}

function whotCardEl(c, opts = {}) {
  const d = document.createElement('div');
  d.className = 'whot-card s-' + (c.s || 'whot')
    + (opts.faceDown ? ' back' : '') + (opts.small ? ' small' : '')
    + (opts.pickable ? ' pickable' : '') + (opts.dim ? ' dim' : '');
  if (opts.faceDown) { d.innerHTML = '<span class="w-glyph">✷</span>'; return d; }
  const col = SHAPE_COLOR[c.s] || '#111827';
  d.innerHTML = c.r === 20
    ? `<span class="w-rank">20</span><span class="w-glyph" style="color:${col};">✷</span><span class="w-label">WHOT</span>`
    : `<span class="w-rank">${c.r}</span><span class="w-glyph" style="color:${col}">${GLYPH[c.s]}</span><span class="w-label">${(c.s || '').toUpperCase()}</span>`;
  if (opts.pickable) {
    d.dataset.idx = opts.idx;
    d.onclick = () => playerPick(+d.dataset.idx);
    if (c.r === 20) d.title = 'WHOT wild — click to play (auto-calls your strongest shape)';
  }
  return d;
}

// ---------- rendering ----------
function threatText(g, who) {
  const p = g.pendingFor(who);
  if (!p) return '';
  if (p.type === 'debt') {
    const blockers = g.moves(who).length;
    return `⚠ PICK ${p.rank === 2 ? 'TWO' : 'THREE'} ×${p.n} on ${who === 'you' ? 'YOU' : 'JEV'} — ${blockers ? `block with a ${p.rank} or take ${p.n} (miss turn)` : `no ${p.rank} to block — takes ${p.n}`}`;
  }
  const holders = g.moves(who).length;
  return `⏸ SUSPENDED ${who === 'you' ? 'YOU' : 'JEV'} — ${holders ? 'pass back an 8 or serve it' : 'no 8 — serves it'}`;
}

export function renderWhot() {
  const g = W.game;
  if (!g || W.mode !== 'whot') return;
  $('wJevCount').textContent = g.jev.length;
  $('wJevStack').textContent = 6 - g.jev.length;
  $('wYouStack').textContent = 6 - g.you.length;
  $('wMarket').textContent = g.market.length;
  $('wHandMeta').textContent = '';

  const topEl = $('wPile'); topEl.innerHTML = '';
  topEl.appendChild(whotCardEl(g.top));
  const cs = $('wCalledSuit');
  cs.textContent = g.calledSuit ? `must play ${GLYPH[g.calledSuit]} ${g.calledSuit}` : '';
  const threat = $('wThreat');
  if (threat) {
    const t = threatText(g, g.turn);
    threat.textContent = t;
    threat.classList.toggle('hidden', !t);
  }

  const jevRow = $('wJevCards'); jevRow.innerHTML = '';
  g.jev.forEach(() => jevRow.appendChild(whotCardEl({}, { faceDown: true, small: true })));
  const youRow = $('wYouCards'); youRow.innerHTML = '';
  g.you.forEach(() => youRow.appendChild(whotCardEl({}, { faceDown: true, small: true })));

  const hand = $('wHand'); hand.innerHTML = '';
  const myTurn = g.turn === 'you' && !W.busy && !W.needCall && !g.over;
  g.you.forEach((c, i) => {
    const playable = g.canPlay('you', c);
    hand.appendChild(whotCardEl(c, { pickable: myTurn && playable, idx: i, dim: !playable }));
  });

  // Draw button doubles as the market + the take/serve button.
  const db = $('btnWDraw');
  const p = g.pendingFor('you');
  db.classList.remove('danger');
  if (!myTurn) {
    db.disabled = true;
    db.innerHTML = `Draw <span class="w-deck-ico">▤</span> <b>${g.market.length}</b>`;
  } else if (p?.type === 'debt') {
    db.disabled = false;
    db.classList.add('danger');
    db.innerHTML = `Take ${p.n} <span class="w-deck-ico">▤</span> · miss turn`;
  } else if (p?.type === 'suspend') {
    db.disabled = false;
    db.innerHTML = `Serve suspension <span class="w-deck-ico">⏸</span>`;
  } else {
    db.disabled = false;
    db.innerHTML = `Draw <span class="w-deck-ico">▤</span> <b>${g.market.length}</b>`;
  }
  $('btnWDeal').disabled = W.busy;
  $('wCallBar').classList.toggle('hidden', !W.needCall);
  renderSeq();
}

function renderSeq() {
  const el = $('wSeq'); if (!el) return;
  el.innerHTML = '';
  W.seq.slice(-10).forEach((s) => {
    const d = document.createElement('div');
    d.textContent = s;
    el.appendChild(d);
  });
}

// ---------- turn router ----------
function beginTurn(who, note) {
  const g = W.game;
  if (!g || g.over || W.mode !== 'whot') return;
  if (who === 'you') {
    const p = g.pendingFor('you');
    if (p && !g.moves('you').length) {
      // No defence in hand — forced take/serve, no click needed.
      if (p.type === 'debt') return autoTakeDebt('you');
      return autoServe('you');
    }
    if (p?.type === 'debt') say(`⚠ PICK ${p.rank === 2 ? 'TWO' : 'THREE'} ×${p.n} on you — click a ${p.rank} to BLOCK, or Take ${p.n} (miss turn).`);
    else if (p?.type === 'suspend') say('⏸ You are SUSPENDED — click an 8 to pass it back, or Serve it.');
    else say(note || `Your move — top ${cardLabel(g.top)}. Match shape/number, or draw.`);
    renderWhot();
  } else {
    const p = g.pendingFor('jev');
    if (p && !g.moves('jev').length) {
      renderWhot();
      if (p.type === 'debt') return autoTakeDebt('jev');
      return autoServe('jev');
    }
    say(note || threatText(g, 'jev') || 'Jev to move…');
    renderWhot();
    setTimeout(jevWhotTurn, 850);
  }
}

function autoTakeDebt(who) {
  const g = W.game;
  const r = g.takeDebt(who);
  if (!r) { beginTurn(g.turn); return; }
  W.seq.push(`${who} takes pick debt (+${r.drew}) — misses turn`);
  log(`${who === 'you' ? 'You take' : 'Jev takes'} ${r.drew} and miss${who === 'you' ? '' : 'es'} the turn.`, who === 'you' ? 'you' : 'jev');
  say(`${who === 'you' ? 'You take' : 'Jev takes'} ${r.drew} — ${r.by === 'you' ? 'your' : "Jev's"} play${r.by === who ? '' : ' (replay)'}.`);
  beginTurn(r.by);
}

function autoServe(who) {
  const g = W.game;
  g.acceptSuspend(who);
  W.seq.push(`${who} serves suspension — misses turn`);
  log(`${who === 'you' ? 'You serve' : 'Jev serves'} the suspension (misses turn).`, who === 'you' ? 'you' : 'jev');
  say(`${who === 'you' ? 'Suspended — you miss' : 'Jev is suspended — misses'} the turn.`);
  beginTurn(g.turn);
}

// ---------- your moves ----------
function playerPick(idx) {
  if (W.busy || W.needCall || !W.game || W.game.turn !== 'you') return;
  const g = W.game;
  const c = g.you[idx];
  if (!g.canPlay('you', c)) return;
  clearTimeout(W._drawnPlayTimer);
  if (c.r === 20) {
    const counts = {};
    g.you.forEach((x) => { if (x.r !== 20) counts[x.s] = (counts[x.s] || 0) + 1; });
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    doPlay(idx, best ? best[0] : 'circle');
    return;
  }
  doPlay(idx, null);
}

window.whotCall = (shape) => {
  if (!W.needCall) return;
  W.needCall = false;
  renderWhot();
  doPlay(W.pendingIdx, shape);
};

window.whotCallCancel = () => {
  if (!W.needCall) return;
  W.needCall = false;
  W.pendingIdx = null;
  say('Call cancelled — pick a card.');
  renderWhot();
};

function playerDraw() {
  if (W.busy || !W.game || W.game.turn !== 'you' || W.needCall) return;
  const g = W.game;
  const p = g.pendingFor('you');
  if (p?.type === 'debt') return autoTakeDebt('you');   // Take N, miss turn
  if (p?.type === 'suspend') return autoServe('you');   // Serve it
  const c = g.draw('you');
  if (!c) { say('Market empty. Pass.'); g.turn = 'jev'; beginTurn('jev'); return; }
  W.seq.push(`you draw ${cardLabel(c)}${g.canPlay('you', c) ? ' (playable — your go)' : ' (passes)'}`);
  log(`You draw ${cardLabel(c)}.`, 'you');
  if (g.canPlay('you', c)) {
    say(`You drew ${cardLabel(c)} — it plays! Click it within 6s or the turn passes.`);
    renderWhot();
    clearTimeout(W._drawnPlayTimer);
    W._drawnPlayTimer = setTimeout(() => {
      if (W.game === g && g.turn === 'you' && !g.over && W.mode === 'whot' && !W.busy) {
        log('Turn passes — Jev to move.', 'you');
        g.turn = 'jev';
        beginTurn('jev');
      }
    }, 6000);
  } else {
    g.turn = 'jev';
    say('No play — you drew. Jev to move.');
    beginTurn('jev');
  }
}

function doPlay(idx, callShape) {
  const g = W.game;
  clearTimeout(W._drawnPlayTimer);
  const ev = g.play('you', idx, callShape);
  if (!ev) return;
  W.seq.push(`you play ${cardLabel(ev.card)}${ev.calledSuit ? ' → ' + ev.calledSuit : ''}${ev.debtSet ? ` (debt ×${ev.debtSet.n})` : ''}`);
  log(describePlay(ev, 'you'), 'you');
  applyEvent(ev);
}

function describePlay(ev, who) {
  const actor = who === 'you' ? 'You play' : 'Jev plays';
  let m = `${actor} ${cardLabel(ev.card)}`;
  if (ev.calledSuit) m += ` calling ${ev.calledSuit}`;
  if (ev.debtSet) m += ` — PICK ${ev.debtSet.rank === 2 ? 'TWO' : 'THREE'} ×${ev.debtSet.n}!`;
  if (ev.suspendSet) m += ' — SUSPENSION!';
  if (ev.marketDraws) m += ` — market: ${ev.marketDraws.who === 'you' ? 'you draw' : 'Jev draws'} ${ev.marketDraws.n}`;
  if (ev.winner) m += ' — OUT! 🏁';
  return m;
}

function applyEvent(ev) {
  const g = W.game;
  if (ev.winner) { finish(ev.winner); return; }
  if (ev.card.r === 1) return beginTurn(ev.who, 'Hold on — play again!');
  beginTurn(g.turn);
}

function finish(winner) {
  W.game.over = true;
  W.stats.hands++;
  if (winner === 'you') { W.stats.you++; say('You empty your hand — WHOT win! 🎉'); banner('You win the WHOT game! 🎉'); }
  else { W.stats.jev++; say('Jev goes out first. Jev wins.'); banner('Jev wins the WHOT game.'); }
  log(winner === 'you' ? '— WHOT: you win —' : '— WHOT: Jev wins —', winner === 'you' ? 'you' : 'jev');
  $('wStats').textContent = `games ${W.stats.hands} · you ${W.stats.you} · Jev ${W.stats.jev}`;
  setThinking(false);
  renderWhot();
}

// ---------- Jev ----------
function buildJevState() {
  const g = W.game;
  const playable = g.moves('jev');
  const p = g.pendingFor('jev');
  const choices = {};
  playable.forEach((m, k) => {
    const c = m.card;
    choices[`p${k}`] = c.r === 20
      ? 'play 20 WHOT (wild; you then call a shape to land on the human)'
      : `play ${c.r} ${GLYPH[c.s]}${SPECIAL[c.r] ? ' — ' + SPECIAL[c.r] : ''}`;
  });
  if (p?.type === 'debt') choices.take = `take the debt: draw ${p.n} and MISS your turn`;
  else if (p?.type === 'suspend') choices.serve = 'serve the suspension: MISS your turn';
  else if (playable.length < 2) choices.draw = 'draw from the market and pass';

  let instructions = 'WHOT (Nigerian shedding game). Match top by SHAPE or NUMBER. 1 = play again. 20 = wild (call a shape). Empty your hand first. Which move?';
  if (p?.type === 'debt') instructions = `PICK ${p.rank === 2 ? 'TWO' : 'THREE'} ×${p.n} is on YOU. Block it by playing a ${p.rank}, or TAKE it (draw ${p.n}, miss your turn) and let the human replay. Which move?`;
  else if (p?.type === 'suspend') instructions = 'You are SUSPENDED. Pass it back with an 8, or SERVE it (miss your turn) and let the human replay. Which move?';

  const questions = {
    action: { type: 'choice', instructions, criteria: choices },
    handStrength: {
      type: 'score',
      instructions: 'How is your position?',
      criteria: ['behind — human is shedding faster', 'even', 'ahead — closing out'],
    },
    playerClose: {
      type: 'boolean',
      instructions: 'Is the human about to go out (few cards left / just played aggressively)?',
    },
  };
  const state = {
    gameType: 'whot-2p',
    topCard: g.top.r === 20 ? `20 WHOT — you must play ${g.calledSuit}` : `${g.top.r} ${GLYPH[g.top.s]}`,
    mustPlayShape: g.calledSuit || null,
    pendingDebt: p?.type === 'debt' ? { n: p.n, rank: p.rank } : null,
    pendingSuspend: p?.type === 'suspend' || null,
    jevHand: g.jev.map((c, i) => ({
      i,
      card: c.r === 20 ? '20 WHOT (wild)' : `${c.r} ${GLYPH[c.s]}`,
      shape: c.s, rank: c.r,
      legalNow: g.canPlay('jev', c),
      special: SPECIAL[c.r] || null,
    })),
    humanHandSize: g.you.length,
    marketRemaining: g.market.length,
    moveHistory: W.seq.slice(-12),
    playerChat: $('chat').value.trim(),
  };
  return { state, questions, choices, playable };
}

async function jevWhotTurn() {
  const g = W.game;
  if (!g || g.over || W.mode !== 'whot' || W.busy || g.turn !== 'jev') return;
  W.busy = true;
  setThinking(true);
  say('Jev is evaluating…');
  const { state, questions, choices, playable } = buildJevState();
  let out = null;
  try {
    const r = await fetch('/api/jev', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, questions }),
    });
    out = await r.json();
  } catch (e) { out = null; }
  setThinking(false);
  W.busy = false;
  if (g.over || W.mode !== 'whot') return;

  let moveKey = 'draw';
  let reason = 'fallback';
  if (out?.answers?.action?.choice != null) {
    const key = String(out.answers.action.choice);
    if (choices[key]) { moveKey = key; reason = out.reason || `jev=${key}`; }
    else { moveKey = playable.length ? 'p0' : firstExtra(choices); reason = `illegal move '${key}' → fallback`; }
  } else {
    moveKey = playable.length ? 'p0' : firstExtra(choices);
    reason = 'gateway unreachable — heuristic fallback';
  }

  // Confidence gate: unsure + spending a special/block → downshift to a plain card.
  const conf = out?.confidence?.action ?? 0;
  const prob = out?.answers?.action?.probabilities?.[moveKey] ?? 0;
  if (out && moveKey.startsWith('p') && (conf < 0.6 || prob < 0.7)) {
    const plainIdx = playable.findIndex((m) => !SPECIAL[m.card.r] && m.card.r !== 20);
    if (plainIdx >= 0 && `p${plainIdx}` !== moveKey) {
      moveKey = `p${plainIdx}`;
      reason += ' → LOW CONF: holds special, plays plain';
    } else if (moveKey !== 'draw') {
      reason += ' → LOW CONF: special kept anyway (nothing plain)';
    }
  }

  paintWhotBrain(out, choices, moveKey);

  if (moveKey === 'take') return autoTakeDebt('jev');
  if (moveKey === 'serve') return autoServe('jev');
  if (moveKey === 'draw') {
    const c = g.draw('jev');
    W.seq.push(`jev draw${c ? ' ' + cardLabel(c) : ' (market dry)'} — passes`);
    log(`Jev draws from market (${g.jev.length} cards).`, 'jev');
    say(c ? 'Jev draws — no play. Your move.' : 'Market empty — Jev passes. Your move.');
    g.turn = 'you';
    beginTurn('you');
    return;
  }

  const m = playable[+moveKey.slice(1)];
  if (!m) { g.turn = 'you'; beginTurn('you'); return; }
  let callShape = null;
  if (m.card.r === 20) {
    const counts = {};
    g.jev.forEach((x) => { if (x.r !== 20) counts[x.s] = (counts[x.s] || 0) + 1; });
    callShape = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'circle';
  }
  const ev = g.play('jev', m.idx, callShape);
  if (!ev) { g.turn = 'you'; beginTurn('you'); return; }
  W.seq.push(`jev play ${cardLabel(ev.card)}${ev.calledSuit ? ' → ' + ev.calledSuit : ''}${ev.debtSet ? ` (debt ×${ev.debtSet.n})` : ''}`);
  log(describePlay(ev, 'jev'), 'jev');
  applyEvent(ev);
}

function firstExtra(choices) {
  return ['take', 'serve', 'draw'].find((k) => choices[k]) || 'draw';
}

function paintWhotBrain(out, choices, moveKey) {
  $('brainEmpty').classList.add('hidden');
  $('brain').classList.remove('hidden');
  if ($('fbBadge')) $('fbBadge').classList.toggle('hidden', !!out);
  const probs = (out?.answers?.action?.probabilities) || {};
  const box = $('actionBars'); box.innerHTML = '';
  const conf = (out?.confidence?.action) ?? 0;
  const answered = out?.answers?.action?.choice;
  const short = (s) => (s || '').replace(' — ', ' · ').replace('play ', '').slice(0, 10);
  for (const k of Object.keys(choices)) {
    const pr = probs[k] ?? 0;
    const row = document.createElement('div');
    row.className = 'bar-row' + (k === answered || (k === moveKey && answered == null) ? ' top' : '');
    row.innerHTML = `<span title="${choices[k]}" style="overflow:hidden;">${short(choices[k])}</span><div class="track"><i style="width:${Math.round(pr * 100)}%"></i></div><span>${pr.toFixed(2)}</span>`;
    box.appendChild(row);
  }
  const str = out?.answers?.handStrength?.score;
  $('mShove').textContent = '–'; $('barShove').style.width = '0%';
  $('mStr').textContent = str == null ? '–' : `${str} / 2`;
  $('barStr').style.width = `${((str ?? 1) / 2) * 100}%`;
  const pc = out?.answers?.playerClose?.probability;
  $('mBluff').textContent = pc == null ? '–' : pc.toFixed(2);
  $('barBluff').style.width = `${(pc ?? 0) * 100}%`;
  $('mConf').textContent = conf.toFixed(2) + (conf < 0.6 ? ' (unsure)' : ' (decisive)');
  $('barConf').style.width = `${conf * 100}%`;
  $('latency').textContent = out ? `${out.ms}ms` : '0ms';
  $('reason').textContent = (out?.reason) || '';
  const u = (out?.usage) || {};
  $('usage').textContent = out
    ? `tokens in/out: ${u.inputTokens ?? '?'} / ${u.outputTokens ?? '?'}${out.fallback ? ' · fallback' : ''}`
    : 'gateway unreachable — heuristic fallback';
}

// ---------- lifecycle ----------
export function whotStart() {
  clearTimeout(W._drawnPlayTimer);
  W.game = new WhotGame();
  W.seq = [];
  W.needCall = false; W.pendingIdx = null;
  log('— WHOT: new game (60-card deck, 6 cards each, you lead) —');
  say(`WHOT! Top card: ${W.game.top.r} ${GLYPH[W.game.top.s]}. Play a matching shape/number, or draw.`);
  renderWhot();
}

export function setMode(mode) {
  W.mode = mode;
  document.body.classList.toggle('mode-whot', mode === 'whot');
  $('whotTable').classList.toggle('hidden', mode !== 'whot');
  $('holdemTable').classList.toggle('hidden', mode === 'whot');
  if (mode === 'whot') whotStart();
}

export function blockHoldem() { return W.mode === 'whot'; }
