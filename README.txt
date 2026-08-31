Stock Opportunity Scanner v0.9 — Single-stock market metrics

Adds the Market Scanner metric set to Single Stock Research:
- Price
- HOD / LOD
- % from HOD
- Technical score
- RVOL
- VWAP status
- Current volume
- Average volume
- Dollar volume
- Spread
- Shares outstanding
- Free float
- Float %
- Float market cap

Shares/float enrichment is loaded after the quick snapshot so it does not block the main single-stock result.

Install:
1. Copy the app and lib folders into your existing stock-opportunity-scanner folder.
2. Choose Replace files when Windows asks.
3. Run:
   git add .
   git commit -m "Add market scan metrics to single stock research"
   git push
