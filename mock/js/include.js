/* ============================================================
   include.js — 共通パーシャル(header/footer)を読み込む
   各ページ末尾でこのスクリプトを読み込めばOK。
   <div data-include="partials/header.html"></div> のように使う。
   ============================================================ */
(function () {
  'use strict';

  async function includeAll() {
    const targets = document.querySelectorAll('[data-include]');
    await Promise.all(
      Array.from(targets).map(async (el) => {
        const url = el.getAttribute('data-include');
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(res.statusText);
          const html = await res.text();
          el.outerHTML = html;
        } catch (err) {
          console.error('[include] failed to load', url, err);
          el.innerHTML = `<!-- include failed: ${url} -->`;
        }
      })
    );
    // Notify other scripts that includes are ready
    document.dispatchEvent(new CustomEvent('partials:loaded'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', includeAll);
  } else {
    includeAll();
  }
})();
