const state = {
  tickets: [],
  selectedTicket: null,
  currentStatus: ''
};

const terminalStatuses = new Set(['sent-to-ai', 'rejected', 'failed']);
const statusLabels = {
  'pending-review': '待审核',
  'sent-to-ai': '已发送 AI',
  rejected: '已驳回',
  failed: '失败'
};

const ticketList = document.querySelector('#ticket-list');
const ticketDetail = document.querySelector('#ticket-detail');
const adminComment = document.querySelector('#admin-comment');
const approveButton = document.querySelector('#approve-button');
const rejectButton = document.querySelector('#reject-button');
const saveCommentButton = document.querySelector('#save-comment-button');
const adminResult = document.querySelector('#admin-result');
const statusFilters = document.querySelector('#status-filters');

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value ?? ''));
    if (!['https:', 'http:'].includes(url.protocol)) {
      return '';
    }
    return url.href;
  } catch {
    return '';
  }
}

function formatDate(value) {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}

function reviewStatus(ticket) {
  return ticket?.review?.status || 'pending-review';
}

function statusText(status) {
  return statusLabels[status] || status || '未知';
}

function automationStatusNote(safeGithubUrl) {
  if (!safeGithubUrl) {
    return '';
  }

  return `
    <div class="detail-block automation-status-note">
      <h3>AI 后续状态</h3>
      <p>本地 AI 创建 PR 后会等待 GitHub checks，通过后自动合并；合并到 main 后会触发 Render 部署。PR、自动合并和 Render 部署状态会持续写回 GitHub Issue。</p>
    </div>
  `;
}

function setResult(text, kind = 'pending') {
  adminResult.textContent = text;
  adminResult.classList.remove('result-error', 'result-pending');
  if (kind === 'error') {
    adminResult.classList.add('result-error');
  } else {
    adminResult.classList.add('result-pending');
  }
}

async function readJsonResponse(response) {
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const message = payload.error || payload.message || `请求失败：HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  return readJsonResponse(response);
}

function updateButtons() {
  const hasTicket = Boolean(state.selectedTicket);
  const isTerminal = terminalStatuses.has(reviewStatus(state.selectedTicket));

  adminComment.disabled = !hasTicket;
  saveCommentButton.disabled = !hasTicket;
  approveButton.disabled = !hasTicket || isTerminal;
  rejectButton.disabled = !hasTicket || isTerminal;
}

function renderFilters() {
  statusFilters.querySelectorAll('button[data-status]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.status === state.currentStatus);
  });
}

function renderTickets() {
  renderFilters();

  if (!state.tickets.length) {
    ticketList.innerHTML = '<p class="empty-state">当前筛选下没有需求。</p>';
    return;
  }

  ticketList.innerHTML = state.tickets.map((ticket) => {
    const status = reviewStatus(ticket);
    const selected = state.selectedTicket?.id === ticket.id ? ' is-selected' : '';
    return `
      <button class="ticket-card${selected}" type="button" data-ticket-id="${escapeHtml(ticket.id)}">
        <span class="ticket-card-top">
          <span class="ticket-id">${escapeHtml(ticket.id)}</span>
          <span class="status-pill status-${escapeHtml(status)}">${escapeHtml(statusText(status))}</span>
        </span>
        <span class="ticket-card-title">${escapeHtml(ticket.title || '未命名需求')}</span>
        <span class="ticket-card-meta">${escapeHtml(ticket.type || 'unknown')} · ${escapeHtml(formatDate(ticket.updatedAt || ticket.createdAt))}</span>
      </button>
    `;
  }).join('');
}

function renderDetail() {
  const ticket = state.selectedTicket;
  if (!ticket) {
    ticketDetail.innerHTML = '<p class="empty-state">请选择一条需求。</p>';
    adminComment.value = '';
    updateButtons();
    return;
  }

  const status = reviewStatus(ticket);
  const labels = Array.isArray(ticket.classification?.labels)
    ? ticket.classification.labels.join(', ')
    : '-';
  const safeGithubUrl = safeExternalUrl(ticket.github?.url);
  const githubUrl = safeGithubUrl
    ? `<a href="${escapeHtml(safeGithubUrl)}" target="_blank" rel="noreferrer">打开 GitHub Issue</a>`
    : '-';

  ticketDetail.innerHTML = `
    <div class="detail-heading">
      <div>
        <p class="eyebrow">${escapeHtml(ticket.id)}</p>
        <h2>${escapeHtml(ticket.title || '未命名需求')}</h2>
      </div>
      <span class="status-pill status-${escapeHtml(status)}">${escapeHtml(statusText(status))}</span>
    </div>
    <dl class="detail-grid">
      <div><dt>类型</dt><dd>${escapeHtml(ticket.type || '-')}</dd></div>
      <div><dt>创建时间</dt><dd>${escapeHtml(formatDate(ticket.createdAt))}</dd></div>
      <div><dt>更新时间</dt><dd>${escapeHtml(formatDate(ticket.updatedAt))}</dd></div>
      <div><dt>路由</dt><dd>${escapeHtml(ticket.classification?.route || '-')}</dd></div>
      <div><dt>标签</dt><dd>${escapeHtml(labels)}</dd></div>
      <div><dt>GitHub</dt><dd>${githubUrl}</dd></div>
    </dl>
    ${automationStatusNote(safeGithubUrl)}
    <div class="detail-block">
      <h3>用户需求</h3>
      <pre>${escapeHtml(ticket.details || '-')}</pre>
    </div>
    <div class="detail-block">
      <h3>分类说明</h3>
      <p>${escapeHtml(ticket.classification?.reason || ticket.review?.reason || '-')}</p>
    </div>
    <div class="detail-block">
      <h3>失败或驳回原因</h3>
      <p>${escapeHtml(ticket.review?.failureReason || '-')}</p>
    </div>
  `;

  adminComment.value = ticket.review?.adminComment || '';
  updateButtons();
}

async function loadTickets(status = state.currentStatus) {
  state.currentStatus = status;
  ticketList.textContent = '正在加载...';
  try {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const payload = await requestJson(`/api/admin/tickets${query}`);
    state.tickets = Array.isArray(payload.tickets) ? payload.tickets : [];
    if (state.selectedTicket && !state.tickets.some((ticket) => ticket.id === state.selectedTicket.id)) {
      state.selectedTicket = null;
      renderDetail();
    }
    renderTickets();
    setResult(`已加载 ${state.tickets.length} 条需求。`);
  } catch (error) {
    state.tickets = [];
    renderTickets();
    setResult(`加载需求失败：${error.message}`, 'error');
  }
}

async function selectTicket(id) {
  try {
    setResult('正在加载需求详情...');
    const payload = await requestJson(`/api/admin/tickets/${encodeURIComponent(id)}`);
    state.selectedTicket = payload.ticket;
    renderTickets();
    renderDetail();
    setResult('需求详情已加载。');
  } catch (error) {
    setResult(`加载详情失败：${error.message}`, 'error');
  }
}

async function refreshSelectedTicket() {
  const selectedId = state.selectedTicket?.id;
  await loadTickets(state.currentStatus);
  if (selectedId) {
    await selectTicket(selectedId);
  }
}

async function persistCurrentComment() {
  const payload = await requestJson(`/api/admin/tickets/${encodeURIComponent(state.selectedTicket.id)}/comment`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ comment: adminComment.value })
  });
  state.selectedTicket = payload.ticket;
  return payload.ticket;
}

async function saveComment() {
  if (!state.selectedTicket) {
    setResult('请先选择一条需求。', 'error');
    return;
  }

  try {
    await persistCurrentComment();
    await refreshSelectedTicket();
    setResult('管理员评论已保存。');
  } catch (error) {
    setResult(`保存评论失败：${error.message}`, 'error');
  }
}

async function approveTicket() {
  if (!state.selectedTicket) {
    setResult('请先选择一条需求。', 'error');
    return;
  }

  try {
    setResult('正在通过需求并发送给 AI...');
    await persistCurrentComment();
    await requestJson(`/api/admin/tickets/${encodeURIComponent(state.selectedTicket.id)}/approve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' }
    });
    await refreshSelectedTicket();
    setResult('需求已通过，并已发送给 AI。');
  } catch (error) {
    setResult(`通过失败：${error.message}`, 'error');
  }
}

async function rejectTicket() {
  if (!state.selectedTicket) {
    setResult('请先选择一条需求。', 'error');
    return;
  }

  const reason = adminComment.value.trim() || '管理员驳回。';
  try {
    setResult('正在驳回需求...');
    await persistCurrentComment();
    await requestJson(`/api/admin/tickets/${encodeURIComponent(state.selectedTicket.id)}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    await refreshSelectedTicket();
    setResult('需求已驳回，不会发送给 AI。');
  } catch (error) {
    setResult(`驳回失败：${error.message}`, 'error');
  }
}

statusFilters.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-status]');
  if (!button) {
    return;
  }
  loadTickets(button.dataset.status);
});

ticketList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-ticket-id]');
  if (!button) {
    return;
  }
  selectTicket(button.dataset.ticketId);
});

saveCommentButton.addEventListener('click', saveComment);
approveButton.addEventListener('click', approveTicket);
rejectButton.addEventListener('click', rejectTicket);

updateButtons();
loadTickets();
