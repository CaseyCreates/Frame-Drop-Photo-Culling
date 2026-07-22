/* ===== FrameDrop — app.js ===== */

// ══════════════════════════════════════════
// STATE
// ══════════════════════════════════════════
let photos = [], idx = 0, deleted = [], kept = [], history = [], animating = false;
let delPage = 1, keepPage = 1;
const PER_PAGE = 12;
let aiOpen = true, aiAbortController = null;
let activeProvider = null; // 'anthropic' | 'openai' | 'google' | 'azure'
let selectedProviderInUI = null;

// ══════════════════════════════════════════
// PROVIDER CONFIG
// ══════════════════════════════════════════
const PROVIDERS = {
  anthropic: {
    name: 'Anthropic',
    model: 'Claude 3.5 Sonnet',
    storageKey: 'fd_key_anthropic',
    docsUrl: 'https://console.anthropic.com/account/keys',
    inputTitle: 'Anthropic API Key',
    placeholder: 'sk-ant-api03-…',
    hasExtras: false,
  },
  openai: {
    name: 'OpenAI',
    model: 'GPT-4o',
    storageKey: 'fd_key_openai',
    docsUrl: 'https://platform.openai.com/api-keys',
    inputTitle: 'OpenAI API Key',
    placeholder: 'sk-proj-…',
    hasExtras: false,
  },
  google: {
    name: 'Google Gemini',
    model: 'Gemini 1.5 Flash',
    storageKey: 'fd_key_google',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    inputTitle: 'Google AI Studio API Key',
    placeholder: 'AIza…',
    hasExtras: false,
  },
  azure: {
    name: 'Microsoft Azure',
    model: 'Azure OpenAI (GPT-4o)',
    storageKey: 'fd_key_azure',
    docsUrl: 'https://portal.azure.com/#view/Microsoft_Azure_ProjectOxford/CognitiveServicesHub/~/OpenAI',
    inputTitle: 'Azure OpenAI API Key',
    placeholder: 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
    hasExtras: true,
  },
};

// ══════════════════════════════════════════
// DOM REFS
// ══════════════════════════════════════════
const fi         = document.getElementById('file-input');
const dz         = document.getElementById('drop-zone');
const cs         = document.getElementById('card-stack');
const acw        = document.getElementById('active-card-wrap');
const doneScreen = document.getElementById('done-screen');
const card       = document.getElementById('photo-card');
const bgCard     = document.getElementById('bg-card');
const cardImg    = document.getElementById('card-img');
const cardName   = document.getElementById('card-name');
const cardSize   = document.getElementById('card-size');
const pFill      = document.getElementById('progress-fill');
const pText      = document.getElementById('progress-text');
const lKeep      = document.getElementById('label-keep');
const lDel       = document.getElementById('label-del');
const delList    = document.getElementById('del-list');
const keepList   = document.getElementById('keep-list');
const aiPanel    = document.getElementById('ai-panel');
const aiLoading  = document.getElementById('ai-loading');
const aiResult   = document.getElementById('ai-result');
const aiNoKey    = document.getElementById('ai-no-key');
const aiChevron  = document.getElementById('ai-chevron');

// ══════════════════════════════════════════
// INIT
// ══════════════════════════════════════════
(function init() {
  // Theme
  const savedTheme = localStorage.getItem('framedrop-theme');
  if (savedTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('theme-icon').className = 'ti ti-sun';
    document.getElementById('theme-opt-dark').classList.add('active');
  } else {
    document.getElementById('theme-opt-light').classList.add('active');
  }

  // Detect active provider — pick first one that has a saved key
  for (const [id] of Object.entries(PROVIDERS)) {
    if (localStorage.getItem(PROVIDERS[id].storageKey)) {
      activeProvider = id;
      break;
    }
  }

  // Mark provider dots for all that have keys
  for (const [id] of Object.entries(PROVIDERS)) {
    if (localStorage.getItem(PROVIDERS[id].storageKey)) {
      const dot = document.getElementById('pdot-' + id);
      if (dot) dot.classList.add('has-key');
      const card = document.getElementById('pcard-' + id);
      if (card) card.classList.add('has-key');
    }
  }

  updateStatusPill();
  updateActiveProviderSection();
})();

// ══════════════════════════════════════════
// THEME
// ══════════════════════════════════════════
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  setTheme(isDark ? 'light' : 'dark');
}

function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  document.getElementById('theme-icon').className = t === 'dark' ? 'ti ti-sun' : 'ti ti-moon';
  document.getElementById('theme-opt-light').classList.toggle('active', t === 'light');
  document.getElementById('theme-opt-dark').classList.toggle('active',  t === 'dark');
  localStorage.setItem('framedrop-theme', t);
}

// ══════════════════════════════════════════
// SETTINGS MODAL
// ══════════════════════════════════════════
function openSettings() {
  document.getElementById('settings-overlay').classList.add('open');
  updateActiveProviderSection();
}

function closeSettings(e) {
  if (e && e.target !== document.getElementById('settings-overlay')) return;
  document.getElementById('settings-overlay').classList.remove('open');
  selectedProviderInUI = null;
  document.getElementById('key-input-area').style.display = 'none';
  clearProviderActive();
}

function clearProviderActive() {
  document.querySelectorAll('.provider-card').forEach(c => c.classList.remove('active'));
}

function selectProvider(id) {
  selectedProviderInUI = id;
  clearProviderActive();
  const pcard = document.getElementById('pcard-' + id);
  if (pcard) pcard.classList.add('active');

  const cfg = PROVIDERS[id];
  if (!cfg) return;

  // Populate input area
  document.getElementById('key-input-area').style.display = '';
  document.getElementById('key-input-title').textContent = cfg.inputTitle;

  const docsBtn = document.getElementById('key-docs-link');
  docsBtn.textContent = 'Get API key ↗';
  docsBtn.onclick = () => window.open(cfg.docsUrl, '_blank');

  const inp = document.getElementById('key-input');
  inp.placeholder = cfg.placeholder;
  inp.type = 'password';
  document.getElementById('key-eye-icon').className = 'ti ti-eye';

  // Load existing key
  const existing = localStorage.getItem(cfg.storageKey) || '';
  inp.value = existing ? maskKey(existing) : '';
  inp.dataset.realValue = existing;
  inp.dataset.dirty = 'false';

  inp.oninput = () => { inp.dataset.dirty = 'true'; };

  // Azure extras
  document.getElementById('azure-extras').style.display = id === 'azure' ? '' : 'none';
  if (id === 'azure') {
    document.getElementById('azure-endpoint').value   = localStorage.getItem('fd_azure_endpoint') || '';
    document.getElementById('azure-deployment').value = localStorage.getItem('fd_azure_deployment') || '';
  }

  // Remove button
  document.getElementById('key-remove-btn').style.display = existing ? '' : 'none';
  document.getElementById('key-feedback').textContent = '';
  document.getElementById('key-feedback').className = 'key-feedback';
}

function maskKey(key) {
  if (key.length <= 8) return '••••••••';
  return key.slice(0, 6) + '••••••••' + key.slice(-4);
}

function toggleKeyVisibility() {
  const inp  = document.getElementById('key-input');
  const icon = document.getElementById('key-eye-icon');
  if (inp.type === 'password') {
    // Show real value if available
    const real = inp.dataset.dirty === 'true' ? inp.value : (inp.dataset.realValue || inp.value);
    inp.value = real;
    inp.type = 'text';
    icon.className = 'ti ti-eye-off';
  } else {
    inp.type = 'password';
    icon.className = 'ti ti-eye';
  }
}

async function saveApiKey() {
  const id  = selectedProviderInUI;
  const cfg = PROVIDERS[id];
  if (!cfg) return;

  const inp = document.getElementById('key-input');
  let keyValue = inp.dataset.dirty === 'true' ? inp.value.trim() : inp.dataset.realValue;

  if (!keyValue) {
    setFeedback('Please paste an API key first.', 'error');
    return;
  }

  // Azure extras
  if (id === 'azure') {
    const ep = document.getElementById('azure-endpoint').value.trim();
    const dp = document.getElementById('azure-deployment').value.trim();
    if (!ep || !dp) { setFeedback('Please fill in endpoint and deployment name.', 'error'); return; }
    localStorage.setItem('fd_azure_endpoint',   ep);
    localStorage.setItem('fd_azure_deployment', dp);
  }

  const btn = document.getElementById('key-save-btn');
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 0.8s linear infinite;display:inline-block;"></i> Verifying…';
  btn.disabled = true;
  setFeedback('', '');

  const ok = await verifyKey(id, keyValue);
  btn.innerHTML = '<i class="ti ti-check"></i> Save & activate';
  btn.disabled = false;

  if (ok) {
    localStorage.setItem(cfg.storageKey, keyValue);
    activeProvider = id;

    // Mark dots
    const dot = document.getElementById('pdot-' + id);
    if (dot) dot.classList.add('has-key');
    const pcard = document.getElementById('pcard-' + id);
    if (pcard) pcard.classList.add('has-key');
    document.getElementById('key-remove-btn').style.display = '';

    inp.dataset.realValue = keyValue;
    inp.dataset.dirty = 'false';
    inp.value = maskKey(keyValue);
    inp.type = 'password';

    setFeedback('✓ Key saved and AI analysis activated!', 'success');
    updateStatusPill();
    updateActiveProviderSection();

    // Re-run analysis if card is showing
    if (acw.style.display !== 'none' && idx < photos.length) {
      runAiAnalysis(photos[idx].url);
    }
  } else {
    setFeedback('✗ Key verification failed — check that the key is correct and try again.', 'error');
  }
}

function removeApiKey() {
  const id  = selectedProviderInUI;
  const cfg = PROVIDERS[id];
  if (!cfg) return;
  if (!confirm('Remove the saved ' + cfg.name + ' API key?')) return;

  localStorage.removeItem(cfg.storageKey);
  if (id === 'azure') {
    localStorage.removeItem('fd_azure_endpoint');
    localStorage.removeItem('fd_azure_deployment');
  }

  const dot = document.getElementById('pdot-' + id);
  if (dot) dot.classList.remove('has-key');
  const pcard = document.getElementById('pcard-' + id);
  if (pcard) pcard.classList.remove('has-key');
  document.getElementById('key-remove-btn').style.display = 'none';

  document.getElementById('key-input').value = '';
  document.getElementById('key-input').dataset.realValue = '';

  // If this was the active provider, try to fall back to another
  if (activeProvider === id) {
    activeProvider = null;
    for (const [pid] of Object.entries(PROVIDERS)) {
      if (localStorage.getItem(PROVIDERS[pid].storageKey)) { activeProvider = pid; break; }
    }
  }

  setFeedback('Key removed.', 'success');
  updateStatusPill();
  updateActiveProviderSection();

  if (acw.style.display !== 'none') showAiNoKey();
}

function deactivateProvider() {
  activeProvider = null;
  updateStatusPill();
  updateActiveProviderSection();
  if (acw.style.display !== 'none') showAiNoKey();
}

function setFeedback(msg, type) {
  const el = document.getElementById('key-feedback');
  el.textContent = msg;
  el.className = 'key-feedback ' + type;
}

function updateStatusPill() {
  const dot   = document.getElementById('ai-status-dot');
  const label = document.getElementById('ai-status-label');
  if (activeProvider) {
    dot.className   = 'ai-status-dot active';
    label.textContent = PROVIDERS[activeProvider].name + ' AI';
  } else {
    dot.className   = 'ai-status-dot';
    label.textContent = 'No AI';
  }
  // Update badge inside panel
  const badge = document.getElementById('ai-provider-badge');
  if (badge) badge.textContent = activeProvider ? PROVIDERS[activeProvider].name : '—';
}

function updateActiveProviderSection() {
  const section = document.getElementById('active-provider-section');
  if (!activeProvider) { section.style.display = 'none'; return; }
  section.style.display = '';
  const cfg = PROVIDERS[activeProvider];
  document.getElementById('apc-name').textContent  = cfg.name;
  document.getElementById('apc-model').textContent = cfg.model;
}

// ── Verify key with a minimal API call ──
async function verifyKey(id, key) {
  try {
    if (id === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-3-5-haiku-20241022', max_tokens: 5, messages: [{ role: 'user', content: 'Hi' }] })
      });
      return r.status === 200 || r.status === 529; // 529 = overloaded but key is valid
    }
    if (id === 'openai') {
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': 'Bearer ' + key }
      });
      return r.status === 200;
    }
    if (id === 'google') {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' + key);
      return r.status === 200;
    }
    if (id === 'azure') {
      const ep = localStorage.getItem('fd_azure_endpoint') || '';
      const dp = localStorage.getItem('fd_azure_deployment') || '';
      const url = ep.replace(/\/$/, '') + '/openai/deployments/' + dp + '/chat/completions?api-version=2024-08-01-preview';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'api-key': key, 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }], max_tokens: 5 })
      });
      return r.status === 200 || r.status === 400; // 400 means the key works but params may differ
    }
  } catch (_) { return false; }
  return false;
}

// ══════════════════════════════════════════
// AI ANALYSIS
// ══════════════════════════════════════════
function showAiNoKey() {
  aiPanel.style.display = '';
  aiNoKey.style.display = 'flex';
  aiLoading.style.display = 'none';
  aiResult.style.display = 'none';
}

function toggleAiPanel() {
  aiOpen = !aiOpen;
  document.getElementById('ai-panel-body').style.display = aiOpen ? '' : 'none';
  aiChevron.className = aiOpen ? 'ti ti-chevron-up' : 'ti ti-chevron-down';
}

const AI_PROMPT = `You are a professional photo editor assistant. Analyse this photo for quality issues a photographer would care about when culling a shoot. Respond ONLY with valid JSON — no markdown, no backticks, no explanation. Format exactly:
{
  "sharpness":    { "score": 0-100, "label": "Tack sharp"|"Slightly soft"|"Blurry"|"Very blurry", "note": "brief note" },
  "exposure":     { "score": 0-100, "label": "Well exposed"|"Slightly over"|"Overexposed"|"Slightly under"|"Underexposed", "note": "brief note" },
  "glare":        { "score": 0-100, "label": "None"|"Slight"|"Moderate"|"Heavy", "note": "brief note" },
  "noise":        { "score": 0-100, "label": "Clean"|"Low noise"|"Noisy"|"Very noisy", "note": "brief note" },
  "composition":  { "score": 0-100, "label": "Strong"|"Good"|"Average"|"Weak", "note": "brief note" },
  "verdict":      "keep"|"delete"|"maybe",
  "summary":      "One sentence recommendation for the photographer."
}`;

async function runAiAnalysis(imageUrl) {
  if (!activeProvider) { showAiNoKey(); return; }

  aiPanel.style.display = '';
  aiNoKey.style.display = 'none';
  aiLoading.style.display = 'flex';
  aiResult.style.display = 'none';
  aiResult.innerHTML = '';
  document.getElementById('ai-loading-label').textContent = 'Analysing with ' + PROVIDERS[activeProvider].name + '…';

  if (aiAbortController) aiAbortController.abort();
  aiAbortController = new AbortController();
  const signal = aiAbortController.signal;

  const dot = document.getElementById('ai-status-dot');
  dot.className = 'ai-status-dot loading';

  try {
    const blob   = await fetch(imageUrl).then(r => r.blob());
    const base64 = await blobToBase64(blob);
    const mime   = blob.type || 'image/jpeg';
    if (signal.aborted) return;

    let parsed;
    if      (activeProvider === 'anthropic') parsed = await analyseAnthropic(base64, mime, signal);
    else if (activeProvider === 'openai')    parsed = await analyseOpenAI(base64, mime, signal);
    else if (activeProvider === 'google')    parsed = await analyseGoogle(base64, mime, signal);
    else if (activeProvider === 'azure')     parsed = await analyseAzure(base64, mime, signal);

    if (signal.aborted) return;
    dot.className = 'ai-status-dot active';
    renderAiResult(parsed);
  } catch (err) {
    if (err.name === 'AbortError') return;
    dot.className = 'ai-status-dot error';
    aiLoading.style.display = 'none';
    aiResult.style.display = '';
    aiResult.innerHTML = '<div class="ai-error"><i class="ti ti-alert-circle"></i> Analysis failed: ' + err.message + '</div>';
  }
}

// ── Anthropic ──
async function analyseAnthropic(base64, mime, signal) {
  const key = localStorage.getItem(PROVIDERS.anthropic.storageKey);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 800,
      messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mime, data: base64 } },
        { type: 'text', text: AI_PROMPT }
      ]}]
    })
  });
  if (!r.ok) throw new Error('Anthropic API error ' + r.status);
  const d = await r.json();
  return parseJsonResponse(d.content.map(c => c.text || '').join(''));
}

// ── OpenAI ──
async function analyseOpenAI(base64, mime, signal) {
  const key = localStorage.getItem(PROVIDERS.openai.storageKey);
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST', signal,
    headers: { 'Authorization': 'Bearer ' + key, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 800,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + base64, detail: 'high' } },
        { type: 'text', text: AI_PROMPT }
      ]}]
    })
  });
  if (!r.ok) throw new Error('OpenAI API error ' + r.status);
  const d = await r.json();
  return parseJsonResponse(d.choices[0].message.content);
}

// ── Google Gemini ──
async function analyseGoogle(base64, mime, signal) {
  const key = localStorage.getItem(PROVIDERS.google.storageKey);
  const r = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + key,
    {
      method: 'POST', signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { inline_data: { mime_type: mime, data: base64 } },
          { text: AI_PROMPT }
        ]}],
        generationConfig: { maxOutputTokens: 800, temperature: 0.1 }
      })
    }
  );
  if (!r.ok) throw new Error('Google API error ' + r.status);
  const d = await r.json();
  return parseJsonResponse(d.candidates[0].content.parts[0].text);
}

// ── Azure OpenAI ──
async function analyseAzure(base64, mime, signal) {
  const key = localStorage.getItem(PROVIDERS.azure.storageKey);
  const ep  = localStorage.getItem('fd_azure_endpoint').replace(/\/$/, '');
  const dp  = localStorage.getItem('fd_azure_deployment');
  const url = ep + '/openai/deployments/' + dp + '/chat/completions?api-version=2024-08-01-preview';
  const r = await fetch(url, {
    method: 'POST', signal,
    headers: { 'api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({
      max_tokens: 800,
      messages: [{ role: 'user', content: [
        { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + base64, detail: 'high' } },
        { type: 'text', text: AI_PROMPT }
      ]}]
    })
  });
  if (!r.ok) throw new Error('Azure API error ' + r.status);
  const d = await r.json();
  return parseJsonResponse(d.choices[0].message.content);
}

function parseJsonResponse(text) {
  const clean = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(clean); }
  catch (_) {
    const m = clean.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]);
    throw new Error('Could not parse AI response');
  }
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = () => res(r.result.split(',')[1]);
    r.onerror = () => rej(new Error('Read failed'));
    r.readAsDataURL(blob);
  });
}

function renderAiResult(d) {
  aiLoading.style.display = 'none';
  aiResult.style.display  = '';

  const metrics = [
    { key: 'sharpness',   label: 'Sharpness' },
    { key: 'exposure',    label: 'Exposure' },
    { key: 'glare',       label: 'Glare (lower = better)' },
    { key: 'noise',       label: 'Noise (lower = better)' },
    { key: 'composition', label: 'Composition' }
  ];
  const invertedKeys = new Set(['glare', 'noise']);

  let html = '<div class="ai-scores">';
  metrics.forEach(({ key, label }) => {
    const m = d[key]; if (!m) return;
    const raw = parseInt(m.score, 10) || 0;
    const pct = invertedKeys.has(key) ? 100 - raw : raw;
    const cls = pct >= 70 ? 'good' : pct >= 40 ? 'warn' : 'bad';
    html += `
      <div class="score-row">
        <div class="score-label-row">
          <span class="score-label" title="${m.note || ''}">${label}</span>
          <span class="score-value score-${cls}">${m.label}</span>
        </div>
        <div class="score-bar-bg">
          <div class="score-bar-fill bar-${cls}" style="width:${pct}%"></div>
        </div>
      </div>`;
  });
  html += '</div>';

  const vCls  = d.verdict === 'keep' ? 'verdict-keep' : d.verdict === 'delete' ? 'verdict-delete' : 'verdict-ok';
  const vIcon = d.verdict === 'keep' ? '✓ Keep' : d.verdict === 'delete' ? '✕ Consider deleting' : '⚡ Your call';
  html += `<div class="ai-verdict ${vCls}"><strong>${vIcon}:</strong> ${d.summary}</div>`;
  aiResult.innerHTML = html;
}

// ══════════════════════════════════════════
// TOOLTIP
// ══════════════════════════════════════════
function toggleTooltip(id) {
  document.getElementById(id).classList.toggle('open');
}

// ══════════════════════════════════════════
// TAB SWITCHING
// ══════════════════════════════════════════
function switchTab(t) {
  document.getElementById('tab-del').classList.toggle('active',  t === 'del');
  document.getElementById('tab-keep').classList.toggle('active', t === 'keep');
  delList.classList.toggle('hidden',  t !== 'del');
  keepList.classList.toggle('hidden', t !== 'keep');
  document.getElementById('del-footer').style.display   = t === 'del'  ? 'flex' : 'none';
  document.getElementById('keep-footer').style.display  = t === 'keep' ? 'flex' : 'none';
  document.getElementById('del-pagination').style.display  = (t === 'del'  && deleted.length > PER_PAGE) ? 'flex' : 'none';
  document.getElementById('keep-pagination').style.display = (t === 'keep' && kept.length    > PER_PAGE) ? 'flex' : 'none';
}

// ══════════════════════════════════════════
// FILE LOADING
// ══════════════════════════════════════════
fi.addEventListener('change', e => loadFiles(Array.from(e.target.files)));
dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
dz.addEventListener('dragleave', ()  => dz.classList.remove('drag-over'));
dz.addEventListener('drop', e => {
  e.preventDefault(); dz.classList.remove('drag-over');
  const files = Array.from(e.dataTransfer.files).filter(f =>
    f.type.startsWith('image/') || /\.(heic|raw|arw|cr2|nef|dng|orf|rw2)$/i.test(f.name)
  );
  if (files.length) loadFiles(files);
});

function loadFiles(files) {
  if (!files.length) return;
  photos = files.map(f => ({ file: f, url: URL.createObjectURL(f) }));
  idx = 0; deleted = []; kept = []; history = []; delPage = 1; keepPage = 1;
  delList.innerHTML  = '<div class="empty-pile">Nothing here yet</div>';
  keepList.innerHTML = '<div class="empty-pile">Nothing here yet</div>';
  updateBadges(); updateFooter();
  dz.style.display = 'none';
  cs.style.display = 'block';
  doneScreen.style.display = 'none';
  acw.style.display = 'block';
  showCard();
}

// ══════════════════════════════════════════
// CARD DISPLAY
// ══════════════════════════════════════════
function showCard() {
  if (idx >= photos.length) { showDone(); return; }
  const { file, url } = photos[idx];
  cardImg.src = url;
  cardName.textContent = file.name;
  cardSize.textContent = fmt(file.size);
  lKeep.style.opacity = 0; lDel.style.opacity = 0;
  bgCard.style.transform = 'scale(0.94) translateY(14px)';
  updateProgress(); resetDrag();
  runAiAnalysis(url);
}

function updateProgress() {
  const total = photos.length, done = idx;
  pFill.style.width = (total ? Math.round(done / total * 100) : 0) + '%';
  pText.textContent = done + ' of ' + total + ' reviewed';
  document.getElementById('stat-kept').textContent = kept.length;
  document.getElementById('stat-del').textContent  = deleted.length;
  document.getElementById('stat-rem').textContent  = total - done;
}

function updateBadges() {
  document.getElementById('del-count').textContent  = deleted.length;
  document.getElementById('keep-count').textContent = kept.length;
}

function updateFooter() {
  const hasDel  = deleted.length > 0;
  const hasKeep = kept.length > 0;
  document.getElementById('export-btn').style.display   = hasDel  ? '' : 'none';
  document.getElementById('script-wrap').style.display  = hasDel  ? '' : 'none';
  document.getElementById('dl-all-btn').style.display   = hasKeep ? '' : 'none';
}

function fmt(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return Math.round(b / 1024) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

// ══════════════════════════════════════════
// PAGINATED GRID
// ══════════════════════════════════════════
function renderGrid(list, items, page, type) {
  if (!items.length) { list.innerHTML = '<div class="empty-pile">Nothing here yet</div>'; return; }
  const total = Math.ceil(items.length / PER_PAGE);
  const pg    = Math.min(Math.max(page, 1), total);
  const slice = items.slice((pg - 1) * PER_PAGE, pg * PER_PAGE);

  const pgId   = type;
  const pgEl   = document.getElementById(pgId + '-pagination');
  const pgInfo = document.getElementById(pgId + '-pg-info');
  const pgPrev = document.getElementById(pgId + '-pg-prev');
  const pgNext = document.getElementById(pgId + '-pg-next');
  pgEl.style.display  = items.length > PER_PAGE ? 'flex' : 'none';
  pgInfo.textContent  = 'Page ' + pg + ' of ' + total;
  pgPrev.disabled     = pg <= 1;
  pgNext.disabled     = pg >= total;

  const grid = document.createElement('div');
  grid.className = 'photo-grid';
  slice.forEach(photo => {
    const cell = document.createElement('div');
    cell.className = 'grid-thumb';
    const safeName = photo.file.name.replace(/'/g, "&#39;");
    const dlBtn = type === 'keep'
      ? `<button class="thumb-dl" onclick="event.stopPropagation();dlOne('${photo.url}','${safeName}')" title="Download"><i class="ti ti-download"></i></button>`
      : '';
    cell.innerHTML = `<img src="${photo.url}" alt="${safeName}" loading="lazy"><div class="grid-thumb-overlay"><span class="thumb-name">${photo.file.name}</span>${dlBtn}</div>`;
    cell.addEventListener('click', () => openLightbox(photo.url));
    grid.appendChild(cell);
  });
  list.innerHTML = '';
  list.appendChild(grid);
}

function changePage(type, dir) {
  if (type === 'del') {
    delPage = Math.max(1, Math.min(delPage + dir, Math.ceil(deleted.length / PER_PAGE)));
    renderGrid(delList, deleted, delPage, 'del');
  } else {
    keepPage = Math.max(1, Math.min(keepPage + dir, Math.ceil(kept.length / PER_PAGE)));
    renderGrid(keepList, kept, keepPage, 'keep');
  }
}

// ══════════════════════════════════════════
// KEEP / DELETE
// ══════════════════════════════════════════
function animateSwipe(dir, cb) {
  if (animating) return; animating = true;
  card.classList.add(dir === 'right' ? 'anim-fly-right' : 'anim-fly-left');
  bgCard.classList.add('anim-bounce-in');
  setTimeout(() => {
    card.classList.remove('anim-fly-right', 'anim-fly-left');
    bgCard.classList.remove('anim-bounce-in');
    animating = false; cb();
  }, 370);
}

function doKeep() {
  if (idx >= photos.length || animating) return;
  const photo = photos[idx]; lKeep.style.opacity = 1;
  animateSwipe('right', () => {
    history.push({ action: 'keep', photo, index: idx });
    kept.push(photo);
    keepPage = Math.ceil(kept.length / PER_PAGE);
    renderGrid(keepList, kept, keepPage, 'keep');
    idx++; updateBadges(); updateFooter(); showCard();
  });
}

function doDelete() {
  if (idx >= photos.length || animating) return;
  const photo = photos[idx]; lDel.style.opacity = 1;
  animateSwipe('left', () => {
    history.push({ action: 'delete', photo, index: idx });
    deleted.push(photo);
    delPage = Math.ceil(deleted.length / PER_PAGE);
    renderGrid(delList, deleted, delPage, 'del');
    idx++; updateBadges(); updateFooter(); showCard();
  });
}

function undoLast() {
  if (!history.length || animating) return;
  const last = history.pop(); idx = last.index;
  if (last.action === 'delete') {
    deleted.pop(); renderGrid(delList, deleted, delPage, 'del');
  } else {
    kept.pop(); renderGrid(keepList, kept, keepPage, 'keep');
  }
  if (doneScreen.style.display !== 'none') {
    doneScreen.style.display = 'none'; acw.style.display = 'block';
  }
  updateBadges(); updateFooter(); showCard();
}

// ══════════════════════════════════════════
// DONE SCREEN
// ══════════════════════════════════════════
function showDone() {
  if (aiAbortController) aiAbortController.abort();
  aiPanel.style.display = 'none';
  acw.style.display = 'none'; doneScreen.style.display = 'flex';
  document.getElementById('done-summary').textContent =
    'Kept ' + kept.length + ' photo' + (kept.length !== 1 ? 's' : '') +
    ', marked ' + deleted.length + ' for deletion.';
  updateProgress();
}

// ══════════════════════════════════════════
// LIGHTBOX
// ══════════════════════════════════════════
function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lightbox-img').src = '';
}

// ══════════════════════════════════════════
// DOWNLOADS
// ══════════════════════════════════════════
function dlOne(url, name) {
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
}

async function downloadAllKept() {
  if (!kept.length) return;
  if (typeof JSZip === 'undefined') { alert('JSZip not loaded — check your connection.'); return; }
  const btn = document.getElementById('dl-all-btn');
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 0.8s linear infinite;display:inline-block;"></i> Zipping…';
  btn.disabled = true;
  try {
    const zip = new JSZip();
    for (const p of kept) {
      const blob = await fetch(p.url).then(r => r.blob());
      zip.file(p.file.name, blob);
    }
    const zb = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const a  = document.createElement('a');
    a.href     = URL.createObjectURL(zb);
    a.download = 'framedrop-kept-photos.zip';
    a.click();
  } catch(e) {
    alert('Error creating zip: ' + e.message);
  } finally {
    btn.innerHTML = orig; btn.disabled = false;
  }
}

function exportDeleteList() {
  if (!deleted.length) return;
  dlText('# FrameDrop — photos marked for deletion\n# Generated: ' + new Date().toLocaleString() + '\n\n' +
    deleted.map(p => p.file.name).join('\n'), 'framedrop-delete-list.txt');
}

function exportShellScript() {
  if (!deleted.length) return;
  let s = '#!/bin/bash\n# FrameDrop — move deleted photos to a subfolder\n';
  s += '# Usage: cd into your photo folder, then run: bash framedrop-move-deleted.sh\n';
  s += '# Generated: ' + new Date().toLocaleString() + '\n\n';
  s += 'DEST="./FrameDrop_Deleted"\nmkdir -p "$DEST"\n\n';
  deleted.forEach(p => { s += 'mv "' + p.file.name.replace(/"/g, '\\"') + '" "$DEST/"\n'; });
  s += '\necho "Done — ' + deleted.length + ' photo(s) moved to $DEST"\n';
  s += 'open "$DEST" 2>/dev/null || xdg-open "$DEST" 2>/dev/null\n';
  dlText(s, 'framedrop-move-deleted.sh');
}

function dlText(c, n) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([c], { type: 'text/plain' }));
  a.download = n; a.click();
}

// ══════════════════════════════════════════
// RESET
// ══════════════════════════════════════════
function resetApp() {
  if (aiAbortController) aiAbortController.abort();
  photos = []; idx = 0; deleted = []; kept = []; history = [];
  delPage = 1; keepPage = 1; animating = false;
  dz.style.display = ''; cs.style.display = 'none';
  doneScreen.style.display = 'none'; acw.style.display = 'none';
  aiPanel.style.display = 'none';
  delList.innerHTML  = '<div class="empty-pile">Nothing here yet</div>';
  keepList.innerHTML = '<div class="empty-pile">Nothing here yet</div>';
  updateBadges(); updateFooter();
  ['stat-kept','stat-del','stat-rem'].forEach(id => document.getElementById(id).textContent = 0);
  fi.value = '';
}

// ══════════════════════════════════════════
// DRAG TO SWIPE
// ══════════════════════════════════════════
let dragX = 0, dragging = false, curX = 0;

function resetDrag() {
  card.style.transform = ''; card.style.transition = '';
  lKeep.style.opacity = 0; lDel.style.opacity = 0;
}

card.addEventListener('mousedown', e => {
  if (animating) return; dragging = true; dragX = e.clientX; card.style.transition = 'none';
});
document.addEventListener('mousemove', e => {
  if (!dragging) return;
  curX = e.clientX - dragX;
  card.style.transform = `translateX(${curX}px) rotate(${curX * 0.08}deg)`;
  lKeep.style.opacity = curX >  40 ? Math.min(1, (curX - 40) / 60)  : 0;
  lDel.style.opacity  = curX < -40 ? Math.min(1, (-curX - 40) / 60) : 0;
  const scale = 0.94 + Math.min(0.06, Math.abs(curX) / 800);
  const ty    = 14   - Math.min(14,   Math.abs(curX) / 8);
  bgCard.style.transform = `scale(${scale}) translateY(${ty}px)`;
});
document.addEventListener('mouseup', () => {
  if (!dragging) return; dragging = false;
  card.style.transition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';
  if      (curX >  110) doKeep();
  else if (curX < -110) doDelete();
  else { resetDrag(); bgCard.style.transform = 'scale(0.94) translateY(14px)'; }
  curX = 0;
});

card.addEventListener('touchstart', e => {
  if (animating) return; dragX = e.touches[0].clientX; card.style.transition = 'none';
}, { passive: true });
card.addEventListener('touchmove', e => {
  curX = e.touches[0].clientX - dragX;
  card.style.transform = `translateX(${curX}px) rotate(${curX * 0.08}deg)`;
  lKeep.style.opacity = curX >  40 ? Math.min(1, (curX - 40) / 60)  : 0;
  lDel.style.opacity  = curX < -40 ? Math.min(1, (-curX - 40) / 60) : 0;
  const scale = 0.94 + Math.min(0.06, Math.abs(curX) / 800);
  bgCard.style.transform = `scale(${scale}) translateY(${14 - Math.min(14, Math.abs(curX) / 8)}px)`;
}, { passive: true });
card.addEventListener('touchend', () => {
  card.style.transition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';
  if      (curX >  110) doKeep();
  else if (curX < -110) doDelete();
  else { resetDrag(); bgCard.style.transform = 'scale(0.94) translateY(14px)'; }
  curX = 0;
});

// ══════════════════════════════════════════
// KEYBOARD
// ══════════════════════════════════════════
document.addEventListener('keydown', e => {
  if (document.getElementById('settings-overlay').classList.contains('open')) return;
  if (e.key === 'Escape')      closeLightbox();
  if (e.key === 'ArrowLeft')   doDelete();
  if (e.key === 'ArrowRight')  doKeep();
  if (e.key === 'z' || e.key === 'Z') undoLast();
});
