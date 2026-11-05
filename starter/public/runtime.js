/* Minimal external adapter: no bundler, no dependencies, CSP-friendly.
 * Trust boundary: fragment HTML MUST come from a trusted same-origin server.
 * Contract: one root element with id equal to URL fragment, e.g. #project-panel.
 */
(() => {
  'use strict';
  const frame = document.querySelector('iframe[name="htmz"]');
  const live = document.getElementById('ds-status');
  if (!frame || !live) return;

  function announce(message) {
    live.textContent = message;
    if (message === 'جارٍ التحميل…') document.documentElement.setAttribute('aria-busy', 'true');
    else document.documentElement.removeAttribute('aria-busy');
  }

  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element && event.target.closest('a[target="htmz"]');
    if (link) announce('جارٍ التحميل…');
  });
  document.addEventListener('submit', (event) => {
    if (event.target.getAttribute('target') === 'htmz') announce('جارٍ التحميل…');
  });

  frame.addEventListener('load', () => {
    try {
      const location = frame.contentWindow.location;
      if (location.href === 'about:blank') return; // Initial iframe navigation
      if (!location.hash) throw new Error('missing-target');
      if (location.origin !== window.location.origin) throw new Error('origin');
      const id = decodeURIComponent(location.hash.slice(1));
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(id)) throw new Error('invalid-target');
      const current = document.getElementById(id);
      const response = frame.contentDocument;
      const incoming = response?.body?.firstElementChild;
      if (!current || !incoming || incoming.id !== id || response.body.children.length !== 1) {
        throw new Error('fragment-contract');
      }
      current.replaceWith(incoming);
      if (incoming.hasAttribute('data-focus-on-swap')) {
        (incoming.querySelector('[data-focus]') || incoming).focus({preventScroll: true});
      }
      announce(incoming.dataset.result === 'error' ? 'تعذّر حفظ البيانات؛ راجع التنبيه.' : 'تم تحديث المحتوى.');
    } catch (error) {
      console.warn('htmz-kit:', error.name === 'SecurityError' ? 'cross-origin' : error.message);
      announce('لم يكتمل التحديث. تحقق من اتصال الخادم.');
    }
  });
})();
