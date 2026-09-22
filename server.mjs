import 'dotenv/config';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { experimental_evaluate as evaluate } from 'ai';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// --- Chen-formula fallback equity when the Gateway is unreachable ---
function chenScore(hole) {
  const vals = { A: 10, K: 8, Q: 7, J: 6, T: 5, 9: 4.5, 8: 4, 7: 3.5, 6: 3, 5: 2.5, 4: 2, 3: 1.5, 2: 1 };
  const [a, b] = hole;
  const ra = a[0], rb = b[0];
  const sa = a.slice(-1), sb = b.slice(-1);
  let s = Math.max(vals[ra], vals[rb]);
  if (ra === rb) s = Math.max(5, s * 2);
  if (sa === sb) s += 2;
  const gap = Math.abs('23456789TJQKA'.indexOf(ra) - '23456789TJQKA'.indexOf(rb));
  if (gap === 1) s += 1;
  else if (gap === 2) s -= 1;
  else if (gap === 3) s -= 2;
  else if (gap >= 4) s -= 4;
  return Math.max(0, s / 20); // ~0..0.75
}

function fallbackDecision(state) {
  const eq = chenScore(state.jevHole);
  const potOdds = state.toCall / (state.pot + state.toCall + 1e-9);
  let choice = 'call';
  if (state.toCall === 0) choice = eq > 0.52 ? 'raise' : 'call'; // call = check when free
  else if (eq < potOdds * 0.85 && state.toCall > state.pot * 0.25) choice = 'fold';
  else if (eq > 0.62 && state.toCall < state.pot * 0.8) choice = 'raise';
  const probs = { fold: 0.1, call: 0.1, raise: 0.1 };
  probs[choice] = 0.62;
  const rest = 0.38 / 2;
  for (const k of Object.keys(probs)) if (k !== choice) probs[k] = rest;
  return {
    answers: {
      action: { type: 'choice', choice, probabilities: probs },
      shove: { type: 'boolean', probability: eq > 0.7 && state.toCall > 0 ? 0.55 : 0.05 },
      handStrength: { type: 'score', score: Math.round(eq * 2), probabilities: { 0: 1 - eq, 1: 0.25, 2: eq * 0.8 } },
      playerBluffing: { type: 'boolean', probability: 0.4 },
    },
    confidence: { action: 0.5, handStrength: 0.4 },
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    fallback: true,
  };
}

// Confidence-gated sizing shared by live + fallback paths.
function decideBet(answers, confidence, state) {
  const action = answers.action;
  const prob = action.probabilities?.[action.choice] ?? 0;
  const conf = confidence?.action ?? 0;
  const strength = answers.handStrength?.score ?? 1; // 0 weak, 1 med, 2 monster
  const shoveP = answers.shove?.probability ?? 0;

  let executed = action.choice;
  let reason = `jev=${action.choice} p=${prob.toFixed(2)} conf=${conf.toFixed(2)}`;
  // Low-confidence override: never blast off unsure.
  if ((conf < 0.6 || prob < 0.7) && executed === 'raise') {
    executed = state.toCall === 0 ? 'call' : 'call'; // check behind / flat
    reason += ' -> LOW CONF: pot-control (check/flat)';
  }
  if (executed === 'fold' && state.toCall === 0) {
    executed = 'call'; // never fold for free
    reason += ' -> free option: check';
  }
  // Shove gate: monster + high bluff-read or nutted strength.
  let amount = 0;
  if (executed === 'raise') {
    const base = state.pot * (strength === 2 ? 0.9 : strength === 1 ? 0.6 : 0.5);
    amount = Math.max(20, Math.round(base / 5) * 5);
    if ((shoveP >= 0.8 && conf >= 0.6) || (strength === 2 && prob >= 0.85)) {
      amount = state.jevStack; // smash
      reason += ' -> SHOVE (nutted / high-conf bluff-catcher)';
    }
    amount = Math.min(amount, state.jevStack);
  } else if (executed === 'call') {
    amount = Math.min(state.toCall, state.jevStack);
  }
  return { executed, amount, reason };
}

async function handleJev(state, clientQuestions) {
  const t0 = performance.now();
  const questions = clientQuestions ?? holdemQuestions(state);
  try {
    const result = await evaluate({ model: 'typesafe-ai/jev', state, questions });
    const ms = Math.round(performance.now() - t0);
    const confidence = result.providerMetadata?.typesafe?.confidence ?? {};
    if (clientQuestions) {
      // Custom game (WHOT etc.) — client owns move execution.
      return { answers: result.answers, confidence, usage: result.usage, ms, fallback: false };
    }
    const bet = decideBet(result.answers, confidence, state);
    return {
      answers: result.answers, confidence,
      usage: result.usage, ms, fallback: false, ...bet,
    };
  } catch (err) {
    if (clientQuestions) {
      // Let the client apply its own fallback logic.
      return { answers: null, fallback: true, ms: Math.round(performance.now() - t0), error: String(err).slice(0, 300) };
    }
    const fb = fallbackDecision(state);
    const bet = decideBet(fb.answers, fb.confidence, state);
    return { ...fb, ms: Math.round(performance.now() - t0), error: String(err).slice(0, 300), ...bet };
  }
}

function holdemQuestions(state) {
  return {
    action: {
      type: 'choice',
      instructions: `Heads-up no-limit hold'em. You are Jev (villain). What should you do ${state.toCall > 0 ? `facing a bet of ${state.toCall} into pot ${state.pot}` : 'with the option to bet'}?`,
      criteria: {
        fold: 'behind, bad pot odds, save chips',
        call: state.toCall > 0 ? 'pot odds justify a call, or pot-control behind' : 'check behind, see next card cheaply',
        raise: 'ahead or credible bluff spot, apply pressure with sizing',
      },
    },
    shove: {
      type: 'boolean',
      instructions: 'Should you go all-in right now (nutted hand or elite bluff spot)?',
    },
    handStrength: {
      type: 'score',
      instructions: 'How strong is your holding on this board?',
      criteria: ['air / weak pair', 'decent pair / draw', 'two-pair or better / monster draw'],
    },
    playerBluffing: {
      type: 'boolean',
      instructions: 'Is the human player bluffing? Weigh bet sizing vs board, plus the sequenced table talk: earlier statements that contradict later ones (or confident chat paired with weak/scared sizing) smell like a bluff.',
    },
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = '';
    req.on('data', (c) => { buf += c; if (buf.length > 1e6) reject(new Error('body too large')); });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (req.method === 'POST' && url.pathname === '/api/jev') {
    try {
      const body = JSON.parse(await readBody(req));
      // body = { state, questions? } — questions given => custom game mode (client executes)
      const state = body.state ?? body;
      const out = await handleJev(state, body.questions ?? null);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: String(e).slice(0, 300) }));
    }
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, model: 'typesafe-ai/jev', key: !!process.env.AI_GATEWAY_API_KEY }));
    return;
  }
  // static
  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

server.listen(PORT, () => console.log(`Jev Hold'em on http://localhost:${PORT}`));
