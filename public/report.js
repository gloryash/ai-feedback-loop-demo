export function buildResultCopy(payload = {}) {
  const ticketId = payload.ticket?.id || '系统已记录';
  const route = payload.classification?.route;
  const github = payload.github || {};

  const copy = {
    title: '我们已经收到你的反馈',
    lines: [`反馈编号：${ticketId}`],
    issueText: '',
    issueUrl: ''
  };

  if (route === 'bug-autofix' || route === 'ai-change') {
    copy.lines.push(
      '这条需求信息足够清楚，系统会尝试让 AI 自动处理并改代码。',
      '如果修复成功，修复完成后会出现在演示应用里，几分钟后刷新页面就能看到变化。'
    );
  } else if (route === 'human-review') {
    copy.lines.push(
      '这条反馈需要人工确认，暂时不会让 AI 直接改代码。',
      '我们已经把它记录下来，不用重复提交。'
    );
  } else {
    copy.lines.push(
      '系统已经记录了这条反馈，后续会根据内容判断处理方式。',
      '不用重复提交。'
    );
  }

  if (github.created && github.url) {
    copy.issueText = github.number
      ? `已创建处理记录 #${github.number}`
      : '已创建处理记录';
    copy.issueUrl = github.url;
  } else {
    copy.issueText = '这条反馈已保存，但暂时没有创建公开的 GitHub 记录。';
  }

  return copy;
}

function appendText(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

export function renderReportResult(container, payload) {
  const copy = buildResultCopy(payload);
  container.replaceChildren();
  container.className = 'result result-friendly';

  appendText(container, 'strong', 'result-title', copy.title);

  const list = document.createElement('ul');
  list.className = 'result-list';
  for (const line of copy.lines) {
    appendText(list, 'li', '', line);
  }
  container.append(list);

  if (copy.issueUrl) {
    const link = document.createElement('a');
    link.className = 'result-link';
    link.href = copy.issueUrl;
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = copy.issueText;
    container.append(link);
  } else {
    appendText(container, 'p', 'result-note', copy.issueText);
  }
}

export function renderReportError(container) {
  container.replaceChildren();
  container.className = 'result result-friendly result-error';
  appendText(container, 'strong', 'result-title', '提交没有成功');
  appendText(container, 'p', 'result-note', '请稍后再试一次，或者把问题内容保存后发给维护者。');
}

if (typeof document !== 'undefined') {
  const form = document.querySelector('#report-form');
  const result = document.querySelector('#result');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    result.className = 'result result-friendly result-pending';
    result.textContent = '正在提交，请稍等...';

    try {
      const response = await fetch('/api/report', {
        method: 'POST',
        body: new FormData(form)
      });
      const payload = await response.json();
      renderReportResult(result, payload);
    } catch (error) {
      renderReportError(result);
    }
  });
}
