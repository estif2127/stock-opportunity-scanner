# Stock Opportunity Scanner v0.2

A personal research scanner for short-term U.S. equity momentum opportunities.

## What v0.2 adds

- Tiingo market-wide discovery and consolidated intraday validation
- VWAP, HOD distance, comparable-time RVOL, volume acceleration and liquidity scoring
- Tiingo news discovery
- OpenAI web research on the strongest finalists
- Primary-source catalyst verification across SEC filings, company investor relations, FDA and ClinicalTrials.gov when relevant
- Dilution / capital-structure warning extraction (offerings, ATM, S-3, warrants, convertibles, reverse splits, going-concern risks)
- Biotech-specific FDA/trial context and small-dataset warnings
- A Strong rating now requires a confirmed catalyst and no detected dilution flag in addition to technical quality

## Run locally

Create `.env.local`:

```env
TIINGO_API_KEY=...
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna
```

Then:

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Deploy on Vercel

Push the repo to GitHub, import it into Vercel, and set:

- `TIINGO_API_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional)

Then redeploy.

## Cost control

Primary-source web research is limited to the strongest five finalists per scan. The app does not web-research the entire market.

## Important

This is a research tool, not financial advice. Confirm prices, filings, FDA status and executable levels independently before making decisions. Tiingo Starter data is for personal/internal use; do not redistribute licensed market data publicly.
