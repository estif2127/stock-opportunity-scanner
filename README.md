# v0.7 Structured Fundamentals Patch

Replace the included `app` and `lib` files in your existing stock-opportunity-scanner project.

What changed:
- Pulls normalized fundamentals from Tiingo's Fundamentals API before AI synthesis.
- Uses latest quarterly statement + prior-year comparable quarter for revenue growth.
- Pulls revenue, net income/EPS, gross & operating margins, FCF/OCF, cash/debt, and daily valuation metrics when available.
- Structured facts are passed to OpenAI as verified inputs rather than asking web search to rediscover them.
- If AI omits a business field, the UI falls back directly to the Tiingo structured value.
- If Tiingo Fundamentals is unavailable for a ticker/account, the app continues with SEC/web research rather than failing the entire report.

No new environment variables are needed.

Push after replacement:

    git add .
    git commit -m "Use structured Tiingo fundamentals"
    git push
