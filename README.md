# Human Baseline Collector

A static-HTML tool for collecting human responses on a pairwise selection task. Subjects sign in, answer a fixed set of queries, may abstain when context is insufficient, and download their responses as JSON.

Built for an upcoming Lossfunk research project on "research taste" in language models. The tool is generic — drop in any `data/queries.json` matching the input schema.

## Run locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000`. (`file://` won't work — `fetch()` is blocked under that protocol.)

## Files

- `index.html`, `styles.css`, `app.js` — the app (single-file each, no bundler).
- `data/queries.json` — the query batch.
- `SCHEMA.md` — input + output data contracts.
- `REQUIREMENTS.md` — scope, functions, key behaviors.

## Status

v1.
