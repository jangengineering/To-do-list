'use strict';

/* ---------- state ---------- */

const STORE_KEY = 'todo.data.v1';
const SYNC_KEY = 'todo.sync.v1';
const GIST_FILE = 'todo-data.json';

let data = load(STORE_KEY) || { items: [], updatedAt: 0 };
let sync = load(SYNC_KEY) || { token: '', gistId: '' };

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function persist() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch {}
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const findItem = id => data.items.find(i => i.id === id);

// Every mutation goes through here: save locally, redraw, push to cloud.
function commit(mutate) {
  mutate();
  data.updatedAt = Date.now();
  persist();
  scheduleRender();
  schedulePush();
}

/* ---------- durations ---------- */

// Accepts "90", "45m", "1.5h", "1h30m", "1h 30", "1:30". Plain numbers are minutes.
function parseDuration(text) {
  const s = String(text || '').trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return 0;
  let m = s.match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(?:(\d+(?:\.\d+)?)(?:h|시간))?(?:(\d+(?:\.\d+)?)(?:m|분)?)?$/);
  if (m && (m[1] || m[2])) return Math.round((+m[1] || 0) * 60 + (+m[2] || 0));
  return null;
}

function formatDuration(min) {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const itemTotal = item => item.subs.reduce((sum, s) => sum + (s.minutes || 0), 0);

/* ---------- rendering ---------- */

const $ = sel => document.querySelector(sel);
const listEl = $('#items');
let sortables = [];
let renderQueued = false;

function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k in el) el[k] = v;
    else el.setAttribute(k, v);
  }
  el.append(...children.filter(c => c != null));
  return el;
}

// Render on the next frame so focus has already moved (keeps Tab working).
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

function render() {
  const focused = document.activeElement?.dataset?.focus;
  const caret = document.activeElement?.selectionStart;

  sortables.forEach(s => s.destroy());
  sortables = [];
  listEl.replaceChildren(...data.items.map(renderItem));
  $('#empty').hidden = data.items.length > 0;

  if (typeof Sortable !== 'undefined') {
    sortables.push(Sortable.create(listEl, {
      handle: '.ihandle', animation: 150, delay: 150, delayOnTouchOnly: true,
      onEnd: e => e.oldIndex !== e.newIndex && commit(() => {
        const [moved] = data.items.splice(e.oldIndex, 1);
        data.items.splice(e.newIndex, 0, moved);
      }),
    }));
    listEl.querySelectorAll('.subs').forEach(ul => sortables.push(Sortable.create(ul, {
      group: 'subs', handle: '.shandle', animation: 150, delay: 150, delayOnTouchOnly: true,
      onEnd: e => {
        if (e.from === e.to && e.oldIndex === e.newIndex) return;
        commit(() => {
          const from = findItem(e.from.dataset.item), to = findItem(e.to.dataset.item);
          const [moved] = from.subs.splice(e.oldIndex, 1);
          to.subs.splice(e.newIndex, 0, moved);
        });
      },
    })));
  }

  if (focused) {
    const el = listEl.querySelector(`[data-focus="${focused}"]`);
    if (el) {
      el.focus();
      if (caret != null && el.setSelectionRange) try { el.setSelectionRange(caret, caret); } catch {}
    }
  }
}

function titleInput(value, focusKey, onSave, extra = {}) {
  return h('input', {
    class: 'title', value, dataset: { focus: focusKey }, enterkeyhint: 'done', ...extra,
    onchange: e => onSave(e.target.value.trim()),
    onkeydown: e => { if (e.key === 'Enter') e.target.blur(); },
  });
}

function renderItem(item) {
  const total = itemTotal(item);
  return h('li', { class: `item${item.open ? ' open' : ''}${item.done ? ' done' : ''}` },
    h('div', { class: 'item-row' },
      h('span', { class: 'handle ihandle', title: '끌어서 순서 변경' }, '⋮⋮'),
      h('input', {
        type: 'checkbox', class: 'check', checked: !!item.done, 'aria-label': '완료',
        onchange: e => commit(() => { item.done = e.target.checked; }),
      }),
      titleInput(item.title, `i-${item.id}`, v => commit(() => {
        if (v) item.title = v; // empty title keeps the old one
      })),
      h('span', { class: 'total', title: '하위 항목 합계' }, formatDuration(total)),
      h('button', {
        class: 'toggle', 'aria-label': '하위 목록 열기/닫기',
        onclick: () => commit(() => { item.open = !item.open; }),
      }, '›'),
      h('button', {
        class: 'del', 'aria-label': '삭제',
        onclick: () => {
          if (item.subs.length && !confirm(`"${item.title}"와 하위 항목 ${item.subs.length}개를 삭제할까요?`)) return;
          commit(() => { data.items = data.items.filter(i => i !== item); });
        },
      }, '✕'),
    ),
    h('div', { class: 'subs-wrap' },
      h('ul', { class: 'subs', dataset: { item: item.id } }, ...item.subs.map((s, i) => renderSub(item, s, i))),
      renderAddSub(item),
    ),
  );
}

function renderSub(item, sub, index) {
  return h('li', { class: `sub${sub.done ? ' done' : ''}` },
    h('div', { class: 'sub-row' },
      h('span', { class: 'handle shandle', title: '끌어서 순서 변경' }, '⋮⋮'),
      h('span', { class: 'num' }, index + 1),
      h('input', {
        type: 'checkbox', class: 'check', checked: !!sub.done, 'aria-label': '완료',
        onchange: e => commit(() => { sub.done = e.target.checked; }),
      }),
      titleInput(sub.title, `s-${sub.id}`, v => commit(() => { if (v) sub.title = v; })),
      durationInput(formatDuration(sub.minutes), `d-${sub.id}`, min => commit(() => { sub.minutes = min; })),
      h('button', {
        class: 'del', 'aria-label': '삭제',
        onclick: () => commit(() => { item.subs = item.subs.filter(s => s !== sub); }),
      }, '✕'),
    ),
  );
}

function durationInput(value, focusKey, onSave) {
  return h('input', {
    class: 'dur', value, placeholder: '시간', inputMode: 'text', dataset: { focus: focusKey },
    title: '예: 30, 45m, 1.5h, 1h30m, 1:30',
    onchange: e => {
      const min = parseDuration(e.target.value);
      if (min === null) { e.target.value = value; return; }
      onSave(min);
    },
    onkeydown: e => { if (e.key === 'Enter') e.target.blur(); },
  });
}

function renderAddSub(item) {
  const title = h('input', { placeholder: '+ 단계 추가', dataset: { focus: `a-${item.id}` }, enterkeyhint: 'next' });
  const dur = h('input', { class: 'dur', placeholder: '시간', dataset: { focus: `ad-${item.id}` }, enterkeyhint: 'done', title: '예: 30, 45m, 1.5h, 1h30m' });
  const add = () => {
    const t = title.value.trim();
    if (!t) return;
    const min = parseDuration(dur.value);
    commit(() => item.subs.push({ id: uid(), title: t, minutes: min || 0, done: false }));
    title.value = dur.value = '';
    title.focus();
  };
  title.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dur.value ? add() : dur.focus(); } });
  dur.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  return h('form', { class: 'add-sub', onsubmit: e => { e.preventDefault(); add(); } }, title, dur);
}

$('#new-item').addEventListener('submit', e => {
  e.preventDefault();
  const input = $('#new-item-title');
  const title = input.value.trim();
  if (!title) return;
  const id = uid();
  commit(() => data.items.unshift({ id, title, done: false, open: true, subs: [] }));
  input.value = '';
  // Jump straight into adding steps for the new item.
  requestAnimationFrame(() => requestAnimationFrame(() => listEl.querySelector(`[data-focus="a-${id}"]`)?.focus()));
});

/* ---------- cloud sync (GitHub Gist) ---------- */

const statusEl = $('#sync-status');
let pushTimer = null;
let syncing = false;

function setStatus(text, detail = '') {
  statusEl.textContent = text;
  statusEl.title = detail || '동기화 상태';
  statusEl.classList.toggle('error', !!detail);
}

statusEl.addEventListener('click', () => { if (statusEl.classList.contains('error')) alert(statusEl.title); });

// Turn a failed request into something the user can act on.
function showSyncError(err) {
  console.warn(err);
  const status = err.status;
  if (!navigator.onLine) setStatus('오프라인', '인터넷 연결이 없습니다.');
  else if (status === 401) setStatus('토큰 오류', '토큰이 틀렸거나 만료/삭제되었습니다. ⚙에서 토큰을 다시 넣어주세요.');
  else if (status === 404) setStatus('Gist 없음', 'Gist ID가 틀렸거나, 토큰에 gist 권한이 없습니다. ⚙에서 Gist ID 칸을 비우고 저장해 보세요.');
  else if (status === 403 || status === 429) setStatus('요청 거부', `GitHub가 요청을 거부했습니다 (${status}). 토큰의 gist 권한을 확인하거나 잠시 후 다시 시도하세요.`);
  else if (status) setStatus(`오류 ${status}`, `GitHub 응답 오류 ${status}`);
  else setStatus('GitHub 접속 불가', '이 네트워크에서 api.github.com 에 접속할 수 없습니다. 회사 방화벽/보안 프로그램이 막고 있을 수 있습니다.');
}

async function gh(path, opts = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${sync.token}`,
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  if (!res.ok) throw Object.assign(new Error(`GitHub ${res.status}`), { status: res.status });
  return res.json();
}

async function ensureGist() {
  if (sync.gistId) return;
  for (let page = 1; page <= 10; page++) {
    const gists = await gh(`/gists?per_page=100&page=${page}`);
    const found = gists.find(g => g.files && g.files[GIST_FILE]);
    if (found) { sync.gistId = found.id; break; }
    if (gists.length < 100) break;
  }
  if (!sync.gistId) {
    const created = await gh('/gists', {
      method: 'POST',
      body: JSON.stringify({ description: 'To-do list data', public: false, files: { [GIST_FILE]: { content: JSON.stringify(data) } } }),
    });
    sync.gistId = created.id;
  }
  localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
}

async function pull() {
  if (!sync.token || syncing) return;
  syncing = true;
  let needPush = false;
  try {
    setStatus('동기화 중…');
    await ensureGist();
    const gist = await gh(`/gists/${sync.gistId}`);
    const file = gist.files[GIST_FILE];
    let remote = null;
    if (file) {
      const text = file.truncated ? await (await fetch(file.raw_url, { cache: 'no-store' })).text() : file.content;
      try { remote = JSON.parse(text); } catch {}
    }
    if (remote && remote.updatedAt > data.updatedAt) {
      data = remote;
      persist();
      if (!isEditing()) render(); else scheduleRenderWhenIdle();
    } else if (!remote || remote.updatedAt < data.updatedAt) {
      needPush = true;
    }
    setStatus('✓');
  } catch (err) {
    showSyncError(err);
  } finally {
    syncing = false;
  }
  if (needPush) push();
}

async function push(keepalive = false) {
  clearTimeout(pushTimer);
  pushTimer = null;
  if (!sync.token) return;
  if (syncing) { schedulePush(); return; }
  syncing = true;
  try {
    setStatus('저장 중…');
    await ensureGist();
    await gh(`/gists/${sync.gistId}`, {
      method: 'PATCH',
      keepalive,
      body: JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(data) } } }),
    });
    setStatus('✓');
  } catch (err) {
    showSyncError(err);
    schedulePush(15000);
  } finally {
    syncing = false;
  }
}

function schedulePush(delay = 1200) {
  if (!sync.token) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(push, delay);
}

const isEditing = () => listEl.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
function scheduleRenderWhenIdle() {
  listEl.addEventListener('focusout', () => setTimeout(() => { if (!isEditing()) render(); }), { once: true });
}

// Pick up changes made on the other device.
document.addEventListener('visibilitychange', () => { if (!document.hidden) pull(); });
window.addEventListener('online', pull);
setInterval(() => { if (!document.hidden && !pushTimer) pull(); }, 60000);
// Flush a pending push before leaving.
window.addEventListener('pagehide', () => { if (pushTimer) push(true); });

/* ---------- settings ---------- */

const dlg = $('#settings');
$('#settings-btn').addEventListener('click', () => {
  $('#token').value = sync.token;
  $('#gist-id').value = sync.gistId;
  dlg.showModal();
});
dlg.addEventListener('close', () => {
  if (dlg.returnValue !== 'save') return;
  const token = $('#token').value.replace(/[^\x21-\x7e]/g, '');
  const gistId = $('#gist-id').value.trim();
  const changed = token !== sync.token || gistId !== sync.gistId;
  sync = { token, gistId };
  localStorage.setItem(SYNC_KEY, JSON.stringify(sync));
  if (!token) setStatus('');
  if (changed && token) {
    // A newly linked device should take the cloud copy, not overwrite it.
    if (!data.items.length) data.updatedAt = 0;
    pull();
  }
});

$('#export-btn').addEventListener('click', () => {
  const a = h('a', {
    href: URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })),
    download: `todo-${new Date().toISOString().slice(0, 10)}.json`,
  });
  a.click();
  URL.revokeObjectURL(a.href);
});
$('#import-btn').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const imported = JSON.parse(await file.text());
    if (!Array.isArray(imported.items)) throw new Error('bad file');
    if (confirm('현재 목록을 가져온 파일로 바꿀까요?')) commit(() => { data.items = imported.items; });
  } catch { alert('올바른 파일이 아닙니다.'); }
  e.target.value = '';
});

/* ---------- boot ---------- */

render();
pull();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
