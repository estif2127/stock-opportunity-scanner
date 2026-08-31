v0.8.4 SEC period-alignment fix

Fixes:
- Merges equivalent SEC XBRL tags before choosing the newest fact.
- Anchors earnings, margins and cash-flow metrics to the same reporting period as revenue.
- Uses prior-year comparable revenue for YoY growth rather than the immediately prior quarter.
- Aligns balance-sheet facts to the same filing period when possible.
- Rejects impossible margin values instead of displaying nonsense.

Replace only lib/fundamentals.ts in your existing project, then commit and push.
