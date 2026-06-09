/* ============================================================
   Human Baseline Collector — app.js
   Single-file vanilla JS. No bundler, no framework.
   See REQUIREMENTS.md and SCHEMA.md for design contracts.
   ============================================================ */


/* ----- localStorage keys ------------------------------------ */

const STORAGE_KEYS = {
  subject_id:    'hbc_subject_id',
  intake:        'hbc_intake',
  assignments:   'hbc_assignments',
  query_order:   'hbc_query_order',
  responses:     'hbc_responses',
  current_index: 'hbc_current_index',
  session_start: 'hbc_session_start',
};


/* ----- Runtime state (in memory; not persisted) ------------- */

const APP = {
  queries: [],          // loaded from data/queries.json
  assignments: {},      // {base_id → "option_1" | "option_2"} = which option is at slot A
  queryOrder: [],       // randomized base_id sequence for this subject's session
  currentIndex: 0,      // index into APP.queries
  queryRenderTime: 0,   // performance.now() snapshot, for time_spent_ms
};

const ABSTENTION_CHOICE = 'cannot_choose';
const ABSTENTION_REASONS = new Set([
  'context_unclear_insufficient',
  'options_dont_make_sense',
  'outside_domain_expertise',
  'other',
]);


/* ----- State (localStorage) --------------------------------- */

function loadState() {
  const result = {};
  for (const [key, storageKey] of Object.entries(STORAGE_KEYS)) {
    const raw = localStorage.getItem(storageKey);
    if (raw === null) continue;
    try { result[key] = JSON.parse(raw); }
    catch { result[key] = raw; }
  }
  return result;
}

function saveState(patch) {
  for (const [key, value] of Object.entries(patch)) {
    const storageKey = STORAGE_KEYS[key];
    if (!storageKey) continue;
    localStorage.setItem(storageKey, JSON.stringify(value));
  }
}

function clearState() {
  Object.values(STORAGE_KEYS).forEach(k => localStorage.removeItem(k));
}


/* ----- Data + setup ----------------------------------------- */

async function loadQueries() {
  const res = await fetch('data/queries.json');
  if (!res.ok) throw new Error(`Failed to load queries.json (HTTP ${res.status})`);
  return res.json();
}

// Balanced 50/50: half the pairs get option_1 at slot A, the other half option_2 at slot A.
// Fisher-Yates shuffled. Persisted on first call so a refresh doesn't re-roll.
function assignOrderings(queries) {
  const existing = loadState().assignments;
  if (existing && queries.every(q => q.base_id in existing)) {
    return existing;
  }
  const n = queries.length;
  const halfA = Math.ceil(n / 2);
  const arr = [
    ...new Array(halfA).fill('option_1'),
    ...new Array(n - halfA).fill('option_2'),
  ];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const assignments = {};
  queries.forEach((q, i) => { assignments[q.base_id] = arr[i]; });
  saveState({ assignments });
  return assignments;
}

// Randomized query order for this session. Persisted on first call so refreshes
// and partial downloads preserve the same sequence.
function assignQueryOrder(queries) {
  const existing = loadState().query_order;
  const queryIds = new Set(queries.map(q => q.base_id));

  if (
    existing &&
    existing.length === queries.length &&
    existing.every(baseId => queryIds.has(baseId))
  ) {
    return existing;
  }

  const order = queries.map(q => q.base_id);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }

  saveState({ query_order: order });
  return order;
}

function getQueryAtDisplayIndex(idx) {
  const baseId = APP.queryOrder[idx];
  return APP.queries.find(q => q.base_id === baseId) || APP.queries[idx];
}


/* ----- Views ------------------------------------------------ */

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const target = document.getElementById(`view-${name}`);
  if (target) target.classList.add('active');
}

function renderQuery(idx) {
  const query = getQueryAtDisplayIndex(idx);
  const total = APP.queries.length;
  const ordering = APP.assignments[query.base_id]; // which option is at slot A this session

  // Progress label (Roman numerals) and bar (% reflects completed queries before this one)
  document.getElementById('query-progress-current').textContent = toRoman(idx + 1);
  document.getElementById('query-progress-total').textContent = toRoman(total);
  document.getElementById('query-progress-fill')
    .style.setProperty('--progress', `${(idx / total) * 100}%`);

  // Research goal
  document.getElementById('query-research-goal').textContent = query.research_goal;

  // Hypotheses list (clone the <template> per item)
  const list = document.getElementById('query-hypotheses-list');
  list.replaceChildren();
  const template = document.getElementById('hypothesis-template');
  for (const item of query.current_progress) {
    const clone = template.content.cloneNode(true);
    clone.querySelector('.hypothesis__text').textContent = item.text;
    clone.querySelector('.hypothesis__result-text').textContent = item.key_result;
    list.appendChild(clone);
  }

  // Options laid out in display order: ordering says which option goes at slot A
  const textAtA = ordering === 'option_1' ? query.rephrased_option_1 : query.rephrased_option_2;
  const textAtB = ordering === 'option_1' ? query.rephrased_option_2 : query.rephrased_option_1;
  document.getElementById('option-a-text').textContent = textAtA;
  document.getElementById('option-b-text').textContent = textAtB;

  // Reset interaction state
  resetQueryInteraction();

  // Capture render time for the time-spent calculation on submit
  APP.queryRenderTime = performance.now();

  showView('query');

  // Scroll back to top so the next query starts from the top of the page
  // (and reset the sticky decision column's internal scroll, if any)
  window.scrollTo(0, 0);
  document.querySelector('.query-decision')?.scrollTo(0, 0);
}

function renderEnd() {
  // On the end view, the prominent "Download responses" button is the only
  // affordance; hide the persistent corner button so there's a single CTA.
  document.getElementById('download-button').hidden = true;
  showView('end');
}


/* ----- Handlers --------------------------------------------- */

function checkActiveSession() {
  const state = loadState();
  if (!state.subject_id) {
    showView('intake');
    return;
  }
  const completed = state.responses?.length ?? 0;
  const total = APP.queries.length;
  const name = state.intake?.name || 'subject';

  const resume = window.confirm(
    `An in-progress session was found for "${name}" ` +
    `(${completed} of ${total} answered).\n\n` +
    `Click OK to resume. Click Cancel to start fresh.`
  );

  if (!resume) {
    clearState();
    showView('intake');
    return;
  }

  APP.assignments = state.assignments || {};
  APP.queryOrder = state.query_order || assignQueryOrder(APP.queries);
  APP.currentIndex = state.current_index || 0;
  document.getElementById('download-button').hidden = false;

  if (APP.currentIndex >= total) {
    renderEnd();
  } else {
    renderQuery(APP.currentIndex);
  }
}

function handleIntakeSubmit(form) {
  const data = new FormData(form);
  const name = data.get('name')?.toString().trim();
  const qualification = data.get('qualification')?.toString().trim();
  const years = parseInt(data.get('years_ml_experience'), 10);
  const noTools = form.querySelector('[name=attestation_no_tools]').checked;
  const partialOk = form.querySelector('[name=attestation_partial_ok]').checked;

  if (!name || !qualification || isNaN(years) || !noTools || !partialOk) {
    alert('Please fill in all fields and check both attestations.');
    return;
  }

  const sessionStart = nowIso();
  const subjectId = slugifyName(name, sessionStart);

  const intake = {
    name,
    qualification,
    years_ml_experience: years,
    attestation_no_tools: noTools,
    attestation_partial_ok: partialOk,
  };

  APP.assignments = assignOrderings(APP.queries);
  APP.queryOrder = assignQueryOrder(APP.queries);
  APP.currentIndex = 0;

  saveState({
    subject_id: subjectId,
    intake,
    session_start: sessionStart,
    responses: [],
    current_index: 0,
  });

  document.getElementById('instructions-total').textContent = APP.queries.length;
  document.getElementById('download-button').hidden = false;
  showView('instructions');
}

function handleQuerySubmit(choice, abstentionReason = null) {
  const idx = APP.currentIndex;
  const query = getQueryAtDisplayIndex(idx);
  const ordering = APP.assignments[query.base_id];

  const textAtA = ordering === 'option_1' ? query.rephrased_option_1 : query.rephrased_option_2;
  const textAtB = ordering === 'option_1' ? query.rephrased_option_2 : query.rephrased_option_1;
  const isAbstention = choice === ABSTENTION_CHOICE;
  const choiceText = choice === 'A' ? textAtA : choice === 'B' ? textAtB : null;

  if (isAbstention && !ABSTENTION_REASONS.has(abstentionReason)) return;
  if (!isAbstention && choiceText === null) return;

  const response = {
    base_id: query.base_id,
    subject_choice: choice,
    subject_choice_text: choiceText,
    options: [textAtA, textAtB],   // display order: [text at A, text at B]
    ...(isAbstention ? { abstention_reason: abstentionReason } : {}),
    time_spent_ms: Math.round(performance.now() - APP.queryRenderTime),
    timestamp: nowIso(),
  };

  const state = loadState();
  const responses = (state.responses || []).slice();
  responses.push(response);
  const newIndex = idx + 1;

  saveState({ responses, current_index: newIndex });
  APP.currentIndex = newIndex;

  if (newIndex >= APP.queries.length) {
    renderEnd();
  } else {
    renderQuery(newIndex);
  }
}

function handleDownload() {
  const state = loadState();
  if (!state.subject_id) return;   // nothing to download yet
  const exportObj = formatExport();
  const filename = `${state.subject_id}.json`;
  downloadJSON(exportObj, filename);
}


/* ----- Helpers ---------------------------------------------- */

function slugifyName(name, isoTimestamp) {
  const slug = name.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const d = new Date(isoTimestamp);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${slug}-${yyyy}${mm}${dd}-${hh}${mi}`;
}

function nowIso() {
  return new Date().toISOString();
}

const ROMAN_NUMERALS = [
  [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
  [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
  [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
];

function toRoman(num) {
  let result = '';
  for (const [val, sym] of ROMAN_NUMERALS) {
    while (num >= val) { result += sym; num -= val; }
  }
  return result;
}

function getSelectedAbstentionReason() {
  return document.querySelector('[name=abstention_reason]:checked')?.value || null;
}

function clearAbstentionReasons() {
  document.querySelectorAll('[name=abstention_reason]').forEach(input => {
    input.checked = false;
  });
}

function setAbstentionReasonsVisible(visible) {
  document.getElementById('abstention-reasons').hidden = !visible;
}

function updateQuerySubmitState() {
  const selected = document.querySelector('.option.is-selected');
  const submit = document.getElementById('query-submit');
  if (!selected) {
    submit.disabled = true;
    return;
  }
  const isAbstention = selected.dataset.slot === ABSTENTION_CHOICE;
  submit.disabled = isAbstention && !getSelectedAbstentionReason();
}

function resetQueryInteraction() {
  document.querySelectorAll('.option').forEach(o => o.classList.remove('is-selected'));
  clearAbstentionReasons();
  setAbstentionReasonsVisible(false);
  document.getElementById('query-submit').disabled = true;
}

function formatExport() {
  const state = loadState();
  const total = APP.queries.length;
  const responses = state.responses || [];
  return {
    subject: {
      subject_id: state.subject_id,
      submitted_at: nowIso(),
      intake: state.intake,
    },
    session: {
      start_time: state.session_start,
      end_time: nowIso(),
      completed: responses.length === total,
      queries_total: total,
      queries_completed: responses.length,
      query_order: state.query_order,
    },
    responses,
  };
}

function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}


/* ----- Bootstrap -------------------------------------------- */

document.addEventListener('DOMContentLoaded', async () => {
  // Intake form
  const intakeForm = document.getElementById('intake-form');
  intakeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    handleIntakeSubmit(intakeForm);
  });

  // Instructions Begin button
  document.getElementById('instructions-start').addEventListener('click', () => {
    renderQuery(APP.currentIndex);
  });

  // Option selection (click anywhere on the option card)
  document.querySelectorAll('.option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.option').forEach(o => o.classList.remove('is-selected'));
      opt.classList.add('is-selected');
      const isAbstention = opt.dataset.slot === ABSTENTION_CHOICE;
      setAbstentionReasonsVisible(isAbstention);
      if (!isAbstention) clearAbstentionReasons();
      updateQuerySubmitState();
    });
  });

  document.querySelectorAll('[name=abstention_reason]').forEach(input => {
    input.addEventListener('change', updateQuerySubmitState);
  });

  // Submit & continue
  document.getElementById('query-submit').addEventListener('click', () => {
    const selected = document.querySelector('.option.is-selected');
    if (!selected) return;
    const choice = selected.dataset.slot;
    const abstentionReason = choice === ABSTENTION_CHOICE ? getSelectedAbstentionReason() : null;
    handleQuerySubmit(choice, abstentionReason);
  });

  // Download buttons (persistent + end-view)
  document.getElementById('end-download').addEventListener('click', handleDownload);
  document.getElementById('download-button').addEventListener('click', handleDownload);

  // Load queries, then check for an active session
  try {
    APP.queries = await loadQueries();
  } catch (err) {
    alert(
      `Failed to load queries: ${err.message}\n\n` +
      `Make sure data/queries.json exists and the page is served over http (not opened directly via file://).`
    );
    return;
  }

  if (APP.queries.length === 0) {
    alert('No queries to show. Check data/queries.json.');
    return;
  }

  APP.queryOrder = APP.queries.map(q => q.base_id);
  document.getElementById('instructions-total').textContent = APP.queries.length;
  checkActiveSession();
});
