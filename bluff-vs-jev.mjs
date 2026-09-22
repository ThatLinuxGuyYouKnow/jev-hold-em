import 'dotenv/config';
import { experimental_evaluate as evaluate } from 'ai';

// Simplified poker/trader state - human tries to bluff Jev.
// Jev sees the table as structured state, returns typed decisions in parallel.
const hand = {
  game: 'bluff-holdem (demo)',
  pot: 120,
  toCall: 20,
  street: 'turn',
  board: ['Ah', '7d', '4c', 'Ks'],
  heroBetHistory: ['preflop: raise 3x', 'flop: c-bet 50% pot', 'turn: overbet 150% pot'],
  villainChat: 'lol i definitely do NOT have pocket aces, trust me',
  stackHero: 400,
  stackVillain: 380,
};

const questions = {
  action: {
    type: 'choice',
    instructions: 'What should hero do facing the overbet?',
    criteria: {
      fold: 'hand is beat, save chips',
      call: 'pot odds justify a call, see river',
      raise: 'opponent is weak or bluffing, apply pressure',
    },
  },
  isBluffing: {
    type: 'boolean',
    instructions: 'Is the villain bluffing?',
  },
  handStrength: {
    type: 'score',
    instructions: 'How strong is hero holding on this board?',
    criteria: ['air / weak pair', 'decent pair / draw', 'two-pair or better'],
  },
};

const t0 = performance.now();
try {
  const result = await evaluate({
    model: 'typesafe-ai/jev',
    state: hand,
    questions,
  });
  const ms = Math.round(performance.now() - t0);

  console.log(`\nJev decision in ${ms}ms | usage:`, result.usage);
  console.log(JSON.stringify(result.answers, null, 2));

  const confidence = result.providerMetadata?.typesafe?.confidence;
  if (confidence) console.log('\nconfidence:', confidence);

  // Confidence-gated routing - the LinkedIn money shot:
  // act when sure, check/showdown when unsure.
  const action = result.answers.action;
  const actionConf = confidence?.action ?? 0;
  const actionProb = action.probabilities?.[action.choice] ?? 0;
  console.log(`\naction=${action.choice} p=${actionProb.toFixed(2)} conf=${actionConf.toFixed(2)}`);

  if (actionConf < 0.6 || actionProb < 0.7) {
    console.log('-> LOW CONFIDENCE: pot-control / check, show confidence bar dipping on stream');
  } else {
    console.log(`-> HIGH CONFIDENCE: execute ${action.choice.toUpperCase()}, smash the bet button`);
  }

  const bluffP = result.answers.isBluffing.probability;
  console.log(`bluff probability=${bluffP.toFixed(2)} ${bluffP >= 0.8 ? '(calling station mode)' : bluffP <= 0.2 ? '(value town)' : '(suspicious)'}`);
} catch (err) {
  console.error('\nGateway call failed (key/network?). Mock fallback so demo never dies on stage:');
  console.error(String(err).slice(0, 500));
  console.log(JSON.stringify({
    action: { type: 'choice', choice: 'call', probabilities: { fold: 0.2, call: 0.55, raise: 0.25 } },
    isBluffing: { type: 'boolean', probability: 0.62 },
    handStrength: { type: 'score', score: 1, probabilities: { 0: 0.2, 1: 0.6, 2: 0.2 } },
  }, null, 2));
}
