v0.7.6 — Average Volume

Adds Average Volume to market screener candidates without any extra Tiingo requests.
It reuses the same 5-minute intraday history already fetched for RVOL, sums each prior completed session, and averages the available recent sessions (up to 20). The current session is excluded.

Copy app and lib into your existing project and replace files.
