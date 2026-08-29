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

  /* ---------------- Atualizações (verificação manual) ---------------- */
  var api = window.calopsiaTab || null;
  var elAtual = document.getElementById('u-current');
  var elStatus = document.getElementById('u-status');
  var elNotas = document.getElementById('u-notas');
  var elCheck = document.getElementById('u-check');
  var elInstall = document.getElementById('u-install');
  var elLink = document.getElementById('u-link');
  var verificando = false;

  if (elAtual) elAtual.textContent = 'instalada: v' + (q.get('v') || '—');

  function pintar(s) {
    if (!s) return;
    var st = s.status;

    if (elAtual && s.atual) elAtual.textContent = 'instalada: v' + s.atual;

    elCheck.hidden = !api || st === 'checking' || st === 'downloading';
    elCheck.disabled = verificando || st === 'checking' || st === 'downloading';

    var instalavel = st === 'available' || st === 'ready';
    elInstall.hidden = !instalavel;
    elInstall.disabled = st === 'downloading';
    elInstall.textContent = st === 'ready' ? 'Reiniciar e instalar' : 'Baixar e instalar';

    elLink.hidden = !(s.versao && instalavel);
    if (s.url) elLink.href = s.url;

    elNotas.hidden = !(instalavel && s.notas);
    if (s.notas) elNotas.textContent = s.notas;

    if (st === 'checking') elStatus.textContent = 'Verificando atualizações…';
    else if (st === 'available') elStatus.textContent = 'Nova versão v' + s.versao + ' disponível!';
    else if (st === 'downloading') elStatus.textContent = 'Baixando a v' + s.versao + '… ' + (s.progresso || 0) + '%';
    else if (st === 'ready') elStatus.textContent = 'v' + s.versao + ' baixada e pronta para instalar.';
    else if (st === 'latest') elStatus.textContent = 'Você já está na versão mais recente (v' + (s.atual || q.get('v') || '—') + ').';
    else if (st === 'error') elStatus.textContent = 'Não foi possível verificar agora' + (s.erro ? ' — ' + s.erro : '') + '.';
    else elStatus.textContent = 'A verificação automática acontece a cada 30 minutos.';
  }

  if (api) {
    api.estadoAtualizacao().then(pintar).catch(function () {});
    api.onAtualizacao(pintar);

    elCheck.addEventListener('click', function () {
      verificando = true;
      pintar({ status: 'checking', atual: q.get('v') });
      api.verificarAtualizacao().then(function (s) {
        verificando = false;
        pintar(s);
      }).catch(function () {
        verificando = false;
        pintar({ status: 'error', atual: q.get('v') });
      });
    });

    elInstall.addEventListener('click', function () {
      elInstall.disabled = true;
      api.atualizarAgora();
    });
  }
})();
