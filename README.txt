Stock Scanner v0.6 — Structured Deep Research

What changed:
- Deep research no longer asks one giant web-research prompt to do everything.
- Two narrow fact passes run in parallel:
  1) latest earnings / business fundamentals
  2) catalyst / SEC capital structure / biotech checks
- A final small AI call synthesizes those verified facts WITHOUT web search.
- If synthesis times out, the app still returns the facts already collected instead of a page full of "Not verified".
- No new API keys are required.

Install:
1. Unzip this patch.
2. Copy the app and lib folders into your existing stock-opportunity-scanner project.
3. Choose Replace when Windows asks.
4. In CMD inside the project folder run:
   git add .
   git commit -m "Make deep research structured and faster"
   git push
5. Vercel will redeploy automatically.
