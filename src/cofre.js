'use strict';

/* ============================================================
   Cofre de senhas do CALOPSIA
   ------------------------------------------------------------
   Duas camadas, uma por cima da outra:

     1. senha mestre  -> scrypt -> AES-256-GCM
     2. chaveiro do sistema (safeStorage: Keychain / DPAPI / libsecret)

   A camada 2 só existe quando o sistema oferece. No Linux sem
   gnome-keyring/kwallet o safeStorage fica indisponível e o cofre
   segue protegido pela senha mestre — nunca em texto puro.

   Formato do arquivo (JSON):
     { versao, kdf:{salt,N,r,p}, verificador, embrulho, guardado }
   ============================================================ */

const { app, safeStorage } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const VERSAO = 1;
const KDF = { N: 16384, r: 8, p: 1, keylen: 48 };   // ~17 MB por tentativa
const ARQUIVO = () => path.join(app.getPath('userData'), 'cofre.json');

/* ------------------------------------------------------------
   Estado (a chave só vive na memória, nunca vai para o disco)
   ------------------------------------------------------------ */
const estado = {
  existe: false,
  criado: false,
  aberto: false,
  embrulho: 'nenhum',     // 'so' | 'nenhum'
  chave: null,            // Buffer de 32 bytes
  dados: null             // { contas: [], nunca: [] }
};

const vazio = () => ({ contas: [], nunca: [] });
const tick = () => new Date().toISOString();

/* ------------------------------------------------------------
   Derivação da chave (scrypt)
   48 bytes: 32 viram a chave AES, 16 viram o verificador.
   ------------------------------------------------------------ */
function derivar(senha, salt) {
  const bruto = crypto.scryptSync(senha, salt, KDF.keylen, { N: KDF.N, r: KDF.r, p: KDF.p });
  return { chave: bruto.subarray(0, 32), verificador: bruto.subarray(32) };
}

const cifragemSO = () => {
  try { return safeStorage.isEncryptionAvailable(); } catch { return false; }
};

/* ------------------------------------------------------------
   Ler / gravar o arquivo
   ------------------------------------------------------------ */
function lerArquivo() {
  estado.existe = fs.existsSync(ARQUIVO());
  if (!estado.existe) return null;
  try { return JSON.parse(fs.readFileSync(ARQUIVO(), 'utf8')); } catch { return null; }
}

function gravarArquivo(meta, dados) {
  const pacote = JSON.stringify(cifrar(dados, meta.chave));
  const guardado = meta.embrulho === 'so'
    ? safeStorage.encryptString(pacote).toString('base64')
    : pacote;

  fs.writeFileSync(ARQUIVO(), JSON.stringify({
    versao: VERSAO,
    kdf: { salt: meta.salt.toString('hex'), N: KDF.N, r: KDF.r, p: KDF.p },
    verificador: meta.verificador.toString('hex'),
    embrulho: meta.embrulho,
    guardado
  }, null, 2), { mode: 0o600 });

  estado.dados = dados;
  estado.existe = true;
}

function cifrar(dados, chave) {
  const iv = crypto.randomBytes(12);
  const cifra = crypto.createCipheriv('aes-256-gcm', chave, iv);
  const corpo = Buffer.concat([cifra.update(JSON.stringify(dados), 'utf8'), cifra.final()]);
  return { iv: iv.toString('base64'), tag: cifra.getAuthTag().toString('base64'), corpo: corpo.toString('base64') };
}

function decifrar(pacote, chave) {
  const cifra = crypto.createDecipheriv('aes-256-gcm', chave, Buffer.from(pacote.iv, 'base64'));
  cifra.setAuthTag(Buffer.from(pacote.tag, 'base64'));
  const corpo = Buffer.concat([cifra.update(Buffer.from(pacote.corpo, 'base64')), cifra.final()]);
  return JSON.parse(corpo.toString('utf8'));
}

/* ------------------------------------------------------------
   API pública
   ------------------------------------------------------------ */

/** Estado resumido, para a interface saber o que mostrar. */
function situacao() {
  lerArquivo();
  return {
    existe: fs.existsSync(ARQUIVO()),
    aberto: estado.aberto,
    protecaoSO: cifragemSO()
  };
}

/** Cria o cofre pela primeira vez. */
function criar(senhaMestre) {
  if (typeof senhaMestre !== 'string' || senhaMestre.length < 6) {
    return { ok: false, erro: 'A senha mestre precisa de pelo menos 6 caracteres.' };
  }
  const salt = crypto.randomBytes(16);
  const { chave, verificador } = derivar(senhaMestre, salt);

  estado.chave = chave;
  estado.embrulho = cifragemSO() ? 'so' : 'nenhum';
  estado.aberto = true;
  estado.criado = true;
  gravarArquivo({ salt, verificador, chave, embrulho: estado.embrulho }, vazio());
  return { ok: true, protecaoSO: estado.embrulho === 'so' };
}

/** Abre o cofre com a senha mestre. */
function abrir(senhaMestre) {
  const arq = lerArquivo();
  if (!arq) return { ok: false, erro: 'Nenhum cofre encontrado.' };
  if (arq.versao !== VERSAO) return { ok: false, erro: 'Cofre de uma versão incompatível.' };

  const { chave, verificador } = derivar(senhaMestre, Buffer.from(arq.kdf.salt, 'hex'));
  if (!crypto.timingSafeEqual(verificador, Buffer.from(arq.verificador, 'hex'))) {
    return { ok: false, erro: 'Senha mestre incorreta.' };
  }

  // O cofre foi gravado com a proteção do sistema, mas ela sumiu (outro
  // computador, ou o chaveiro não está disponível agora).
  if (arq.embrulho === 'so' && !cifragemSO()) {
    return { ok: false, erro: 'Este cofre foi criado com a proteção do sistema, que não está disponível agora.' };
  }

  let pacote;
  try {
    pacote = arq.embrulho === 'so'
      ? JSON.parse(safeStorage.decryptString(Buffer.from(arq.guardado, 'base64')))
      : JSON.parse(arq.guardado);
  } catch {
    return { ok: false, erro: 'Não foi possível abrir o cofre (arquivo corrompido).' };
  }

  try {
    estado.dados = decifrar(pacote, chave);
  } catch {
    return { ok: false, erro: 'Senha mestre incorreta ou cofre corrompido.' };
  }

  estado.chave = chave;
  estado.embrulho = arq.embrulho;
  estado.aberto = true;
  if (!Array.isArray(estado.dados.contas)) estado.dados.contas = [];
  if (!Array.isArray(estado.dados.nunca)) estado.dados.nunca = [];
  return { ok: true, contas: estado.dados.contas.length };
}

function fechar() {
  estado.aberto = false;
  estado.chave = null;
  estado.dados = null;
  if (estado.chave) estado.chave.fill(0);
}

const exigirAberto = () => estado.aberto && estado.chave && estado.dados;

function gravar() {
  if (!exigirAberto()) return false;
  // Reaproveita sal/verificador já gravados.
  const arq = lerArquivo() || {};
  const salt = arq.kdf ? Buffer.from(arq.kdf.salt, 'hex') : crypto.randomBytes(16);
  const verificador = arq.verificador ? Buffer.from(arq.verificador, 'hex') : derivar('', salt).verificador;
  gravarArquivo({ salt, verificador, chave: estado.chave, embrulho: estado.embrulho }, estado.dados);
  return true;
}

/* ------------------------------------------------------------
   Contas
   ------------------------------------------------------------ */
const origemDe = (url) => {
  try { return new URL(url).origin; } catch { return String(url || ''); }
};

function listar() {
  if (!exigirAberto()) return [];
  return estado.dados.contas
    .map((c) => ({ id: c.id, site: c.site, usuario: c.usuario, atualizadoEm: c.atualizadoEm }))
    .sort((a, b) => a.site.localeCompare(b.site, 'pt-BR'));
}

function contasDoLocal(url) {
  if (!exigirAberto()) return [];
  const origem = origemDe(url);
  return estado.dados.contas
    .filter((c) => c.site === origem)
    .map((c) => ({ id: c.id, site: c.site, usuario: c.usuario, senha: c.senha }));
}

const nuncaSalvar = (url) => exigirAberto() && estado.dados.nunca.includes(origemDe(url));

function guardar({ url, usuario, senha }) {
  if (!exigirAberto()) return { ok: false, erro: 'Cofre fechado.' };
  const origem = origemDe(url);
  if (!usuario || !senha) return { ok: false, erro: 'Nada a salvar.' };

  const achou = estado.dados.contas.find((c) => c.site === origem && c.usuario === usuario);
  if (achou) {
    if (achou.senha === senha) return { ok: true, jaExiste: true };
    achou.senha = senha;
    achou.atualizadoEm = tick();
    gravar();
    return { ok: true, atualizou: true, id: achou.id };
  }

  const conta = {
    id: crypto.randomUUID(),
    site: origem,
    usuario,
    senha,
    criadoEm: tick(),
    atualizadoEm: tick()
  };
  estado.dados.contas.push(conta);
  gravar();
  return { ok: true, criou: true, id: conta.id };
}

/** Devolve a senha de uma conta. Só funciona com o cofre aberto. */
function revelar(id) {
  if (!exigirAberto()) return null;
  const c = estado.dados.contas.find((x) => x.id === id);
  return c ? { id: c.id, site: c.site, usuario: c.usuario, senha: c.senha, atualizadoEm: c.atualizadoEm } : null;
}

function apagar(id) {
  if (!exigirAberto()) return false;
  const antes = estado.dados.contas.length;
  estado.dados.contas = estado.dados.contas.filter((c) => c.id !== id);
  if (estado.dados.contas.length === antes) return false;
  gravar();
  return true;
}

function nuncaAqui(url) {
  if (!exigirAberto()) return false;
  const origem = origemDe(url);
  if (!estado.dados.nunca.includes(origem)) {
    estado.dados.nunca.push(origem);
    gravar();
  }
  // Esquece também o que já estava salvo deste site.
  estado.dados.contas = estado.dados.contas.filter((c) => c.site !== origem);
  gravar();
  return true;
}

/* ------------------------------------------------------------
   Gerador de senhas
   ------------------------------------------------------------ */
const MAIUSCULAS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';   // sem I e O
const MINUSCULAS = 'abcdefghijkmnopqrstuvwxyz';   // sem l
const DIGITOS    = '23456789';                    // sem 0 e 1
const SIMBOLOS   = '!@#$%&*+-=?';

function gerarSenha(tamanho = 20) {
  const n = Math.min(64, Math.max(12, Number(tamanho) || 20));
  const grupos = [MAIUSCULAS, MINUSCULAS, DIGITOS, SIMBOLOS];
  const escolhe = (s) => s[crypto.randomInt(s.length)];

  const senha = grupos.map(escolhe);                        // um de cada
  const tudo = MAIUSCULAS + MINUSCULAS + DIGITOS + SIMBOLOS;
  while (senha.length < n) senha.push(escolhe(tudo));

  // embaralha (Fisher–Yates com randomInt)
  for (let i = senha.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [senha[i], senha[j]] = [senha[j], senha[i]];
  }
  return senha.join('');
}

/** Força aproximada, só para dar um retorno visual. */
function forca(senha) {
  const s = String(senha || '');
  if (!s) return { nota: 0, rotulo: '—' };
  let pontos = 0;
  if (s.length >= 12) pontos += 1;
  if (s.length >= 16) pontos += 1;
  if (s.length >= 20) pontos += 1;
  if (/[a-z]/.test(s) && /[A-Z]/.test(s)) pontos += 1;
  if (/[0-9]/.test(s)) pontos += 1;
  if (/[^A-Za-z0-9]/.test(s)) pontos += 1;
  const nota = Math.min(4, Math.round((pontos / 6) * 4));
  return { nota, rotulo: ['Muito fraca', 'Fraca', 'Razoável', 'Forte', 'Muito forte'][nota] };
}

module.exports = {
  situacao, criar, abrir, fechar, gravar,
  listar, contasDoLocal, revelar, guardar, apagar, nuncaAqui, nuncaSalvar,
  gerarSenha, forca,
  estaAberto: exigirAberto
};
