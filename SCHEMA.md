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
| `paper_id` | string | yes | Source paper associated with the pair. Not displayed to subjects. |
| `research_goal` | string | yes | Verbatim from canonical. Rendered to subjects. |
| `current_progress` | array | yes | Verbatim from canonical. Each item has `text`, `key_result`, `citation`. Frontend renders `text` and `key_result`; `citation` is metadata only. |
| `rephrased_option_1` | string | yes | One of two research directions presented to the subject. |
| `rephrased_option_2` | string | yes | The other research direction. |

### The `rephrased_option_1` / `rephrased_option_2` convention

The frontend treats both options as opaque strings and does not know which, if either, corresponds to the reference continuation used by the analysis pipeline. Any answer-key mapping is maintained outside the hosted frontend and is applied only after response collection.

This is intentional: `queries.json` may be hosted publicly (e.g., GitHub Pages), and a neutral file shape prevents accidental answer leakage.

---

## Output — subject response export

JSON file the frontend offers as a download. Filename suggestion: `<subject_id>.json`.
Subjects may either choose displayed slot A/B or abstain when they cannot make a meaningful choice from the provided context.

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
    "queries_total": 23,
    "queries_completed": 23
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
    },
    {
      "base_id": "2601.16175_fw0_d0",
      "subject_choice": "cannot_choose",
      "subject_choice_text": null,
      "options": [
        "Extend test-time training methods to handle problems with sparse or binary rewards...",
        "Extend explicit planning mechanisms to handle stochastic or partially observable settings..."
      ],
      "abstention_reason": "outside_domain_expertise",
      "time_spent_ms": 18520,
      "timestamp": "2026-04-28T15:34:18Z"
    }
  ]
}
```

### Fields under `responses[]`

| Field | Type | Notes |
|---|---|---|
| `base_id` | string | Joins back to `queries.json`. |
| `subject_choice` | `"A"` \| `"B"` \| `"cannot_choose"` | Which slot the subject clicked, or an abstention when they cannot make a meaningful choice from the provided context. |
| `subject_choice_text` | string \| null | Full text of the selected A/B option. Strictly redundant with `options[0]` or `options[1]` indexed by `subject_choice`, but kept for readability and as a sanity check against parsing errors. `null` when `subject_choice` is `"cannot_choose"`. |
| `options` | `[string, string]` | The two option texts as the subject saw them. **Display order, not canonical order:** `options[0]` is the text rendered at slot A this session, `options[1]` is the text at slot B. This is *not* the same ordering as `rephrased_option_1` / `rephrased_option_2` in `queries.json`, because the frontend randomizes per session. |
| `abstention_reason` | string | Present only when `subject_choice` is `"cannot_choose"`. One of the reason codes below. |
| `time_spent_ms` | integer | Milliseconds from query render to submit. |
| `timestamp` | ISO8601 | When the choice was submitted. |

### Abstention reason codes

| Code | Label shown to subject |
|---|---|
| `context_unclear_insufficient` | Context unclear/insufficient |
| `options_dont_make_sense` | One or both options don't make sense |
| `outside_domain_expertise` | Outside domain expertise |
| `other` | Other |

**Important: the `options` array is in display order, not canonical order.** The frontend assigns each pair's two texts to slots A and B at session start (balanced as evenly as possible across the batch) and writes the texts into `options` in that order. Code that consumes the export must not assume `options[0]` corresponds to `rephrased_option_1` from the input file — match by string content.

`session.completed` is `true` only after all queries are answered. Partial exports (download mid-session) set `completed: false` with `queries_completed < queries_total`.

The frontend has no answer-key awareness. The analysis pipeline should apply any answer-key mapping outside the hosted frontend after response collection. Abstentions have `subject_choice_text: null` and should be analyzed separately.
