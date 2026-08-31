v0.8 — SEC-first structured fundamentals

Fixes blank fundamentals caused by Tiingo hourly-rate limits.

Changes:
- Basic fundamentals now come from SEC Companyfacts/XBRL first, with no Tiingo request required.
- Pulls latest reported revenue, YoY comparable revenue growth, net income, diluted EPS, gross margin, operating margin, operating cash flow, estimated free cash flow, cash, investments, debt, and shares outstanding when filed.
- Uses short in-memory caching to avoid repeatedly hitting SEC endpoints.
- Tiingo remains the source for price/intraday data.
- Valuation ratios may remain unavailable until a separate valuation source is added; the app will not invent them.

Copy lib/fundamentals.ts into your existing project and replace the file.
