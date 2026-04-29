# Schemas

Two data contracts the frontend depends on:
- **Input:** `data/queries.json` — what the upstream filtering notebook emits.
- **Output:** subject response export — what the frontend writes on download.

## Reference: canonical query format

The input schema below is derived from the project's canonical query file:

```
hypothesis-ranking/data/queries_w_prompts/curated_pairwise_comprehensive_w_prompts.json
```

We retain the canonical structure for `paper_id`, `research_goal`, and `current_progress` so the file is recognizable to anyone who has already worked with that dataset. Several canonical fields are dropped or renamed for human-baseline use.

---

## Input — `data/queries.json`

Array of pair objects. Each entry represents one pair the subject decides on. The frontend randomizes which option appears in slot A vs slot B per session.

```json
[
  {
    "base_id": "2602.09163_fw3_d0",
    "paper_id": "2602.09163",
    "research_goal": "The overarching research goal of this paper is ...",
    "current_progress": [
      {
        "text": "Hypothesis statement ...",
        "key_result": "Key result text ...",
        "citation": "Section 3.2, Table 1"
      }
    ],
    "rephrased_option_1": "...",
    "rephrased_option_2": "..."
  }
]
```

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `base_id` | string | yes | Pair-level identifier. Derived from canonical `query_id` by stripping the `_comp_pos*` suffix. Join key for the export. |
| `paper_id` | string | yes | Source paper of the GT. Not displayed to subjects. |
| `research_goal` | string | yes | Verbatim from canonical. Rendered to subjects. |
| `current_progress` | array | yes | Verbatim from canonical. Each item has `text`, `key_result`, `citation`. Frontend renders `text` and `key_result`; `citation` is metadata only. |
| `rephrased_option_1` | string | yes | One of two research directions presented to the subject. |
| `rephrased_option_2` | string | yes | The other research direction. |

### The `option_1` / `option_2` convention

The mapping `option_1 = GT, option_2 = Distractor` is established by the filter notebook and is **not present in the file**. The frontend treats both options as opaque strings — it does not know which is the answer. This is intentional: the queries.json may be hosted publicly (e.g., GitHub Pages), and a neutral file shape prevents accidental answer leakage.

The analysis pipeline decodes `option_1 → GT, option_2 → Distractor` by convention post-collection.

---

## Output — subject response export

JSON file the frontend offers as a download. Filename suggestion: `<subject_id>.json`.

```json
{
  "subject": {
    "subject_id": "dhruv-trehan-20260428-1530",
    "submitted_at": "2026-04-28T15:45:32Z",
    "intake": {
      "name": "Dhruv Trehan",
      "qualification": "phd",
      "years_ml_experience": 4,
      "attestation_no_tools": true,
      "attestation_partial_ok": true
    }
  },
  "session": {
    "start_time": "2026-04-28T15:30:00Z",
    "end_time": "2026-04-28T15:45:32Z",
    "completed": true,
    "queries_total": 16,
    "queries_completed": 16
  },
  "responses": [
    {
      "base_id": "2602.09163_fw3_d0",
      "subject_choice": "A",
      "subject_choice_text": "Validate the findings by conducting experiments across diverse model architectures...",
      "options": [
        "Validate the findings by conducting experiments across diverse model architectures...",
        "Investigate how reflection-like reasoning behaviors emerge..."
      ],
      "time_spent_ms": 12340,
      "timestamp": "2026-04-28T15:31:12Z"
    }
  ]
}
```

### Fields under `responses[]`

| Field | Type | Notes |
|---|---|---|
| `base_id` | string | Joins back to `queries.json`. |
| `subject_choice` | `"A"` \| `"B"` | Which slot the subject clicked. |
| `subject_choice_text` | string | Full text of the option the subject selected. Strictly redundant with `options[0]` or `options[1]` indexed by `subject_choice`, but kept for readability and as a sanity check against parsing errors. |
| `options` | `[string, string]` | The two option texts as the subject saw them. **Display order, not canonical order:** `options[0]` is the text rendered at slot A this session, `options[1]` is the text at slot B. This is *not* the same ordering as `rephrased_option_1` / `rephrased_option_2` in `queries.json`, because the frontend randomizes per session. |
| `time_spent_ms` | integer | Milliseconds from query render to submit. |
| `timestamp` | ISO8601 | When the choice was submitted. |

**Important: the `options` array is in display order, not canonical order.** The frontend assigns each pair's two texts to slots A and B at session start (balanced 8/8 across the batch) and writes the texts into `options` in that order. Code that consumes the export must not assume `options[0]` corresponds to `rephrased_option_1` from the input file — match by string content.

`session.completed` is `true` only after all queries are answered. Partial exports (download mid-session) set `completed: false` with `queries_completed < queries_total`.

The frontend has no GT awareness; the analysis pipeline computes author alignment by matching `subject_choice_text` against `queries.json`'s `rephrased_option_1` (= GT by convention).
