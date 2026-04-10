/* ============================================================
   app.js — 共通インタラクション
   - パーシャル読み込み完了後に動作
   - ドロワー開閉、テーマ切替、リップル、Snackbar、スクロール検知、ナビ active 化
   ============================================================ */
(function () {
  'use strict';

  // ============ State ============
  const STORAGE_KEY = 'icm-theme';

  // ============ Utility ============
  function $(sel, ctx = document) { return ctx.querySelector(sel); }
  function $$(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }

  // ============ Theme ============
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
    const toggle = $('#themeToggle .material-symbols-rounded');
    if (toggle) toggle.textContent = theme === 'dark' ? 'light_mode' : 'dark_mode';
  }
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  }
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
    showSnackbar(`テーマを${current === 'dark' ? 'ライト' : 'ダーク'}に変更しました`);
  }

  // ============ Drawer ============
  function openDrawer() {
    $('#navDrawer')?.classList.add('open');
    $('#drawerScrim')?.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeDrawer() {
    $('#navDrawer')?.classList.remove('open');
    $('#drawerScrim')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  // ============ Active Nav highlighting ============
  function highlightActiveNav() {
    const page = document.body.getAttribute('data-page');
    if (!page) return;
    $$(`[data-nav="${page}"]`).forEach((el) => el.classList.add('active'));
  }

  // ============ Scroll-aware top app bar ============
  function initScrollAware() {
    const bar = $('#topAppBar');
    if (!bar) return;
    const onScroll = () => {
      if (window.scrollY > 8) bar.classList.add('scrolled');
      else bar.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ============ Ripple effect (Material 3 inspired) ============
  function attachRipples() {
    const selectors = '.btn, .icon-btn, .fab, .chip, .nav-drawer-item, .menu-item, .list-item, .bottom-nav-item, .top-app-bar-nav a';
    document.addEventListener('pointerdown', (e) => {
      const target = e.target.closest(selectors);
      if (!target) return;
      // skip disabled
      if (target.hasAttribute('disabled')) return;
      const rect = target.getBoundingClientRect();
      const ripple = document.createElement('span');
      const size = Math.max(rect.width, rect.height);
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      // ensure container is positioned
      const cs = getComputedStyle(target);
      if (cs.position === 'static') target.style.position = 'relative';
      if (cs.overflow !== 'hidden') target.style.overflow = 'hidden';
      target.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    });
  }

  // ============ Snackbar ============
  let snackbarEl = null;
  let snackbarTimer = null;
  function ensureSnackbar() {
    if (!snackbarEl) {
      snackbarEl = document.createElement('div');
      snackbarEl.className = 'snackbar';
      snackbarEl.setAttribute('role', 'status');
      snackbarEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(snackbarEl);
    }
    return snackbarEl;
  }
  function showSnackbar(message, opts = {}) {
    const el = ensureSnackbar();
    const action = opts.action;
    el.innerHTML = `<span>${escapeHtml(message)}</span>${action ? `<button class="snackbar-action">${escapeHtml(action.label)}</button>` : ''}`;
    if (action) {
      el.querySelector('.snackbar-action').addEventListener('click', () => {
        action.onClick?.();
        hideSnackbar();
      });
    }
    el.classList.add('show');
    clearTimeout(snackbarTimer);
    snackbarTimer = setTimeout(hideSnackbar, opts.duration || 3500);
  }
  function hideSnackbar() {
    snackbarEl?.classList.remove('show');
  }

  // ============ Dialog ============
  function openDialog(id) {
    $(`#${id}`)?.classList.add('show');
  }
  function closeDialog(id) {
    $(`#${id}`)?.classList.remove('show');
  }

  // ============ Helpers ============
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[c]));
  }

  // ============ Global event delegation ============
  function bindGlobalEvents() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const action = t.getAttribute('data-action');
      switch (action) {
        case 'open-drawer': openDrawer(); break;
        case 'close-drawer': closeDrawer(); break;
        case 'open-search': showSnackbar('検索機能はモック中です'); break;
        case 'open-dialog': openDialog(t.getAttribute('data-target')); break;
        case 'close-dialog': closeDialog(t.getAttribute('data-target')); break;
        default: break;
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });

    $('#themeToggle')?.addEventListener('click', toggleTheme);
  }

  // ============ Init ============
  function init() {
    bindGlobalEvents();
    highlightActiveNav();
    initScrollAware();
  }

  // パーシャル読み込み後にバインド
  document.addEventListener('partials:loaded', init);

  // 初期化（パーシャルなしでも動くもの）
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initTheme();
      attachRipples();
    });
  } else {
    initTheme();
    attachRipples();
  }

  // Expose
  window.ICM = { showSnackbar, openDialog, closeDialog, openDrawer, closeDrawer, toggleTheme };
})();
