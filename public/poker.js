// Minimal 7-card hold'em evaluator + deck helpers. No deps.
export const RANKS = '23456789TJQKA';
export const SUITS = ['♠', '♥', '♦', '♣'];
export const SUIT_CLASS = { '♠': 'spade', '♥': 'heart', '♦': 'diamond', '♣': 'club' };

export function newDeck() {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

const RV = Object.fromEntries([...RANKS].map((r, i) => [r, i + 2]));

function score5(cards) {
  const rs = cards.map((c) => RV[c[0]]).sort((a, b) => b - a);
  const ss = cards.map((c) => c.slice(-1));
  const flush = ss.every((s) => s === ss[0]);
  const uniq = [...new Set(rs)];
  const wheel = uniq.length === 5 && uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2;
  const straightHigh = wheel ? 5 : (uniq.length === 5 && uniq[0] - uniq[4] === 4 ? uniq[0] : 0);
  const counts = {};
  for (const r of rs) counts[r] = (counts[r] || 0) + 1;
  const groups = Object.entries(counts).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let cat, tb;
  if (flush && straightHigh) { cat = 8; tb = [straightHigh]; }
  else if (groups[0][0] === 4) { cat = 7; tb = [groups[0][1], groups[1][1]]; }
  else if (groups[0][0] === 3 && groups[1][0] === 2) { cat = 6; tb = [groups[0][1], groups[1][1]]; }
  else if (flush) { cat = 5; tb = rs; }
  else if (straightHigh) { cat = 4; tb = [straightHigh]; }
  else if (groups[0][0] === 3) { cat = 3; tb = [groups[0][1], ...groups.slice(1).map((g) => g[1]).sort((a, b) => b - a)]; }
  else if (groups[0][0] === 2 && groups[1][0] === 2) { cat = 2; tb = [Math.max(groups[0][1], groups[1][1]), Math.min(groups[0][1], groups[1][1]), groups[2][1]]; }
  else if (groups[0][0] === 2) { cat = 1; tb = [groups[0][1], ...groups.slice(1).map((g) => g[1]).sort((a, b) => b - a)]; }
  else { cat = 0; tb = rs; }
  return [cat, ...tb];
}

const NAMES = ['High card', 'Pair', 'Two pair', 'Trips', 'Straight', 'Flush', 'Full house', 'Quads', 'Straight flush'];
const RNAMES = { 14: 'A', 13: 'K', 12: 'Q', 11: 'J', 10: 'T' };
const rname = (v) => RNAMES[v] || String(v);

export function evaluate7(cards7) {
  let best = null, bestScore = null;
  for (let a = 0; a < 3; a++) for (let b = a + 1; b < 4; b++) for (let c = b + 1; c < 5; c++)
    for (let d = c + 1; d < 6; d++) for (let e = d + 1; e < 7; e++) {
      const five = [cards7[a], cards7[b], cards7[c], cards7[d], cards7[e]];
      const s = score5(five);
      if (!bestScore || cmpArr(s, bestScore) > 0) { bestScore = s; best = five; }
    }
  return { score: bestScore, best, name: describe(bestScore) };
}

function cmpArr(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return a[i] - b[i];
  }
  return 0;
}

export function compareScores(a, b) { return cmpArr(a, b); }

function describe(s) {
  const [cat, ...tb] = s;
  if (cat === 8) return tb[0] === 14 ? 'Royal flush' : `Straight flush, ${rname(tb[0])} high`;
  if (cat === 7) return `Four of a kind, ${rname(tb[0])}s`;
  if (cat === 6) return `Full house, ${rname(tb[0])}s over ${rname(tb[1])}s`;
  if (cat === 5) return `Flush, ${rname(tb[0])} high`;
  if (cat === 4) return `Straight, ${rname(tb[0])} high`;
  if (cat === 3) return `Three of a kind, ${rname(tb[0])}s`;
  if (cat === 2) return `Two pair, ${rname(tb[0])}s and ${rname(tb[1])}s`;
  if (cat === 1) return `Pair of ${rname(tb[0])}s`;
  return `${rname(tb[0])} high`;
}
export const HAND_NAMES = NAMES;
