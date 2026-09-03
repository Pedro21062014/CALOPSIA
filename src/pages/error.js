import { api, $, icon, initTheme } from './common.js';

/** Mensagens amigáveis para os códigos de erro de rede do Chromium. */
const MESSAGES = {
  '-105': ['Servidor não encontrado', 'Não conseguimos resolver o endereço deste site.', ['Confira se o endereço está escrito corretamente', 'Teste outro site para verificar sua conexão', 'Verifique as configurações de DNS']],
  '-106': ['Sem conexão com a internet', 'Seu dispositivo parece estar offline.', ['Verifique o cabo de rede ou o Wi-Fi', 'Desative o modo avião', 'Reinicie o roteador']],
  '-102': ['Conexão recusada', 'O servidor rejeitou a conexão.', ['O site pode estar fora do ar', 'Verifique a porta usada no endereço', 'Tente novamente em alguns minutos']],
  '-118': ['Tempo esgotado', 'O servidor demorou demais para responder.', ['Sua conexão pode estar lenta', 'O site pode estar sobrecarregado', 'Tente recarregar a página']],
  '-7':   ['Tempo esgotado', 'A operação excedeu o tempo limite.', ['Tente recarregar a página']],
  '-201': ['Certificado inválido', 'A identidade deste site não pôde ser verificada.', ['O certificado pode ter expirado', 'Não insira dados sensíveis nesta página', 'Verifique a data e a hora do sistema']],
  '-200': ['Certificado não confiável', 'A autoridade que emitiu o certificado é desconhecida.', ['Prossiga apenas se você confia neste servidor']],
  '-137': ['Falha na resolução de nome', 'O endereço não pôde ser traduzido em um servidor.', ['Confira a grafia do domínio']],
  '-324': ['Resposta vazia', 'O servidor encerrou a conexão sem enviar dados.', ['Tente recarregar a página']],
  '-2':   ['Falha inesperada', 'Algo deu errado ao carregar esta página.', ['Recarregue a página', 'Limpe o cache do navegador']],
  crash:  ['A página travou', 'O processo de renderização foi encerrado.', ['Recarregue a página', 'Feche outras abas para liberar memória']]
};

(async function init() {
  await initTheme();

  const params = new URLSearchParams(location.search);
  const code = params.get('code') || '-2';
  const rawDesc = params.get('desc') || '';
  const url = params.get('url') || '';

  const [title, desc, tips] = MESSAGES[code] || MESSAGES['-2'];

  $('#ico').innerHTML = icon(String(code).startsWith('-2') ? 'lock' : 'warn', 'icon');
  $('#title').textContent = title;
  $('#desc').textContent = desc;
  $('#url').textContent = url || '—';
  $('#code').textContent = `${rawDesc || 'ERRO'} (${code})`;
  $('#tips').innerHTML = tips.map((t) => `<li>${t}</li>`).join('');

  $('#retry').onclick = () => { if (url) api.navigate(url); else location.reload(); };
  $('#home').onclick = () => api.navigate('calopsia://newtab');
})();
