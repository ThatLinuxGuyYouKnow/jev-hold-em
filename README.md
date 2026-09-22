<p align="center">
  <img src="public/logo.png" alt="Jev Hold'em spade logo" width="120" />
</p>

<h1 align="center">Jev Hold'em</h1>

<p align="center">Heads-up Texas Hold'em - <b>you vs Jev</b>, the type-safe model (<code>typesafe-ai/jev</code>).<br />
Dark-table UI, Naira (₦) stacks, table talk, and a live view into Jev's brain.</p>

## Play

```bash
npm install
npm start        # http://localhost:3000
```

Optional `.env`:

```ini
AI_GATEWAY_API_KEY=...   # without it, Jev plays on a heuristic fallback
PORT=3000
```

## How a hand works

- 1000 ₦ stacks, blinds 5/10, button alternates every hand.
- **Deal hand** starts; action follows heads-up rules (button acts first pre-flop, big blind acts first after).
- Your controls:
  - **Fold** / **Check–Call** / **Bet–Raise** - the main action bar.
  - **Size slider** - sets your bet/raise amount (the green button reads it live, e.g. `◉ Bet ₦40`). Capped at your stack.
  - **All-in** - shoves regardless of the slider.
  - **Table talk** - anything you type is snapshotted per street (`flop: you say "…"`) and fed to Jev's bluff-detector, so your story has to stay consistent.
- Runouts, showdowns (real 7-card evaluation), split pots, and match tracking (Hands / You / Jev P&L) are all handled in the browser.

## Jev's brain

Every Jev turn POSTs structured table state to `/api/jev`, which calls
`experimental_evaluate({ model: 'typesafe-ai/jev' })` with 4 parallel typed
questions - no prose, just probabilities:

| Question        | Type    | Meaning                              |
|-----------------|---------|--------------------------------------|
| `action`        | choice  | fold / call / raise + probabilities  |
| `shove`         | boolean | nutted hand or elite bluff spot?     |
| `handStrength`  | score   | 0 air · 1 pair/draw · 2 monster      |
| `playerBluffing`| boolean | does Jev think *you're* bluffing?    |

Sizing and nerves are **confidence-gated** (`server.mjs → decideBet`):

- Low confidence/probability on a raise → pot-control (check behind / flat).
- Never folds for free; never bluff-shoves unsure - shoves need a monster or high-confidence read.
- If the gateway is unreachable, a Chen-formula heuristic plays instead (badged `fallback` in the UI).

The side panel shows action probabilities, shove/strength/bluff meters,
confidence, Jev's reason string, latency, and token usage.

## Try the model headlessly

```bash
npm run demo   # bluff-vs-jev.mjs: one scripted turn spot, printed answers + confidence
```

## Project layout

```
server.mjs          static server + /api/jev + /api/health + fallback brain
bluff-vs-jev.mjs    CLI demo of one Jev evaluation
public/
  index.html        dark poker-table UI
  styles.css        theme (oval table, action bar, cards)
  app.js            game engine (deck, betting, streets, showdown)
  poker.js          7-card hand evaluator
  logo.png          spade logo (source of the favicon set)
  logo-light.png    white version for the dark header
  favicon.ico / favicon-*.png / apple-touch-icon.png
```

## Notes

- Currency is Naira (₦) - change `CHIP` in `public/app.js` plus the static `₦` in `public/index.html` to switch.
- No build step, no database. Refresh the page for a fresh match, or hit `↻ new match`.
