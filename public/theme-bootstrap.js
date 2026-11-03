/**
 * Theme Bootstrap: synchronously runs before first paint to restore palette and theme.
 */
(function() {
  try {
    function readStorage(key) {
      try {
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        try {
          return JSON.parse(raw);
        } catch (_) {
          return raw;
        }
      } catch (_) {
        return null;
      }
    }

    var savedPalette = readStorage('market-desk-ui-palette');
    var palette = (savedPalette === 'cobalt') ? 'cobalt' : 'terminal';

    var savedTheme = readStorage('market-desk-theme');
    var isDark = false;
    if (savedTheme === 'dark') {
      isDark = true;
    } else if (savedTheme === 'light') {
      isDark = false;
    } else {
      try {
        isDark = Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
      } catch (_) {
        isDark = false;
      }
    }

    var mode = isDark ? 'dark' : 'light';
    var doc = document.documentElement;
    if (doc) {
      doc.setAttribute('data-palette', palette);
      doc.setAttribute('data-theme', mode);
      if (isDark) {
        doc.classList.add('dark');
      } else {
        doc.classList.remove('dark');
      }
      if (doc.style) {
        doc.style.colorScheme = mode;
      }
    }

    var metaEl = document.getElementById('theme-color');
    if (metaEl) {
      var metaColor = '#ffffff';
      if (palette === 'cobalt') {
        metaColor = isDark ? '#2d2d2d' : '#ffffff';
      } else {
        metaColor = isDark ? '#111316' : '#ffffff';
      }
      metaEl.setAttribute('content', metaColor);
    }
  } catch (_) {}
})();
