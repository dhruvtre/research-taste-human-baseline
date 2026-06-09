# Human Baseline Collector — Requirements (v1)

A single-page static-HTML app for collecting human responses on the pairwise research-direction selection task. Subjects sign in, answer a fixed set of queries, and download their responses as JSON.

See `SCHEMA.md` for the input (queries.json) and output (response export) data contracts.

## Scope

- Static HTML, no server, no analytics.
- One fixed query batch shared across all subjects.
- Flow: intake → instructions → queries → end.
- Responses persisted to localStorage during the session, exported via download.
- Honor system on partial responses.
- Target session: ~10 subjects × 23 queries each.

## Files

| File | Purpose |
|---|---|
| `index.html` | Single page; views as hidden sections switched by JS. |
| `styles.css` | Styling. |
| `app.js` | All logic: state, views, handlers, export. |
| `data/queries.json` | Curated query batch (produced by upstream filter notebook). |
| `SCHEMA.md` | Data contract. |
| `README.md` | Usage / deploy. |
| `REQUIREMENTS.md` | This file. |

## Functions in `app.js`

### State (localStorage)
- `loadState()` — read all persisted keys.
- `saveState(patch)` — merge a partial update into stored state.
- `clearState()` — wipe; used for fresh-start or after final download.

### Data + setup
- `loadQueries()` — fetch `data/queries.json`.
- `assignOrderings(queries)` — produce per-pair A/B assignments for this session, **balanced 50/50 option_1-at-A vs option_2-at-A**, then shuffled. Persisted on first call.
- `assignQueryOrder(queries)` — produce a randomized per-session query order, persisted on first call.

### Views
- `showView(name)` — toggle visibility between `intake` / `instructions` / `query` / `end`.
- `renderQuery(idx)` — draw the query at the persisted randomized display index, two options per the persisted A/B assignment, and the cannot-choose affordance.
- `renderEnd()` — summary + final download button.

### Handlers
- `checkActiveSession()` — runs on load; prompts resume-vs-restart if existing state found.
- `handleIntakeSubmit(form)` — validate, generate `subject_id`, persist intake, advance.
- `handleQuerySubmit(choice, abstentionReason)` — record response with time-spent, advance to next or end.
- `handleDownload()` — build export per `SCHEMA.md`, trigger file download.

### Helpers
- `slugifyName(name, timestamp)` → `subject_id` like `dhruv-trehan-20260428-1530`.
- `nowIso()` → ISO 8601 timestamp.
- `formatExport()` → assemble the export object from current state.
- `downloadJSON(obj, filename)` → trigger browser download.

## Key behaviors

- **Randomized query order per session.** `assignQueryOrder` shuffles query `base_id`s at intake, persists the sequence, and resumes from the same order after refreshes. Partial exports preserve the full sequence in `session.query_order`.
- **Balanced A/B per session.** `assignOrderings` assigns exactly half the pairs `option_1-at-A` and the other half `option_2-at-A` (rounded for odd batches), independent of randomized query order. The frontend doesn't know any answer-key mapping — it just balances the two opaque option labels. Position-bias analysis depends on this.
- **Abstention capture.** Each query includes a third "I cannot make a meaningful choice from the provided context" choice. If selected, the subject must choose one `abstention_reason` code before submitting: `context_unclear_insufficient`, `options_dont_make_sense`, `outside_domain_expertise`, or `other`.
- **Persist eagerly.** Every intake submission and every submitted query response writes to localStorage immediately. Refresh mid-session must not lose data.
- **Resume vs restart.** If a session is detected on load, ask the subject. Restart wipes localStorage; resume continues from `current_index`.
- **Download from anywhere.** Reachable from every view after intake. Partial exports set `session.completed: false`.
- **No answer-key awareness.** The frontend treats `rephrased_option_1` and `rephrased_option_2` as opaque strings and has no way to tell which option maps to the analysis answer key. `paper_id` and `base_id` are read for state and join purposes but never rendered to subjects.
- **Time per query.** Measured from when the query renders to when the subject submits a choice, in milliseconds.

## Code style

- Single `app.js`. No bundler, no build step. Vanilla JS, no frameworks.
- Happy-path implementation. Minimal validation; one generic `alert()` for the rare failure case (network, malformed `queries.json`).
- Functions short and named. No anonymous handlers attached to events.
- Re-render the active view from state on transition. No clever DOM diffing.

## Out of scope (v1)

- Server-side state, access tracking, sign-in counting.
- Per-subject query subsets or stratified batches.
- Reasoning / confidence capture.
- Keyboard shortcuts.
- Reviewer / admin dashboard.
- Cross-device resume (localStorage is per-browser).
- Subdomain familiarity capture (intake = name, role, years_ml_experience, attestations).
