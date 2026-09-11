(() => {
  function installHomeLink() {
    const brand = document.querySelector('.topbar > div');
    if (!brand || brand.closest('#homeBrandLink')) return;

    const link = document.createElement('a');
    link.id = 'homeBrandLink';
    link.className = 'home-brand-link';
    link.href = '/';
    link.setAttribute('aria-label', 'Go to Incident Hub home');
    link.title = 'Back to Incident Hub home';

    brand.parentNode.insertBefore(link, brand);
    link.appendChild(brand);

    link.addEventListener('click', event => {
      event.preventDefault();
      if (typeof nav === 'function') nav('dashboard');
      else window.location.href = '/';
    });

    const style = document.createElement('style');
    style.textContent = `
      .home-brand-link{display:block;color:inherit;text-decoration:none;border-radius:8px;padding:2px 4px;margin:-2px -4px}
      .home-brand-link:hover{background:rgba(255,255,255,.08)}
      .home-brand-link:focus-visible{outline:2px solid rgba(255,255,255,.9);outline-offset:3px}
      .home-brand-link h1,.home-brand-link .eyebrow{color:inherit}
    `;
    document.head.appendChild(style);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installHomeLink);
  else installHomeLink();
})();
