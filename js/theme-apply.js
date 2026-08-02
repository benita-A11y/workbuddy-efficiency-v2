/**
 * 主题应用器（轻量版，供独立页面 finance / inspiration / inspiration-detail 使用）
 * 复刻 app.js 的 applyTheme：读取主程序同一份 localStorage 主题设置，
 * 将全套 --theme-* 变量写入 :root，使独立页与主程序共享同一套换肤体系，整页联动。
 */
(function () {
  'use strict';

  // 与 app.js THEME_PACKS 保持一致
  var THEME_PACKS = {
    default:  { primary: '#B8C5D6', bg: '#F5F5F7', card: '#FFFFFF', accent: '#C5E1D5' },
    matcha:   { primary: '#7FB069', bg: '#F2F8ED', card: '#FFFFFF', accent: '#5E8C4E' },
    hazyblue: { primary: '#8FA9C4', bg: '#EDF2F8', card: '#FFFFFF', accent: '#6E89A8' },
    peach:    { primary: '#EBA8A0', bg: '#FDF3F0', card: '#FFFFFF', accent: '#D98C82' },
    milktea:  { primary: '#C2A06B', bg: '#F7F1E8', card: '#FFFFFF', accent: '#A8854E' },
    lavender: { primary: '#B0A4D9', bg: '#F3F0FA', card: '#FFFFFF', accent: '#9384C9' },
    dark:     { primary: '#A8C0A0', bg: '#1E1E24', card: '#2A2A31', accent: '#C8E6D5' }
  };

  function hexToRgb(hex) {
    hex = (hex || '').replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(hex, 16);
    if (isNaN(n)) return [184, 197, 214];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function applyTheme() {
    var root = document.documentElement;
    var packId = 'default';
    var custom = null;

    try {
      var raw = localStorage.getItem('efficiency_app_data');
      if (raw) {
        var data = JSON.parse(raw);
        var s = (data && data.settings) || {};
        if (s.themePack) packId = s.themePack;
        if (s.customTheme) custom = s.customTheme;
      }
    } catch (e) { /* 忽略损坏数据，走默认主题 */ }

    root.setAttribute('data-theme', packId);

    var primary, bg, card, accent, isDark = false;
    if (packId === 'custom' && custom) {
      primary = custom.primary; bg = custom.bg; card = custom.card; accent = custom.accent;
    } else {
      var pack = THEME_PACKS[packId] || THEME_PACKS.default;
      primary = pack.primary; bg = pack.bg; card = pack.card; accent = pack.accent;
      isDark = (packId === 'dark');
    }

    // 主色系
    root.style.setProperty('--theme-primary', primary);
    root.style.setProperty('--theme-color', primary);
    // 背景 / 卡片 / 强调
    root.style.setProperty('--theme-bg', bg);
    root.style.setProperty('--bg-page', bg);
    root.style.setProperty('--theme-card', card);
    root.style.setProperty('--bg-card', card);
    root.style.setProperty('--theme-accent', accent);
    root.style.setProperty('--accent', accent);
    // 文字 / 分割线
    if (isDark) {
      root.style.setProperty('--text-primary', '#E6E6EA');
      root.style.setProperty('--text-secondary', '#A0A0A8');
      root.style.setProperty('--border-color', '#3A3A42');
    } else {
      root.style.setProperty('--text-primary', '#4A4A4A');
      root.style.setProperty('--text-secondary', '#9A9A9A');
      root.style.setProperty('--border-color', '#EEEEEE');
    }
    // 导航底色 tint
    var rgb = hexToRgb(primary);
    root.style.setProperty('--nav-bg', 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.12)');
    root.style.setProperty('--nav-bg-solid', 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.9)');

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', primary);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyTheme);
  } else {
    applyTheme();
  }

  // 跨页主题同步：主程序改主题后，其它已打开的标签页即时联动
  window.addEventListener('storage', function (e) {
    if (!e.key || e.key === 'efficiency_app_data') applyTheme();
  });
})();
