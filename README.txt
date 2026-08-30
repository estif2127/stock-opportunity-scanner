Opportunity Scanner v0.5 — 60-Second Deep Research

WHAT CHANGED
- Deep Research is now explicitly decision-focused instead of exhaustive.
- Targets a ~55 second server-side AI budget so the UI does not wait forever.
- Uses only 3-6 high-value sources, prioritizing SEC/company IR/FDA/ClinicalTrials.
- Sends only the 5 most relevant Tiingo headlines with compact descriptions.
- Cuts AI output budget to 2,800 tokens.
- Retries a 429 once, then stops.
- If the time budget expires or JSON is incomplete, returns a conservative partial WATCH report rather than hanging or inventing facts.
- Existing 45-minute cache remains in the API route.

INSTALL
Copy the app and lib folders into your existing stock-opportunity-scanner project and choose Replace when Windows asks.
Then run:
  git add .
  git commit -m "Add 60-second deep research"
  git push

No new environment variables are required.
