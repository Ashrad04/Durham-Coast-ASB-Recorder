(() => {
  let deferredPrompt = null;
  const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

  const style = document.createElement('style');
  style.textContent = `
    .install-app-btn{border:1px solid rgba(255,255,255,.42);background:rgba(255,255,255,.08);color:#fff;border-radius:999px;padding:8px 12px;font-weight:800;font-size:12px}
    .install-app-btn:hover{background:rgba(255,255,255,.14)}
    .pwa-toast{position:fixed;left:50%;bottom:86px;transform:translateX(-50%);z-index:3200;width:min(420px,calc(100% - 28px));background:#17302b;color:#fff;padding:14px 16px;border-radius:14px;box-shadow:0 16px 45px rgba(0,0,0,.24);font-size:13px;line-height:1.45}
    .pwa-toast button{margin-top:10px;border:0;border-radius:9px;padding:8px 11px;font-weight:800;background:#fff;color:#17302b}
  `;
  document.head.appendChild(style);

  function ensureInstallButton() {
    if (isStandalone() || document.getElementById('installAppBtn')) return;
    const topActions = document.querySelector('.top-actions');
    if (!topActions) return;
    const btn = document.createElement('button');
    btn.id = 'installAppBtn';
    btn.type = 'button';
    btn.className = 'install-app-btn';
    btn.textContent = 'Install app';
    btn.hidden = !isIOS && !deferredPrompt;
    btn.onclick = installApp;
    topActions.insertBefore(btn, topActions.firstChild);
  }

  function showIOSInstructions() {
    document.getElementById('pwaToast')?.remove();
    const box = document.createElement('div');
    box.id = 'pwaToast';
    box.className = 'pwa-toast';
    box.innerHTML = '<strong>Install on iPhone/iPad</strong><br>In Safari, tap Share, then <strong>Add to Home Screen</strong>.<br><button type="button">Close</button>';
    box.querySelector('button').onclick = () => box.remove();
    document.body.appendChild(box);
  }

  async function installApp() {
    if (isIOS && !deferredPrompt) return showIOSInstructions();
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch {}
    deferredPrompt = null;
    document.getElementById('installAppBtn')?.remove();
  }

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
    ensureInstallButton();
    const btn = document.getElementById('installAppBtn');
    if (btn) btn.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    document.getElementById('installAppBtn')?.remove();
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
      ensureInstallButton();
    });
  } else {
    window.addEventListener('load', ensureInstallButton);
  }
})();
