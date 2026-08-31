v0.7.4 — Free float + float market cap

Adds to Market Scanner candidate cards:
- Free Float shares
- Free Float % of shares outstanding
- Float Market Cap = current price × free-float shares

Data source:
- Shares Outstanding: SEC XBRL (existing)
- Free Float: ORTEX Free Float API

The code uses ORTEX's documented TEST trial key automatically if ORTEX_API_KEY is not set.
The trial feed may not return every ticker/date. In that case the UI shows — rather than estimating or inventing a float.

Optional later:
Add ORTEX_API_KEY to Vercel Environment Variables for broader/current ORTEX access.

Install:
Copy app and lib into your existing project and replace matching files.
Then:
  git add .
  git commit -m "Add free float and float market cap"
  git push
