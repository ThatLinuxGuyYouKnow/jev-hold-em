import { newDeck, evaluate7, compareScores, SUIT_CLASS } from './poker.js';
import { setMode as whotSetMode, blockHoldem, whotWire } from './whot-ui.js';
import { maybeTour, startTour } from './tour.js';

const $ = (id) => document.getElementById(id);
const CHIP = '₦';
const SB = 5, BB = 10;

const M = {
  heroStack: 1000, jevStack: 1000, handNo: 0, button: 0, // 0 = you are button/SB, alternates
  heroHole: [], jevHole: [], board: [], pot: 0,
  heroBet: 0, jevBet: 0, heroActed: false, jevActed: false,
  street: 'preflop', live: false, busy: false,
  histories: [], // strings like "preflop: hero raises to 40" + "turn: you say ..."
  _chatLogged: '', // last chat text already snapshotted into histories
  stats: { hands: 0, you: 0, jev: 0 },
};

const STREETS = ['preflop', 'flop', 'turn', 'river'];

// ---------- rendering ----------
function cardEl(card, faceDown = false) {
  const d = document.createElement('div');
  if (faceDown) { d.className = 'card back'; d.innerHTML = '&nbsp;'; return d; }
  const rank = card[0], suit = card.slice(-1);
  d.className = 'card' + ((suit === '♥' || suit === '♦') ? ' red' : '');
  d.innerHTML = `<span>${rank}</span><span class="suit">${suit}</span>`;
  return d;
}

function render(revealJev = false) {
  $('heroStack').textContent = M.heroStack;
  $('jevStack').textContent = M.jevStack;
  $('pot').textContent = M.pot;
  $('streetLabel').textContent = M.live ? `${M.street.toUpperCase()} · hand #${M.handNo}` : '';
  $('heroBet').textContent = M.heroBet > 0 ? `bet ${CHIP}${M.heroBet}` : '';
  $('jevBet').textContent = M.jevBet > 0 ? `bet ${CHIP}${M.jevBet}` : '';
  $('dealerYou').classList.toggle('hidden', M.button !== 0 || !M.live);
  $('dealerJev').classList.toggle('hidden', M.button !== 1 || !M.live);

  const hc = $('heroCards'); hc.innerHTML = '';
  M.heroHole.forEach((c) => hc.appendChild(cardEl(c)));
  const jc = $('jevCards'); jc.innerHTML = '';
  M.jevHole.forEach((c) => jc.appendChild(cardEl(c, !revealJev && M.live)));
  // Mid-hand the bot's cards stay hidden behind its avatar (decorative backs);
  // the row below its plate only appears at showdown / when revealed.
  jc.style.display = (revealJev || !M.live) ? '' : 'none';
  const hb = document.querySelector('.hole-backing');
  if (hb) hb.style.display = (jc.style.display !== 'none' && M.jevHole.length) ? 'none' : '';
  const b = $('board'); b.innerHTML = '';
  M.board.forEach((c) => b.appendChild(cardEl(c)));

  $('statHands').textContent = M.stats.hands;
  $('statYou').textContent = (M.stats.you >= 0 ? '+' : '') + M.stats.you;
  $('statJev').textContent = (M.stats.jev >= 0 ? '+' : '') + M.stats.jev;
  if ($('potMirror')) $('potMirror').textContent = M.pot;
  if ($('heroStackMirror')) $('heroStackMirror').textContent = M.heroStack;
  updateControls();
}

function log(msg, cls = '') {
  const el = document.createElement('div');
  if (cls) el.className = cls;
  el.textContent = msg;
  $('log').prepend(el);
}

function say(msg) {
  const t = $('tableMsg'); if (t) t.textContent = msg;
  const w = $('wMsg'); if (w) w.textContent = msg; // both targets; mode CSS shows the right one
}

function banner(msg, ms = 2600) {
  const b = $('banner');
  b.textContent = msg; b.classList.remove('hidden');
  clearTimeout(b._t);
  b._t = setTimeout(() => b.classList.add('hidden'), ms);
}

function toCallFor(who) {
  return who === 'hero' ? M.jevBet - M.heroBet : M.heroBet - M.jevBet;
}

function updateControls() {
  const toCall = toCallFor('hero');
  const canAct = M.live && !M.busy && M.street !== 'showdown' && !blockHoldem();
  const myTurn = canAct && isHeroTurn();
  $('btnDeal').disabled = M.live || M.busy || blockHoldem();
  $('btnFold').disabled = !myTurn || toCall === 0;
  $('btnCheckCall').disabled = !myTurn;
  $('btnCheckCall').innerHTML = toCall > 0 ? `Call ${CHIP}${Math.min(toCall, M.heroStack)}` : '○ Check';
  $('btnBetRaise').disabled = !myTurn || M.heroStack <= toCall || blockHoldem();
  $('btnAllIn').disabled = !myTurn || M.heroStack <= 0 || blockHoldem();
  const slider = $('sizeSlider');
  slider.max = Math.max(10, M.heroStack);
  slider.value = Math.min(+slider.value || 20, M.heroStack);
  $('sizeVal').textContent = slider.value;
  $('btnBetRaise').innerHTML = toCall > 0
    ? `Raise`
    : `◉ Bet ${CHIP}${slider.value}`;
}

// ---------- turn order ----------
function firstActor() { return M.button === 0 ? 'hero' : 'jev'; }       // preflop: button acts first
function postflopFirst() { return M.button === 0 ? 'jev' : 'hero'; }    // postflop: BB acts first
let awaiting = null; // 'hero' | 'jev' | null

function isHeroTurn() { return awaiting === 'hero'; }

// ---------- hand lifecycle ----------
function startHand() {
  if (M.heroStack <= 0 || M.jevStack <= 0) { resetMatch(); return; }
  M.handNo++;
  const deck = newDeck();
  M.heroHole = [deck.pop(), deck.pop()];
  M.jevHole = [deck.pop(), deck.pop()];
  M._deck = deck;
  M.board = []; M.pot = 0; M.heroBet = 0; M.jevBet = 0;
  M.heroActed = false; M.jevActed = false;
  M.street = 'preflop'; M.live = true; M.histories = [];
  M._chatLogged = $('chat').value.trim().slice(0, 120); // baseline: only NEW talk gets logged
  // blinds: button = SB
  const sbP = M.button === 0 ? 'hero' : 'jev';
  const bbP = M.button === 0 ? 'jev' : 'hero';
  postBlind(sbP, SB); postBlind(bbP, BB);
  log(`- Hand #${M.handNo} (${M.button === 0 ? 'you' : 'Jev'} on the button) -`);
  log(`Blinds: ${sbP === 'hero' ? 'you' : 'Jev'} ${CHIP}${SB}, ${bbP === 'hero' ? 'you' : 'Jev'} ${CHIP}${BB}`);
  say(`Your hole: ${M.heroHole.join(' ')}. Action on ${firstActor() === 'hero' ? 'you' : 'Jev'}.`);
  awaiting = firstActor();
  render();
  if (awaiting === 'jev') jevTurn();
}

function postBlind(who, amt) {
  const stack = who === 'hero' ? M.heroStack : M.jevStack;
  const put = Math.min(amt, stack);
  if (who === 'hero') { M.heroStack -= put; M.heroBet += put; }
  else { M.jevStack -= put; M.jevBet += put; }
  M.pot += put;
}

function resetMatch() {
  M.heroStack = 1000; M.jevStack = 1000; M.handNo = 0; M.button = 0;
  M.stats = { hands: 0, you: 0, jev: 0 };
  M.live = false;
  say('New match. Press Deal.');
  render();
}

// ---------- betting ----------
function commit(who, additional) {
  const stack = who === 'hero' ? M.heroStack : M.jevStack;
  const put = Math.min(additional, stack);
  if (who === 'hero') { M.heroStack -= put; M.heroBet += put; }
  else { M.jevStack -= put; M.jevBet += put; }
  M.pot += put;
  return put;
}

function roundComplete() {
  return M.heroActed && M.jevActed && M.heroBet === M.jevBet;
}

function someoneAllIn() {
  return (M.heroStack === 0 || M.jevStack === 0) && M.heroBet === M.jevBet;
}

function hist(who, text) {
  M.histories.push(`${M.street}: ${who} ${text}`);
}

// Snapshot the table-talk box into the street history (deduped).
// Called on every hero action + street change, so Jev sees the SEQUENCE
// of your story ("flop: you say ..." then "turn: you say ..."), not just
// the latest line.
function noteChat() {
  const text = $('chat').value.trim().slice(0, 120);
  if (text && text !== M._chatLogged) {
    M._chatLogged = text;
    M.histories.push(`${M.street}: you say "${text}"`);
    log(`You say: "${text}"`, 'you');
  }
}

function playerAct(kind) {
  if (!isHeroTurn() || M.busy) return;
  noteChat(); // table talk accompanies the action
  const toCall = toCallFor('hero');
  if (kind === 'fold') {
    if (toCall === 0) return;
    hist('you', 'fold');
    endHand('jev', 'You fold. Jev takes it.');
    return;
  }
  if (kind === 'checkcall') {
    if (toCall > 0) { commit('hero', toCall); hist('you', `call ${CHIP}${toCall}`); log(`You call ${CHIP}${toCall}.`, 'you'); }
    else { hist('you', 'check'); log('You check.', 'you'); }
    M.heroActed = true;
  }
  if (kind === 'betraise') {
    const size = Math.min(+$('sizeSlider').value, M.heroStack);
    if (toCall > 0) {
      const total = Math.min(toCall + size, M.heroStack);
      commit('hero', total);
      hist('you', `raise to ${CHIP}${M.heroBet}`);
      log(`You raise to ${CHIP}${M.heroBet}.`, 'you');
      M.jevActed = false; // re-open Jev's action
    } else {
      commit('hero', size);
      hist('you', `bet ${CHIP}${M.heroBet}`);
      log(`You bet ${CHIP}${M.heroBet}.`, 'you');
      M.jevActed = false;
    }
    M.heroActed = true;
  }
  if (kind === 'allin') {
    commit('hero', M.heroStack);
    hist('you', `ALL-IN ${CHIP}${M.heroBet}`);
    log(`You shove ALL-IN ${CHIP}${M.heroBet}!`, 'you');
    M.heroActed = true; M.jevActed = false;
  }
  afterAction('hero');
}

function afterAction(who) {
  render();
  if (M.heroStack === 0 || M.jevStack === 0) {
    // all-in: run the board out
    if (M.heroBet === M.jevBet) return runOut();
    // the other side still must respond (call/fold) - fall through
  }
  if (roundComplete()) { nextStreet(); return; }
  awaiting = who === 'hero' ? 'jev' : 'hero';
  if (awaiting === 'jev') jevTurn();
  else { say(`Your move - ${describeSpot()}`); render(); }
}

function describeSpot() {
  const tc = toCallFor('hero');
  return tc > 0 ? `to call ${CHIP}${Math.min(tc, M.heroStack)} (pot ${CHIP}${M.pot})` : `pot ${CHIP}${M.pot}, check or bet`;
}

// ---------- Jev ----------
async function jevTurn() {
  awaiting = 'jev';
  M.busy = true;
  $('jevThinking').classList.remove('hidden');
  say('Jev is evaluating…');
  render();
  const state = {
    game: 'jev-holdem heads-up no-limit (demo)',
    street: M.street,
    board: M.board,
    jevHole: M.jevHole,
    pot: M.pot,
    toCall: toCallFor('jev'),
    jevStack: M.jevStack,
    playerStack: M.heroStack,
    playerTableHistory: M.histories, // bets AND sequenced table talk per street
    playerChat: $('chat').value.trim(),
  };
  let out;
  try {
    const r = await fetch('/api/jev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
    out = await r.json();
  } catch (e) {
    say('Network error talking to Jev. Retrying as check…');
    out = null;
  }
  $('jevThinking').classList.add('hidden');
  M.busy = false;
  if (!out || out.error && !out.answers) { // hard failure: check behind / fold to heat
    if (toCallFor('jev') === 0) { M.jevActed = true; hist('jev', 'check (offline)'); }
    else { endHand('hero', 'Jev disconnected - you take it.'); return; }
    afterAction('jev');
    return;
  }
  paintBrain(out);
  const toCall = toCallFor('jev');
  const act = out.executed;
  if (act === 'fold') {
    hist('jev', 'fold');
    log(`Jev folds. (${out.reason})`, 'jev');
    endHand('hero', 'Jev folds. You take the pot.');
    return;
  }
  if (act === 'call') {
    if (toCall > 0) {
      const put = commit('jev', toCall);
      hist('jev', `call ${CHIP}${put}`);
      log(`Jev calls ${CHIP}${put}.`, 'jev');
      say(`Jev calls. ${bluffRead(out)}`);
    } else { hist('jev', 'check'); log('Jev checks.', 'jev'); say(`Jev checks. ${bluffRead(out)}`); }
    M.jevActed = true;
  } else if (act === 'raise') {
    const target = Math.min(Math.max(M.jevBet + toCall, out.amount, M.heroBet), M.jevStack + M.jevBet);
    const add = target - M.jevBet;
    commit('jev', add);
    hist('jev', toCall > 0 ? `raise to ${CHIP}${M.jevBet}` : `bet ${CHIP}${M.jevBet}`);
    log(`Jev ${toCall > 0 ? 'raises to' : 'bets'} ${CHIP}${M.jevBet}.`, 'jev');
    say(`Jev ${toCall > 0 ? 'raises to' : 'bets'} ${CHIP}${M.jevBet}. ${bluffRead(out)}`);
    M.jevActed = true; M.heroActed = false; // re-open hero action
    if (M.jevStack === 0) log('Jev is ALL-IN!', 'jev');
  }
  afterAction('jev');
}

function bluffRead(out) {
  const p = out.answers?.playerBluffing?.probability;
  if (p == null) return '';
  if (p >= 0.8) return 'Jev thinks you are bluffing. 🐟';
  if (p <= 0.2) return 'Jev gives you credit. 🧱';
  return 'Jev is suspicious. 🤨';
}

function paintBrain(out) {
  $('brainEmpty').classList.add('hidden');
  $('brain').classList.remove('hidden');
  $('fbBadge').classList.toggle('hidden', !out.fallback);
  const probs = out.answers.action.probabilities || {};
  const box = $('actionBars'); box.innerHTML = '';
  const conf = out.confidence?.action ?? 0;
  for (const k of ['fold', 'call', 'raise']) {
    const p = probs[k] ?? 0;
    const row = document.createElement('div');
    row.className = 'bar-row' + (out.answers.action.choice === k ? ' top' : '');
    row.innerHTML = `<span>${k}</span><div class="track"><i style="width:${Math.round(p * 100)}%"></i></div><span>${p.toFixed(2)}</span>`;
    box.appendChild(row);
  }
  $('mShove').textContent = (out.answers.shove?.probability ?? 0).toFixed(2);
  $('barShove').style.width = `${(out.answers.shove?.probability ?? 0) * 100}%`;
  $('mStr').textContent = `${out.answers.handStrength?.score ?? '–'} / 2`;
  $('barStr').style.width = `${((out.answers.handStrength?.score ?? 0) / 2) * 100}%`;
  $('mBluff').textContent = (out.answers.playerBluffing?.probability ?? 0).toFixed(2);
  $('barBluff').style.width = `${(out.answers.playerBluffing?.probability ?? 0) * 100}%`;
  $('mConf').textContent = conf.toFixed(2) + (conf < 0.6 ? ' (low → pot-control)' : ' (high → execute)');
  $('barConf').style.width = `${conf * 100}%`;
  $('latency').textContent = `${out.ms}ms`;
  $('reason').textContent = out.reason || '';
  const u = out.usage || {};
  $('usage').textContent = `tokens in/out: ${u.inputTokens ?? '?'} / ${u.outputTokens ?? '?'}${out.fallback ? ' · heuristic fallback (gateway unreachable)' : ''}`;
}

// ---------- streets / showdown ----------
function nextStreet() {
  M.heroBet = 0; M.jevBet = 0;
  M.heroActed = false; M.jevActed = false;
  const i = STREETS.indexOf(M.street);
  if (i >= 3) { showdown(); return; }
  M.street = STREETS[i + 1];
  noteChat(); // catch talk typed while Jev was "thinking" on the prior street
  if (M.street === 'flop') M.board.push(M._deck.pop(), M._deck.pop(), M._deck.pop());
  if (M.street === 'turn' || M.street === 'river') M.board.push(M._deck.pop());
  log(`${M.street.toUpperCase()}: ${M.board.join(' ')}`);
  awaiting = postflopFirst();
  say(`${M.street.toUpperCase()}: ${M.board.join(' ')}. ${awaiting === 'hero' ? 'Your move.' : 'Jev to act.'}`);
  render();
  if (someoneAllIn()) return runOut();
  if (awaiting === 'jev') jevTurn();
}

function runOut() {
  M.busy = true; render();
  const deal = () => {
    if (M.street === 'preflop') { M.board.push(M._deck.pop(), M._deck.pop(), M._deck.pop()); M.street = 'flop'; }
    else if (M.street === 'flop') { M.board.push(M._deck.pop()); M.street = 'turn'; }
    else if (M.street === 'turn') { M.board.push(M._deck.pop()); M.street = 'river'; }
    else { showdown(); return; }
    log(`${M.street.toUpperCase()}: ${M.board.join(' ')}`);
    render(true);
    setTimeout(deal, 650);
  };
  say('All-in - running out the board…');
  setTimeout(deal, 650);
}

function endHand(winner, msg) {
  if (winner === 'hero') { M.heroStack += M.pot; M.stats.you += M.pot - 0; }
  else { M.jevStack += M.pot; }
  settle(msg, winner, false);
}

function showdown() {
  M.street = 'showdown';
  const h = evaluate7([...M.heroHole, ...M.board]);
  const j = evaluate7([...M.jevHole, ...M.board]);
  const cmp = compareScores(h.score, j.score);
  render(true);
  let msg, winner;
  if (cmp > 0) { M.heroStack += M.pot; winner = 'hero'; msg = `You win ${CHIP}${M.pot} - ${h.name} beats ${j.name}.`; }
  else if (cmp < 0) { M.jevStack += M.pot; winner = 'jev'; msg = `Jev wins ${CHIP}${M.pot} - ${j.name} beats ${h.name}.`; }
  else {
    const half = Math.floor(M.pot / 2);
    M.heroStack += half; M.jevStack += M.pot - half; winner = 'split';
    msg = `Split pot - both show ${h.name}.`;
  }
  log(`Showdown: you ${M.heroHole.join(' ')} (${h.name}) vs Jev ${M.jevHole.join(' ')} (${j.name}).`);
  settle(msg, winner, true);
}

function settle(msg, winner, revealed) {
  const delta = 0; // stacks already settled above
  M.stats.hands++;
  // recompute session P&L from 1000 baseline
  M.stats.you = M.heroStack - 1000;
  M.stats.jev = M.jevStack - 1000;
  M.live = false; M.busy = false; awaiting = null;
  M.pot = 0; M.heroBet = 0; M.jevBet = 0;
  M.button = 1 - M.button;
  say(msg);
  banner(msg);
  log(msg, winner === 'hero' ? 'you' : winner === 'jev' ? 'jev' : '');
  if (M.heroStack <= 0 || M.jevStack <= 0) {
    const champ = M.heroStack > 0 ? 'You take the match! 🏆' : 'Jev takes the match. Rematch?';
    banner(champ, 4000);
    log(champ);
  }
  render(revealed);
}

// ---------- wiring ----------
$('btnDeal').onclick = () => { if (!blockHoldem() && !M.live && !M.busy) startHand(); };
$('btnNew').onclick = resetMatch;
$('btnSettings').onclick = () => {
  const p = $('howPanel');
  if (p) { p.classList.toggle('hidden'); p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }
};
$('btnFold').onclick = () => playerAct('fold');
$('btnCheckCall').onclick = () => playerAct('checkcall');
$('btnBetRaise').onclick = () => playerAct('betraise');
$('btnAllIn').onclick = () => playerAct('allin');
$('sizeSlider').oninput = (e) => { $('sizeVal').textContent = e.target.value; };

// ---------- mode switching (Hold'em / WHOT) ----------
let currentMode = 'holdem';
function switchMode(mode) {
  if (currentMode === mode) return;
  currentMode = mode;
  $('tabHoldem').classList.toggle('active', mode === 'holdem');
  $('tabWhot').classList.toggle('active', mode === 'whot');
  whotSetMode(mode);
  updateControls();
}
$('tabHoldem').onclick = () => switchMode('holdem');
$('tabWhot').onclick = () => switchMode('whot');
whotWire({ say, log, banner });

render();
maybeTour();
// "Take the tour" replay inside the How-it-works panel.
(() => {
  const p = $('howPanel');
  if (!p || $('btnTour')) return;
  const b = document.createElement('button');
  b.id = 'btnTour';
  b.className = 'ghost';
  b.textContent = '✷ Take the tour';
  b.onclick = () => startTour();
  p.appendChild(b);
})();
fetch('/api/health').then((r) => r.json()).then((h) => {
  if (!h.key) log('No AI_GATEWAY_API_KEY - Jev will play on heuristic fallback.');
  else log('Connected. Jev (typesafe-ai/jev) is at the table.');
});
