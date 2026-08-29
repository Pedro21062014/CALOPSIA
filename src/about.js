'use strict';
(function () {
  var q = new URLSearchParams(location.search);
  var set = function (id, value) {
    var el = document.getElementById(id);
    if (el && value) el.textContent = value;
  };
  set('version', 'versão ' + (q.get('v') || '—'));
  set('chrome', 'Chromium ' + (q.get('chrome') || '—'));
  set('electron', q.get('electron') || '—');
  set('node', q.get('node') || '—');
})();
