# Thick Sinking Hats – Health & Flight Risk (Starter)

A lean PoC webapp that combines **Employee Pulse & Sentiment** (#4) with an **Attrition / Flight-Risk Predictor** (#5).
Designed for quick demos on **Netlify** (static site + serverless functions).

## What’s inside
- `web/` — static frontend (no build step required)
  - `pocs/health.html` — Org Pulse dashboard (team-level, anonymous)
  - `pocs/risk.html` — Manager Risk view (scores + reasons)
- `functions/` — Netlify Functions (Node.js, no external deps)
  - `pulse_aggregate.js` — reads sample `pulses.csv` and returns aggregates
  - `attrition_score.js` — scores from a logistic model with explainability chips
- `data-samples/`
  - `pulses.csv` — demo pulse data (anonymized hashes)
  - `employees.csv` — minimal HRIS snapshot for context
- `models/`
  - `attrition_model.json` — demo coefficients
  - `latest_features.json` — precomputed features so the demo works out-of-the-box
  - `topic_terms.json` — keyword lists for light topic tagging

## Quickstart (local)
1. Install Netlify CLI:
   ```bash
   npm i -g netlify-cli
   ```
2. Run locally:
   ```bash
   netlify dev
   ```
   Open the local URL it prints (usually http://localhost:8888).

## Quickstart (deploy)
1. Push this folder to a GitHub repo.
2. In Netlify → "New site from Git" → select repo → **no build command** needed.
3. Deploy. Functions auto-deploy from `/functions`.
4. Visit:
   - `/pocs/health.html`
   - `/pocs/risk.html`

> Note: This starter reads sample CSVs committed in `data-samples/`. For a real PoC, wire inputs to a store (e.g., object storage or a DB) and write from `/.netlify/functions/pulse_submit` to `/tmp` or external storage.

## Environment
- For demo, no env vars are required. For production, set `SALT` for hashing and secure admin endpoints with a token.

## License
MIT – go forth and experiment.
