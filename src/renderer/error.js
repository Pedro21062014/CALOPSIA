'use strict';

const params = new URLSearchParams(window.location.search);
const failedUrl = params.get('url') || '';
const description = params.get('description') || 'Falha de rede';
const code = params.get('code') || '';

document.querySelector('#url').textContent = failedUrl;
document.querySelector('#details').textContent = `${description}${code ? ` · ${code}` : ''}`;
document.querySelector('#retry').addEventListener('click', () => {
  if (failedUrl) window.location.assign(failedUrl);
});
document.querySelector('#home').addEventListener('click', () => {
  window.location.assign('newtab.html');
});
