# Stock Opportunity Scanner v0.1

A conservative momentum scanner using Tiingo for market data and OpenAI for finalist analysis.

## What it does

1. Pulls Tiingo's current consolidated equity snapshots.
2. Discovers U.S. equities priced $1–$50, up at least 5%, with at least 1M shares of current volume.
3. Deep-validates the top discovery candidates using 5-minute consolidated intraday bars.
4. Calculates HOD distance, VWAP, comparable-time RVOL, volume acceleration, recent higher lows, liquidity spread and dollar volume.
5. Pulls recent Tiingo news for finalists.
6. Sends only the finalists to OpenAI for a conservative Strong / Watch / Avoid assessment.
7. Shows an intraday candlestick chart and returns NO TRADE when no candidate clears the quality threshold.

## Important MVP limitations

- This cheap version is momentum-first. It does **not** yet fully verify market cap, float, short interest, SEC dilution, warrants/convertibles, biotech trial quality, or full fundamentals.
- RVOL is only displayed as verified when the app has enough prior intraday sessions to compare volume at the same elapsed-bar count. It is never time-extrapolated.
- Tiingo Starter data is for personal/internal use. Do not publicly redistribute their data.
- Always confirm executable price, spread and market status in your broker before acting.

## Local setup

```bash
npm install
cp .env.example .env.local
```

Then edit `.env.local`:

```bash
TIINGO_API_KEY=your_tiingo_key
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-5.6-luna
```

Run:

```bash
npm run dev
```

Open http://localhost:3000.

## GitHub

Create an empty GitHub repo, then from this folder:

```bash
git init
git add .
git commit -m "Initial stock opportunity scanner"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

`.env.local` is ignored and should never be committed.

## Vercel

1. Import the GitHub repository into Vercel.
2. Go to Project → Settings → Environment Variables.
3. Add `TIINGO_API_KEY`, `OPENAI_API_KEY`, and optionally `OPENAI_MODEL`.
4. Redeploy.

Do not prefix secrets with `NEXT_PUBLIC_`.

## Suggested next versions

- v0.2: 52-week-low / earnings-overreaction reversal engine.
- v0.3: SEC filing + dilution / ATM / warrant / convertible analyzer.
- v0.4: biotech FDA / clinical catalyst engine.
- v0.5: paper trading and outcome tracking.
