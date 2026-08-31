v0.7.5 — Fast market scan + lazy shares/float enrichment

What changed
- SEC outstanding shares and ORTEX free-float calls no longer block /api/scan.
- Core scan results render first.
- The browser then calls /api/enrichment for only the finalists (max 7).
- SEC and ORTEX enrichment run in parallel with ~4.5 second fallbacks.
- If enrichment fails or is slow, scan results still remain usable; shares/float fields stay as —.

Install
1. Copy app/ and lib/ into the existing project and replace matching files.
2. git add .
3. git commit -m "Make shares and float enrichment non-blocking"
4. git push
