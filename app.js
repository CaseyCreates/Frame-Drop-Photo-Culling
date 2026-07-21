/* ===== FrameDrop — app.js ===== */

// ── State ──
let photos = [], idx = 0, deleted = [], kept = [], history = [], animating = false;
let delPage = 1, keepPage = 1;
const PER_PAGE = 12;
let aiOpen = true, aiAbortController = null;

// ── DOM refs ──
const fi          = document.getElementById('file-input');
const dz          = document.getElementById('drop-zone');
const cs          = document.getElementById('card-stack');
const acw         = document.getElementById('active-card-wrap');
const doneScreen  = document.getElementById('done-screen');
const card        = document.getElementById('photo-card');
const bgCard      = document.getElementById('bg-card');
const cardImg     = document.getElementById('card-img');
const cardName    = document.getElementById('card-name');
const cardSize    = document.getElementById('card-size');
const pFill       = document.getElementById('progress-fill');
const pText       = document.getElementById('progress-text');
const lKeep       = document.getElementById('label-keep');
const lDel        = document.getElementById('label-del');
const delList     = document.getElementById('del-list');
const keepList    = document.getElementById('keep-list');
const aiPanel     = document.getElementById('ai-panel');
const aiLoading   = document.getElementById('ai-loading');
const aiResult    = document.getElementById('ai-result');
const aiChevron   = document.getElementById('ai-chevron');

// ── Helpers ──
function fmt(b) {
  if (b < 1024) return b + ' B';
  if (b < 1048576) return Math.round(b / 1024) + ' KB';
  return (b / 1048576).toFixed(1) + ' MB';
}

// ── Theme toggle ──
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute('data-theme') === 'dark';
  html.setAttribute('data-theme', isDark ? 'light' : 'dark');
  document.getElementById('theme-icon').className = isDark ? 'ti ti-moon' : 'ti ti-sun';
  localStorage.setItem('framedrop-theme', isDark ? 'light' : 'dark');
}
(function initTheme() {
  const saved = localStorage.getItem('framedrop-theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.getElementById('theme-icon').className = 'ti ti-sun';
  }
})();

// ── Tab switching ──
function switchTab(t) {
  document.getElementById('tab-del').classList.toggle('active', t === 'del');
  document.getElementById('tab-keep').classList.toggle('active', t === 'keep');
  delList.classList.toggle('hidden', t !== 'del');
  keepList.classList.toggle('hidden', t !== 'keep');
  document.getElementById('del-footer').style.display  = t === 'del'  ? 'flex' : 'none';
  document.getElementById('keep-footer').style.display = t === 'keep' ? 'flex' : 'none';
  document.getElementById('del-pagination').style.display  = (t === 'del'  && deleted.length > PER_PAGE) ? 'flex' : 'none';
  document.getElementById('keep-pagination').style.display = (t === 'keep' && kept.length > PER_PAGE)    ? 'flex' : 'none';
}

// ── Tooltip ──
function toggleTooltip(id) {
  document.getElementById(id).classList.toggle('open');
}

// ── AI panel toggle ──
function toggleAiPanel() {
  aiOpen = !aiOpen;
  document.getElementById('ai-panel-body').style.display = aiOpen ? '' : 'none';
  aiChevron.className = aiOpen ? 'ti ti-chevron-up' : 'ti ti-chevron-down';
}

// ── File loading ──
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

// ── Show current card ──
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

// ── Progress ──
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
  document.getElementById('export-btn').style.display = hasDel  ? '' : 'none';
  document.getElementById('script-wrap').style.display = hasDel ? '' : 'none';
  document.getElementById('dl-all-btn').style.display  = hasKeep ? '' : 'none';
}

// ── Paginated grid rendering ──
function renderGrid(list, items, page, type) {
  if (!items.length) { list.innerHTML = '<div class="empty-pile">Nothing here yet</div>'; return; }
  const total = Math.ceil(items.length / PER_PAGE);
  const pg    = Math.min(Math.max(page, 1), total);
  const slice = items.slice((pg - 1) * PER_PAGE, pg * PER_PAGE);

  // Update pagination UI
  const pgId   = type === 'del' ? 'del' : 'keep';
  const pgEl   = document.getElementById(pgId + '-pagination');
  const pgInfo = document.getElementById(pgId + '-pg-info');
  const pgPrev = document.getElementById(pgId + '-pg-prev');
  const pgNext = document.getElementById(pgId + '-pg-next');
  pgEl.style.display   = items.length > PER_PAGE ? 'flex' : 'none';
  pgInfo.textContent   = 'Page ' + pg + ' of ' + total;
  pgPrev.disabled      = pg <= 1;
  pgNext.disabled      = pg >= total;

  const grid = document.createElement('div');
  grid.className = 'photo-grid';
  slice.forEach(photo => {
    const cell = document.createElement('div');
    cell.className = 'grid-thumb';
    const dlBtn = type === 'keep'
      ? `<button class="thumb-dl" onclick="event.stopPropagation();dlOne('${photo.url}','${photo.file.name.replace(/'/g,"&#39;")}')"><i class="ti ti-download"></i></button>`
      : '';
    cell.innerHTML = `
      <img src="${photo.url}" alt="${photo.file.name}" loading="lazy">
      <div class="grid-thumb-overlay">
        <span class="thumb-name">${photo.file.name}</span>
        ${dlBtn}
      </div>`;
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

// ── Keep / Delete actions ──
function animateSwipe(dir, cb) {
  if (animating) return; animating = true;
  const cls = dir === 'right' ? 'anim-fly-right' : 'anim-fly-left';
  card.classList.add(cls);
  bgCard.classList.add('anim-bounce-in');
  setTimeout(() => {
    card.classList.remove(cls);
    bgCard.classList.remove('anim-bounce-in');
    animating = false; cb();
  }, 370);
}

function doKeep() {
  if (idx >= photos.length || animating) return;
  const photo = photos[idx];
  lKeep.style.opacity = 1;
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
  const photo = photos[idx];
  lDel.style.opacity = 1;
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

// ── Done screen ──
function showDone() {
  acw.style.display = 'none'; doneScreen.style.display = 'flex';
  document.getElementById('done-summary').textContent =
    'Kept ' + kept.length + ' photo' + (kept.length !== 1 ? 's' : '') +
    ', marked ' + deleted.length + ' for deletion.';
  updateProgress();
  if (aiAbortController) aiAbortController.abort();
  aiPanel.style.display = 'none';
}

// ── AI Analysis ──
async function runAiAnalysis(imageUrl) {
  aiPanel.style.display = '';
  aiLoading.style.display = 'flex';
  aiResult.style.display = 'none';
  aiResult.innerHTML = '';

  if (aiAbortController) aiAbortController.abort();
  aiAbortController = new AbortController();
  const signal = aiAbortController.signal;

  try {
    const blob     = await fetch(imageUrl).then(r => r.blob());
    const base64   = await blobToBase64(blob);
    const mimeType = blob.type || 'image/jpeg';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64 }
            },
            {
              type: 'text',
              text: `You are a professional photo editor assistant. Analyse this photo for quality issues a photographer would care about. Respond ONLY with valid JSON, no markdown, no backticks. Format:
{
  "sharpness":    { "score": 0-100, "label": "Tack sharp"|"Slightly soft"|"Blurry"|"Very blurry", "note": "brief note" },
  "exposure":     { "score": 0-100, "label": "Well exposed"|"Slightly over"|"Overexposed"|"Slightly under"|"Underexposed", "note": "brief note" },
  "glare":        { "score": 0-100, "label": "None"|"Slight"|"Moderate"|"Heavy", "note": "brief note" },
  "noise":        { "score": 0-100, "label": "Clean"|"Low noise"|"Noisy"|"Very noisy", "note": "brief note" },
  "composition":  { "score": 0-100, "label": "Strong"|"Good"|"Average"|"Weak", "note": "brief note" },
  "verdict":      "keep"|"delete"|"maybe",
  "summary":      "One sentence recommendation for the photographer."
}`
            }
          ]
        }]
      })
    });

    if (signal.aborted) return;
    const data = await response.json();
    if (signal.aborted) return;

    const text = data.content?.map(c => c.text || '').join('').trim();
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    renderAiResult(parsed);
  } catch (err) {
    if (err.name === 'AbortError') return;
    aiLoading.style.display = 'none';
    aiResult.style.display = '';
    aiResult.innerHTML = '<div class="ai-error"><i class="ti ti-alert-circle"></i> Analysis unavailable — check your network or API key.</div>';
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
    const m   = d[key]; if (!m) return;
    const raw = parseInt(m.score, 10) || 0;
    const pct = invertedKeys.has(key) ? 100 - raw : raw;
    const cls = pct >= 70 ? 'good' : pct >= 40 ? 'warn' : 'bad';
    html += `
      <div class="score-row">
        <div class="score-label-row">
          <span class="score-label">${label}</span>
          <span class="score-value score-${cls}">${m.label}</span>
        </div>
        <div class="score-bar-bg">
          <div class="score-bar-fill bar-${cls}" style="width:${pct}%"></div>
        </div>
      </div>`;
  });
  html += '</div>';

  const vCls = d.verdict === 'keep' ? 'verdict-keep' : d.verdict === 'delete' ? 'verdict-delete' : 'verdict-ok';
  const vIcon = d.verdict === 'keep' ? '✓ Keep' : d.verdict === 'delete' ? '✕ Consider deleting' : '⚡ Your call';
  html += `<div class="ai-verdict ${vCls}"><strong>${vIcon}:</strong> ${d.summary}</div>`;

  aiResult.innerHTML = html;
}

// ── Lightbox ──
function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('open');
}
function closeLightbox() {
  document.getElementById('lightbox').classList.remove('open');
  document.getElementById('lightbox-img').src = '';
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft')  doDelete();
  if (e.key === 'ArrowRight') doKeep();
  if (e.key === 'z' || e.key === 'Z') undoLast();
});

// ── Download helpers ──
function dlOne(url, name) {
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
}

async function downloadAllKept() {
  if (!kept.length) return;
  if (typeof JSZip === 'undefined') {
    alert('JSZip not loaded. Check your internet connection and refresh.');
    return;
  }
  const zip = new JSZip();
  const btn = document.getElementById('dl-all-btn');
  const origText = btn.innerHTML;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 0.8s linear infinite;display:inline-block;"></i> Zipping…';
  btn.disabled = true;
  try {
    for (const p of kept) {
      const blob = await fetch(p.url).then(r => r.blob());
      zip.file(p.file.name, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const a = document.createElement('a');
    a.href     = URL.createObjectURL(zipBlob);
    a.download = 'framedrop-kept-photos.zip';
    a.click();
  } catch(e) {
    alert('Error creating zip: ' + e.message);
  } finally {
    btn.innerHTML = origText;
    btn.disabled  = false;
  }
}

function exportDeleteList() {
  if (!deleted.length) return;
  const c = '# FrameDrop — photos marked for deletion\n# Generated: ' + new Date().toLocaleString() + '\n\n' +
    deleted.map(p => p.file.name).join('\n');
  dlText(c, 'framedrop-delete-list.txt');
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

function dlText(content, filename) {
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = filename; a.click();
}

// ── Reset ──
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

// ── Drag to swipe ──
let dragX = 0, dragging = false, curX = 0;

function resetDrag() {
  card.style.transform = ''; card.style.transition = '';
  lKeep.style.opacity  = 0;  lDel.style.opacity    = 0;
}

card.addEventListener('mousedown', e => {
  if (animating) return;
  dragging = true; dragX = e.clientX; card.style.transition = 'none';
});
document.addEventListener('mousemove', e => {
  if (!dragging) return;
  curX = e.clientX - dragX;
  const r = curX * 0.08;
  card.style.transform = `translateX(${curX}px) rotate(${r}deg)`;
  lKeep.style.opacity  = curX > 40  ? Math.min(1, (curX - 40) / 60)   : 0;
  lDel.style.opacity   = curX < -40 ? Math.min(1, (-curX - 40) / 60)  : 0;
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
  lKeep.style.opacity  = curX > 40  ? Math.min(1, (curX - 40) / 60)  : 0;
  lDel.style.opacity   = curX < -40 ? Math.min(1, (-curX - 40) / 60) : 0;
  const scale = 0.94 + Math.min(0.06, Math.abs(curX) / 800);
  const ty    = 14   - Math.min(14,   Math.abs(curX) / 8);
  bgCard.style.transform = `scale(${scale}) translateY(${ty}px)`;
}, { passive: true });
card.addEventListener('touchend', () => {
  card.style.transition = 'transform 0.3s cubic-bezier(.4,0,.2,1)';
  if      (curX >  110) doKeep();
  else if (curX < -110) doDelete();
  else { resetDrag(); bgCard.style.transform = 'scale(0.94) translateY(14px)'; }
  curX = 0;
});