Stock Opportunity Scanner v0.4 — Fast Single Stock Research

What changed
- Single-stock mode now loads a QUICK SNAPSHOT first using Tiingo only.
- Quick snapshot shows price, change, chart, VWAP, RVOL, HOD distance, volume, technical score, warnings, and recent headlines.
- OpenAI is NOT called for the quick snapshot.
- A separate Run Deep Research button triggers SEC/fundamental/catalyst/capital-structure research.
- Deep reports are cached in the running server instance for 45 minutes.
- Deep research uses a smaller web-search context and output budget.
- 429 rate-limit errors automatically retry up to two times with short backoff.

Install
1. Unzip this patch.
2. Copy the app and lib folders into your existing stock-opportunity-scanner folder.
3. Choose Replace files.
4. In CMD inside your project folder run:
   git add .
   git commit -m "Make single stock research fast"
   git push
5. Vercel should redeploy automatically.

No new API keys or Vercel environment variables are needed.
