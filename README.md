# Scandal-o-Meter 🚨

A satirical tracker that rates S&P 500, AI and chip CEOs on their **scandal risk**, using public persona only. Share prices are live from Yahoo Finance.

## Run it
Needs Node 18 or newer. There are no dependencies to install.

    npm start          # live Yahoo Finance prices → http://localhost:3000
    npm run demo       # mock prices, works offline

## How the score works
Each profiled CEO gets 0–10 on five metrics, weighted into a 0–100 risk score:

| Metric | Weight |
|---|---|
| 📱 Posting volume | 20% |
| 🥊 Public feuds | 25% |
| 🐸 Meme moments | 15% |
| 🎤 Keynote stunts | 15% |
| 📰 Headline history | 25% |

Tiers: **Code Red** (75+) · **Spicy** (55+) · **Simmering** (35+) · **Mostly Harmless** (15+) · **Beige Mode**.

## Editing
- CEO profiles, scores and roasts: `data/profiles.js`. CEO names reflect mid-2026, so check them for recent changes.
- S&P 500 constituents: `data/sp500.csv` (from github.com/datasets/s-and-p-500-companies).
- Extra non-S&P AI and chip tickers: the `EXTRAS` list in `server.js`.
- Weights and tiers: the top of `server.js`.

Companies without a profile appear when you tick "Include unprofiled companies".
