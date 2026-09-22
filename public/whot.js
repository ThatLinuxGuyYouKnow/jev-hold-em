// WHOT engine — Nigerian shedding game, 60-card Winad deck. Pure logic, no DOM.
//
// House rules (standard street Winad):
// - Match top card by SHAPE or NUMBER. 20 (WHOT) is wild — caller names a shape.
// - 1 hold on: play again. 20: turn passes.
// - 2 pick-two / 5 pick-three: victim draws and MISSES their turn (attacker replays),
//   unless the victim BLOCKS with the same rank (2-on-2, 5-on-5). Debt accumulates.
// - 8 suspension: victim misses their turn (attacker replays), unless they pass it
//   back with another 8.
// - 14 general market: unblockable, victim draws 2, caller requests a shape, turn passes (no replay).
// - 20 can never block. Empty your hand to win instantly (pending debts die).
export const SHAPES = ['circle', 'triangle', 'cross', 'square', 'star'];
export const GLYPH = { circle: '●', triangle: '▲', cross: '✚', square: '■', star: '★', whot: '✷' };
export const SHAPE_COLOR = { circle: '#e8b23a', triangle: '#58c470', cross: '#e05b5b', square: '#5b8ee0', star: '#b58be0', whot: '#111827' };
export const SPECIAL = {
  1: 'hold on — play again',
  2: 'pick two — draw 2, miss turn (blockable with another 2)',
  5: 'pick three — draw 3, miss turn (blockable with another 5)',
  8: 'suspension — miss turn (pass back with another 8)',
  14: 'general market — unblockable, victim draws 2, caller requests a shape, turn passes',
  20: 'WHOT — wild, call a shape (can never block)',
};
const SHAPES_RANKS = [1, 2, 3, 4, 5, 7, 8, 10, 11, 12, 13, 14];
const STAR_RANKS = [1, 2, 3, 4, 5, 7, 8];
export const PICK_VALUE = { 2: 2, 5: 3 };

export function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck() {
  const d = [];
  for (const s of SHAPES) {
    for (const r of (s === 'star' ? STAR_RANKS : SHAPES_RANKS)) d.push({ r, s });
  }
  for (let i = 0; i < 5; i++) d.push({ r: 20, s: 'whot' });
  return shuffle(d); // 60 cards
}

export function cardLabel(c) {
  return c.r === 20 ? 'WHOT ✷' : `${c.r} ${GLYPH[c.s]}`;
}

export class WhotGame {
  constructor() {
    const deck = buildDeck();
    this.you = deck.splice(0, 6);
    this.jev = deck.splice(0, 6);
    this.market = deck;
    this.pile = [];
    let t = this.market.pop(), guard = 0;
    while (SPECIAL[t.r] && guard++ < 60) { this.market.unshift(t); t = this.market.pop(); }
    this.pile.push(t);
    this.calledSuit = null;
    this.debt = null;    // { n, rank: 2|5, by, target } — pick debt awaiting block/take
    this.suspend = null; // { by, target } — suspension awaiting pass-back/serve
    this.turn = 'you';
    this.over = false;
  }

  get top() { return this.pile[this.pile.length - 1]; }

  isPlayable(c) {
    if (c.r === 20) return true;
    if (this.calledSuit) return c.s === this.calledSuit;
    return c.s === this.top.s || c.r === this.top.r;
  }

  // Full legality incl. pending debt/suspension. 20 can never block.
  canPlay(who, c) {
    if (this.debt && this.debt.target === who) return c.r === this.debt.rank;
    if (this.suspend && this.suspend.target === who) return c.r === 8;
    return this.isPlayable(c);
  }

  moves(who) {
    const hand = who === 'you' ? this.you : this.jev;
    const out = [];
    hand.forEach((c, i) => { if (this.canPlay(who, c)) out.push({ idx: i, card: c }); });
    return out;
  }

  pendingFor(who) {
    if (this.debt && this.debt.target === who) return { type: 'debt', n: this.debt.n, rank: this.debt.rank, by: this.debt.by };
    if (this.suspend && this.suspend.target === who) return { type: 'suspend', by: this.suspend.by };
    return null;
  }

  draw(who) {
    if (!this.market.length) this.reshuffle();
    if (!this.market.length) return null;
    const c = this.market.pop();
    (who === 'you' ? this.you : this.jev).push(c);
    return c;
  }

  reshuffle() {
    if (this.pile.length <= 1) return;
    const top = this.pile.pop();
    this.market = shuffle(this.pile.splice(0));
    this.pile.push(top);
  }

  // Take the pick debt: draw n, miss your turn (attacker replays).
  takeDebt(who) {
    const d = this.debt;
    if (!d || d.target !== who) return null;
    let drew = 0;
    for (let i = 0; i < d.n; i++) { if (this.draw(who)) drew++; }
    this.debt = null;
    this.turn = d.by;
    return { n: d.n, drew, by: d.by };
  }

  // Serve a suspension: miss your turn (suspender replays).
  acceptSuspend(who) {
    const s = this.suspend;
    if (!s || s.target !== who) return null;
    this.suspend = null;
    this.turn = s.by;
    return s;
  }

  // Apply a play. callShape required when playing a 20 or 14.
  play(who, idx, callShape) {
    const hand = who === 'you' ? this.you : this.jev;
    const opp = who === 'you' ? 'jev' : 'you';
    const c = hand[idx];
    if (!c || !this.canPlay(who, c)) return null;
    hand.splice(idx, 1);
    this.pile.push(c);
    this.calledSuit = null;
    const ev = { who, card: c, calledSuit: null, marketDraws: null, debtSet: null, suspendSet: null, winner: null, again: false };
    if (hand.length === 0) {
      this.over = true; ev.winner = who;
      this.debt = null; this.suspend = null;
      return ev;
    }
    if (c.r === 20) {
      this.calledSuit = callShape; ev.calledSuit = callShape;
      this.turn = opp;
    } else if (c.r === 1) {
      ev.again = true; // hold on — turn stays
    } else if (c.r === 8) {
      this.suspend = { by: who, target: opp };
      ev.suspendSet = true;
      this.turn = opp;
    } else if (c.r === 2 || c.r === 5) {
      if (this.debt && this.debt.target === who && this.debt.rank === c.r) {
        this.debt.n += PICK_VALUE[c.r]; // BLOCKED — debt grows, passes back
      } else {
        this.debt = { n: PICK_VALUE[c.r], rank: c.r };
      }
      this.debt.by = who; this.debt.target = opp;
      ev.debtSet = { n: this.debt.n, rank: c.r };
      this.turn = opp;
    } else if (c.r === 14) {
      let drew = 0;
      for (let i = 0; i < 2; i++) { if (this.draw(opp)) drew++; }
      ev.marketDraws = { who: opp, n: drew };
      this.calledSuit = SHAPES.includes(callShape) ? callShape : null;
      ev.calledSuit = this.calledSuit;
      this.turn = opp; // general market: no replay, turn passes
    } else {
      this.turn = opp;
    }
    return ev;
  }
}
