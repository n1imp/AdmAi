/**
 * Leitura do payload de um JWT no navegador.  [GAP-UI-01]
 *
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA FECHAR
 *   `AuthContext` fazia `JSON.parse(atob(b64))`. `atob` não decodifica texto — ele devolve uma
 *   "binary string", em que cada caractere é UM BYTE. O nome `Ana Técnica` viaja no token como
 *   UTF-8, e o `é` são dois bytes: `c3 a9` (verificado no token real). Lidos como se fossem dois
 *   caracteres, viram `Ã©`, e o painel exibia `Ana TÃ©cnica`.
 *
 *   Não é um problema de acentos: é a etapa `bytes → texto` faltando. Todo nome não-ASCII quebra,
 *   e no Brasil isso é a maioria dos nomes. Trocar `é` por uma entidade, ou remover acentos do
 *   seed, esconderia o defeito em vez de fechá-lo.
 *
 * A CADEIA CORRETA, e cada elo importa
 *   base64url → base64 → bytes → UTF-8 → JSON
 *
 *   `base64url` troca `+/` por `-_` e costuma vir SEM padding. `atob` exige base64 canônico com
 *   padding: sem repor os `=`, tokens de certos comprimentos falham — um bug intermitente que
 *   parece aleatório porque depende do tamanho do payload, não do conteúdo.
 *
 * POR QUE AQUI E NÃO NO CONTEXTO
 *   Hoje há um único consumidor. Deixá-lo lá convidaria o segundo a copiar as mesmas quatro
 *   linhas — e a copiar o defeito junto, que foi como ele chegou até aqui.
 *
 * ISTO NÃO VALIDA NADA. A assinatura não é conferida no cliente, e não pode ser: a chave é do
 * servidor. O payload serve para desenhar a interface; toda decisão de acesso é do backend.
 */

/** Repõe o padding que o base64url omite. */
function comPadding(b64) {
  const resto = b64.length % 4;
  return resto === 0 ? b64 : b64 + '='.repeat(4 - resto);
}

/**
 * @param {string} token JWT completo (`header.payload.assinatura`).
 * @returns {object|null} o payload, ou `null` se o token for ilegível.
 */
export function decodeJWT(token) {
  try {
    const parte = String(token).split('.')[1];
    if (!parte) return null;

    const b64 = comPadding(parte.replace(/-/g, '+').replace(/_/g, '/'));
    const binaria = atob(b64);

    /* `charCodeAt` sobre a binary string recupera o byte original — é a ponte entre o que `atob`
       devolve e o que `TextDecoder` espera. Sem ela não há como voltar aos bytes. */
    const bytes = Uint8Array.from(binaria, (c) => c.charCodeAt(0));

    return JSON.parse(new TextDecoder('utf-8').decode(bytes));
  } catch {
    /* Token ilegível é sessão inválida, não erro de programação: quem chama trata `null` como
       "não há usuário". Deixar estourar derrubaria a aplicação no boot por um item corrompido
       no localStorage. */
    return null;
  }
}
