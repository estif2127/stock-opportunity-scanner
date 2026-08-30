Stock Scanner v0.5.1 — hard timeout fix

This patch fixes /api/research requests that were still reaching Vercel's 300-second timeout.

Changes:
- OpenAI SDK request timeout set to 45 seconds with automatic SDK retries disabled.
- Route-level 65-second Promise.race guard.
- If research cannot finish in time, the API returns a conservative partial WATCH report instead of timing out.
- Partial reports are cached briefly to avoid repeated expensive retries.

Install:
1. Copy the app and lib folders into your existing stock scanner project.
2. Choose Replace when Windows asks.
3. Run:
   git add .
   git commit -m "Hard-limit deep research runtime"
   git push
