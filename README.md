# v0.7.1 Fundamentals Timeout Fix

Fixes the case where Tiingo structured fundamentals were fetched successfully but then discarded when OpenAI deep research hit the time budget.

Changes:
- Timeout/partial reports now retain Tiingo revenue, earnings, margins, FCF, cash/debt and valuation.
- Tiingo definition matching now checks both display names and dataCode values.
- Tiingo fundamentals metadata is used for company name, sector, industry and reporting currency when available.
- Vercel logs now show a safe fundamentals status line (available/period/error only; no API key).

Copy `app` and `lib` into the existing project and replace files, then commit and push.
