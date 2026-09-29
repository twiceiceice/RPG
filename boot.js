// The HTML ships the complete game so startup needs no module subrequests.
// This wrapper also makes synchronous startup failures visible in every browser.
(function () {
  try {
    /* WIND_FIELD_RUNTIME */
  } catch (error) {
    console.error('Windfield startup failed:', error);
    const panel = document.getElementById('loading');
    panel.hidden = false;
    panel.setAttribute('role', 'alert');
    const title = document.createElement('strong');
    title.textContent = '게임을 시작하지 못했어요.';
    const message = document.createElement('p');
    message.textContent = '아래 버튼으로 다시 열어 주세요. 같은 문제가 계속되면 오류 내용을 알려 주세요.';
    const retry = document.createElement('button');
    retry.textContent = '다시 불러오기';
    retry.className = 'primary';
    retry.addEventListener('click', () => window.location.reload());
    const detail = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = '오류 내용';
    const reason = document.createElement('pre');
    reason.textContent = String(error?.message ?? error).slice(0, 600);
    detail.append(summary, reason);
    panel.replaceChildren(title, message, retry, detail);
  }
})();
