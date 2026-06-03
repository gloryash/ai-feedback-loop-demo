import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('admin page exposes the review panel controls and warning', async () => {
  const html = await readFile(new URL('../public/admin.html', import.meta.url), 'utf8');

  assert.match(html, /管理员审核|iShoe 需求审核/);
  assert.match(html, /id="ticket-list"/);
  assert.match(html, /id="admin-comment"/);
  assert.match(html, /id="approve-button"/);
  assert.match(html, /id="reject-button"/);
  assert.match(html, /暂未启用登录/);
});

test('admin script calls the backend review APIs', async () => {
  const js = await readFile(new URL('../public/admin.js', import.meta.url), 'utf8');

  assert.match(js, /\/api\/admin\/tickets/);
  assert.match(js, /\/comment/);
  assert.match(js, /\/approve/);
  assert.match(js, /\/reject/);
});

test('admin script persists the current comment before approval', async () => {
  const js = await readFile(new URL('../public/admin.js', import.meta.url), 'utf8');
  const approveStart = js.indexOf('async function approveTicket()');
  const approveEnd = js.indexOf('async function rejectTicket()');
  const approveFunction = js.slice(approveStart, approveEnd);

  assert.match(approveFunction, /persistCurrentComment/);
  assert.equal(
    approveFunction.indexOf('persistCurrentComment') < approveFunction.indexOf('/approve'),
    true
  );
});

test('admin script sanitizes external GitHub issue links', async () => {
  const js = await readFile(new URL('../public/admin.js', import.meta.url), 'utf8');

  assert.match(js, /function safeExternalUrl/);
  assert.match(js, /new URL/);
  assert.match(js, /https:/);
  assert.match(js, /http:/);
  assert.match(js, /safeExternalUrl\(ticket\.github\?\.url\)/);
});

test('admin script explains where PR merge and deploy status are tracked', async () => {
  const js = await readFile(new URL('../public/admin.js', import.meta.url), 'utf8');

  assert.match(js, /automationStatusNote/);
  assert.match(js, /自动合并/);
  assert.match(js, /Render 部署/);
  assert.match(js, /GitHub Issue/);
});

test('public navigation links to the admin page', async () => {
  const indexHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const reportHtml = await readFile(new URL('../public/report.html', import.meta.url), 'utf8');

  assert.match(indexHtml, /href="\/admin\.html"/);
  assert.match(reportHtml, /href="\/admin\.html"/);
});
