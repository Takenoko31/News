/**
 * Bucket List Voting App - 管理画面JS
 *
 * 管理者トークンは sessionStorage に保存。
 * タブ閉じで消える（セキュリティ配慮）。
 */

/* ================================================================
   状態
   ================================================================ */
let adminToken = sessionStorage.getItem('admin_token') || '';
let reportsOffset = 0;
let actionsOffset = 0;
const PAGE_SIZE = 30;

/* ================================================================
   ユーティリティ
   ================================================================ */

function $(id) { return document.getElementById(id); }

async function adminApi(path, options = {}) {
  const url = CONFIG.API_BASE + path;
  const headers = {
    'Content-Type': 'application/json',
    ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
    ...(options.headers || {}),
  };
  const res = await fetch(url, { credentials: 'include', ...options, headers });
  const data = await res.json();
  if (!res.ok) {
    throw { status: res.status, ...(data.error || { code: 'UNKNOWN', message: 'エラー' }) };
  }
  return data;
}

function showToast(msg, type = 'info') {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function timeAgo(ms) {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return s + '秒前';
  const m = Math.floor(s / 60);
  if (m < 60) return m + '分前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + '時間前';
  return Math.floor(h / 24) + '日前';
}

const REASON_LABELS = {
  spam: 'スパム',
  hate: '差別・ヘイト',
  sexual: '性的な内容',
  personal_info: '個人情報',
  violence: '暴力',
  other: 'その他',
};

/* ================================================================
   認証
   ================================================================ */

function showLoginView() {
  $('login-section').classList.remove('hidden');
  $('admin-panel').classList.add('hidden');
  $('logout-btn').classList.add('hidden');
}

function showAdminView() {
  $('login-section').classList.add('hidden');
  $('admin-panel').classList.remove('hidden');
  $('logout-btn').classList.remove('hidden');
  loadReports();
}

async function doLogin() {
  const pw = $('login-password').value;
  if (!pw) return;

  try {
    const data = await adminApi('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: pw }),
    });
    adminToken = data.token;
    sessionStorage.setItem('admin_token', adminToken);
    $('login-error').classList.add('hidden');
    showAdminView();
  } catch (e) {
    $('login-error').textContent = e.message || 'ログイン失敗';
    $('login-error').classList.remove('hidden');
  }
}

async function doLogout() {
  try { await adminApi('/api/admin/logout', { method: 'POST' }); } catch {}
  adminToken = '';
  sessionStorage.removeItem('admin_token');
  showLoginView();
}

/* ================================================================
   通報一覧
   ================================================================ */

async function loadReports(append = false) {
  $('reports-loading').classList.remove('hidden');
  $('reports-more').classList.add('hidden');
  if (!append) $('reports-empty').classList.add('hidden');

  try {
    const data = await adminApi(`/api/admin/reports?limit=${PAGE_SIZE}&offset=${reportsOffset}`);
    const list = $('reports-list');
    if (!append) list.innerHTML = '';

    if (data.reports.length === 0 && reportsOffset === 0) {
      $('reports-empty').classList.remove('hidden');
      return;
    }

    data.reports.forEach((r) => list.appendChild(createReportCard(r)));

    if (data.reports.length >= PAGE_SIZE) {
      $('reports-more').classList.remove('hidden');
    }
  } catch (e) {
    if (e.status === 401) { showLoginView(); return; }
    showToast(e.message || '読み込み失敗', 'error');
  } finally {
    $('reports-loading').classList.add('hidden');
  }
}

function createReportCard(r) {
  const card = document.createElement('div');
  const statusColor = r.is_resolved ? 'border-gray-200 bg-gray-50' : 'border-orange-200 bg-white';
  card.className = `rounded-lg border ${statusColor} p-4 space-y-2`;

  const resolvedBadge = r.is_resolved ? '<span class="bg-gray-200 text-gray-500 text-xs px-2 py-0.5 rounded">解決済</span>' : '';
  const deletedBadge = r.item_deleted ? '<span class="bg-red-100 text-red-600 text-xs px-2 py-0.5 rounded">削除済</span>' : '';
  const hiddenBadge = r.item_hidden ? '<span class="bg-yellow-100 text-yellow-700 text-xs px-2 py-0.5 rounded">非表示</span>' : '';

  card.innerHTML = `
    <div class="flex items-start justify-between gap-2">
      <div class="flex-1 min-w-0">
        <div class="flex flex-wrap items-center gap-2 mb-1">
          <span class="bg-orange-100 text-orange-700 text-xs font-medium px-2 py-0.5 rounded">${REASON_LABELS[r.reason] || r.reason}</span>
          ${resolvedBadge}${deletedBadge}${hiddenBadge}
          <span class="text-xs text-gray-400">${timeAgo(r.created_at)}</span>
        </div>
        <p class="text-sm text-gray-800 break-words report-item-text"></p>
        ${r.comment ? '<p class="text-xs text-gray-500 mt-1 report-comment"></p>' : ''}
        <p class="text-xs text-gray-300 mt-1 font-mono">FP: ${r.fingerprint_hash.substring(0, 16)}…</p>
      </div>
      <div class="flex flex-col gap-1 shrink-0">
        ${!r.item_deleted ? `<button class="delete-item-btn bg-red-500 hover:bg-red-600 text-white text-xs px-3 py-1 rounded" data-item="${r.item_id}">削除</button>` : ''}
        ${r.item_hidden && !r.item_deleted ? `<button class="unhide-item-btn bg-yellow-500 hover:bg-yellow-600 text-white text-xs px-3 py-1 rounded" data-item="${r.item_id}">表示復帰</button>` : ''}
        <button class="ban-btn bg-gray-700 hover:bg-gray-800 text-white text-xs px-3 py-1 rounded" data-fp="${r.fingerprint_hash}">BAN</button>
      </div>
    </div>
  `;

  // XSS対策: textContent使用
  const textEl = card.querySelector('.report-item-text');
  if (textEl) textEl.textContent = r.item_text || '(不明)';
  const commentEl = card.querySelector('.report-comment');
  if (commentEl) commentEl.textContent = 'コメント: ' + r.comment;

  return card;
}

/* ================================================================
   監査ログ
   ================================================================ */

async function loadActions(append = false) {
  $('actions-more').classList.add('hidden');
  if (!append) $('actions-empty').classList.add('hidden');

  try {
    const data = await adminApi(`/api/admin/actions?limit=${PAGE_SIZE}&offset=${actionsOffset}`);
    const list = $('actions-list');
    if (!append) list.innerHTML = '';

    if (data.actions.length === 0 && actionsOffset === 0) {
      $('actions-empty').classList.remove('hidden');
      return;
    }

    data.actions.forEach((a) => {
      const row = document.createElement('div');
      row.className = 'bg-white rounded-lg border p-3 flex items-center gap-3 text-sm';
      row.innerHTML = `
        <span class="bg-gray-100 text-gray-600 text-xs font-mono px-2 py-0.5 rounded">${a.action}</span>
        <span class="text-gray-500">${a.target_type}:${a.target_id.substring(0, 8)}…</span>
        <span class="text-gray-400 text-xs flex-1 action-detail"></span>
        <span class="text-gray-300 text-xs">${timeAgo(a.created_at)}</span>
      `;
      const detailEl = row.querySelector('.action-detail');
      if (detailEl) detailEl.textContent = a.detail || '';
      list.appendChild(row);
    });

    if (data.actions.length >= PAGE_SIZE) {
      $('actions-more').classList.remove('hidden');
    }
  } catch (e) {
    if (e.status === 401) { showLoginView(); return; }
    showToast(e.message || '読み込み失敗', 'error');
  }
}

/* ================================================================
   管理アクション
   ================================================================ */

async function deleteItem(itemId) {
  const reason = prompt('削除理由を入力してください:');
  if (!reason) return;

  try {
    await adminApi(`/api/admin/items/${itemId}/delete`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    showToast('投稿を削除しました', 'success');
    reportsOffset = 0;
    loadReports();
  } catch (e) {
    showToast(e.message || '削除失敗', 'error');
  }
}

async function unhideItem(itemId) {
  try {
    await adminApi(`/api/admin/items/${itemId}/unhide`, { method: 'POST' });
    showToast('投稿を表示に復帰しました', 'success');
    reportsOffset = 0;
    loadReports();
  } catch (e) {
    showToast(e.message || '復帰失敗', 'error');
  }
}

function openBanModal(fingerprint) {
  $('ban-fingerprint').value = fingerprint;
  $('ban-days').value = 7;
  $('ban-note').value = '';
  $('ban-modal').classList.remove('hidden');
}

function closeBanModal() {
  $('ban-modal').classList.add('hidden');
}

async function submitBan() {
  const fingerprint = $('ban-fingerprint').value;
  const days = parseInt($('ban-days').value, 10);
  const note = $('ban-note').value.trim();

  if (!days || days < 1) {
    showToast('BAN日数を入力してください', 'error');
    return;
  }

  try {
    await adminApi('/api/admin/bans', {
      method: 'POST',
      body: JSON.stringify({ fingerprint, days, note: note || undefined }),
    });
    showToast(`${days}日間BANしました`, 'success');
    closeBanModal();
  } catch (e) {
    showToast(e.message || 'BAN失敗', 'error');
  }
}

/* ================================================================
   タブ切り替え
   ================================================================ */

function switchAdminTab(panelId) {
  document.querySelectorAll('.admin-tab').forEach((btn) => {
    if (btn.dataset.panel === panelId) {
      btn.className = 'admin-tab px-4 py-2 text-sm font-medium rounded-lg bg-gray-800 text-white';
    } else {
      btn.className = 'admin-tab px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 text-gray-700';
    }
  });

  $('reports-panel').classList.toggle('hidden', panelId !== 'reports-panel');
  $('actions-panel').classList.toggle('hidden', panelId !== 'actions-panel');

  if (panelId === 'actions-panel') {
    actionsOffset = 0;
    loadActions();
  }
}

/* ================================================================
   イベントバインド
   ================================================================ */

document.addEventListener('DOMContentLoaded', () => {
  // ログイン
  $('login-form').addEventListener('submit', (e) => { e.preventDefault(); doLogin(); });
  $('logout-btn').addEventListener('click', doLogout);

  // タブ
  document.querySelectorAll('.admin-tab').forEach((btn) => {
    btn.addEventListener('click', () => switchAdminTab(btn.dataset.panel));
  });

  // 通報もっと読み込む
  $('reports-more').addEventListener('click', () => { reportsOffset += PAGE_SIZE; loadReports(true); });
  $('actions-more').addEventListener('click', () => { actionsOffset += PAGE_SIZE; loadActions(true); });

  // 通報リスト内のクリック（イベント委譲）
  $('reports-list').addEventListener('click', (e) => {
    const delBtn = e.target.closest('.delete-item-btn');
    if (delBtn) { deleteItem(delBtn.dataset.item); return; }

    const unhideBtn = e.target.closest('.unhide-item-btn');
    if (unhideBtn) { unhideItem(unhideBtn.dataset.item); return; }

    const banBtn = e.target.closest('.ban-btn');
    if (banBtn) { openBanModal(banBtn.dataset.fp); }
  });

  // BANモーダル
  $('ban-cancel').addEventListener('click', closeBanModal);
  $('ban-modal').addEventListener('click', (e) => { if (e.target === $('ban-modal')) closeBanModal(); });
  $('ban-form').addEventListener('submit', (e) => { e.preventDefault(); submitBan(); });

  // 初期表示判定
  if (adminToken) {
    showAdminView();
  } else {
    showLoginView();
  }
});
