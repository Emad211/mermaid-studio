const $ = (selector) => document.querySelector(selector);

let toastTimer;
function showToast(message) {
  const toast = $('#copy-toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

$('#copy-demo')?.addEventListener('click', async () => {
  const code = $('#demo-code')?.innerText?.trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    showToast('نمونه کد کپی شد');
  } catch {
    showToast('مرورگر اجازهٔ کپی نداد');
  }
});


fetch('/api/meta', { credentials: 'same-origin' })
  .then((response) => (response.ok ? response.json() : null))
  .then((meta) => {
    if (!meta) return;
    const version = $('#app-version');
    if (version) version.textContent = meta.version || '—';
  })
  .catch(() => {
    // The landing page remains fully usable without metadata.
  });
