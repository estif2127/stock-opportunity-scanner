# v0.8.2 OpenAI TPM rate-limit fix

Replace `lib/research.ts` in your existing project with the file in this patch.

Changes:
- Catalyst web verification researches only the top 2 finalists.
- Research is sequential instead of one large multi-ticker request.
- Uses only 3 recent headlines per ticker and a smaller output budget.
- Honors OpenAI `Retry-After` / `retry-after-ms` on 429s and retries once.
- If catalyst verification still fails, the market scan continues rather than failing.
