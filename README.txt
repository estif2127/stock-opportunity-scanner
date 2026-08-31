Stock Scanner v0.8.1 type compatibility fix

Fixes Vercel TypeScript build errors after v0.8 by restoring Candidate fields used by the screener:
- averageVolume
- outstandingShares / outstandingSharesAsOf
- freeFloatShares / freeFloatPercent / freeFloatAsOf
- floatMarketCap

Copy lib/types.ts into your existing project's lib folder and replace the old file.
