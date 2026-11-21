// Applies the saved light/dark choice before the page paints. Kept as a file (not inline) so the strict Content-Security-Policy allows it.
try { var t = localStorage.getItem('kaiju-theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
