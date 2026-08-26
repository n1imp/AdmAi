/**
 * Unit — o guard do seed demo.  [F0-AMBIENTE]
 *
 * O QUE ESTE ARQUIVO PROTEGE
 *   `seed-demo.mjs` escreve dados fictícios direto no banco. Se algum dia ele rodar contra
 *   produção, o estrago é irreversível na prática: clientes falsos, serviços falsos e
 *   movimentações de estoque falsas misturados a dados reais, sem forma confiável de separar.
 *
 *   O guard é a única coisa entre esse cenário e um `--env-file` errado na linha de comando.
 *   Então ele é testado antes de qualquer coisa que o script faça.
 *
 * LISTA DE PERMISSÃO, E É POR ISSO QUE OS CASOS SÃO ESTES
 *   A tentação é procurar "prod" no host e recusar. Isso deixaria passar `admai`, `main`,
 *   `principal`, `db1` — qualquer nome que não contenha a palavra. Aqui só passa o que é
 *   reconhecidamente local: loopback E banco terminado em `_dev` ou `_test`. Tudo o mais
 *   aborta, inclusive o que parece inofensivo.
 */
import { describe, it, expect } from 'vitest';
import { ambienteElegivel, COBERTURA } from '../seed-demo.mjs';

const DEV = 'postgresql://u:p@localhost:55432/admai_dev?schema=public';

describe('ambienteElegivel — quem pode receber dados fictícios', () => {
  it('CONTROLE POSITIVO: banco local terminado em _dev é elegível', () => {
    const r = ambienteElegivel(DEV, 'development');
    /* Sem este caso, "recusa tudo" passaria como rigor — e um guard que recusa tudo é
       indistinguível de um script quebrado. */
    expect(r.elegivel).toBe(true);
    expect(r.banco).toBe('admai_dev');
  });

  it('CONTROLE POSITIVO: _test também é elegível', () => {
    expect(ambienteElegivel('postgresql://u:p@127.0.0.1:5432/admai_test', 'test').elegivel).toBe(
      true
    );
  });

  it('NODE_ENV=production recusa, mesmo com URL local', () => {
    const r = ambienteElegivel(DEV, 'production');
    /* A URL aqui é a MESMA do caso positivo. Só o ambiente muda — e só isso basta para
       recusar, porque `NODE_ENV=production` apontando para localhost é sinal de configuração
       confusa, e configuração confusa é exatamente quando o acidente acontece. */
    expect(r.elegivel).toBe(false);
    expect(r.motivo).toContain('production');
  });

  it('host remoto recusa, mesmo com nome de banco terminando em _dev', () => {
    const r = ambienteElegivel('postgresql://u:p@db.supabase.co:5432/admai_dev', 'development');
    /* O nome do banco é inocente; o host não. Um "_dev" hospedado no provedor de produção
       continua sendo um banco que não é meu para sujar. */
    expect(r.elegivel).toBe(false);
    expect(r.motivo).toContain('loopback');
  });

  it('banco sem sufixo reconhecido recusa, mesmo em loopback', () => {
    const r = ambienteElegivel('postgresql://u:p@localhost:5432/admai', 'development');
    /* `admai` em localhost pode ser uma cópia de produção restaurada para depurar. A regra
       não tenta adivinhar: exige o sufixo explícito. */
    expect(r.elegivel).toBe(false);
    expect(r.motivo).toContain('_dev');
  });

  it('nomes que apenas CONTÊM dev ou test não passam — o sufixo é no fim', () => {
    for (const banco of ['dev_admai', 'testes_gerais', 'admai_dev_backup']) {
      const r = ambienteElegivel(`postgresql://u:p@localhost:5432/${banco}`, 'development');
      expect(r.elegivel, `${banco} não deveria ser elegível`).toBe(false);
    }
    /* `admai_dev_backup` é o mais perigoso dos três: parece dev, e é uma cópia. */
  });

  it('DATABASE_URL ausente ou inválida recusa em vez de assumir', () => {
    expect(ambienteElegivel(undefined, 'development').elegivel).toBe(false);
    expect(ambienteElegivel('nao-e-url', 'development').elegivel).toBe(false);
  });
});

describe('COBERTURA — cada fixture declara o que existe para provar', () => {
  it('toda entrada nomeia a fixture E a capacidade observável', () => {
    expect(COBERTURA.length).toBeGreaterThanOrEqual(10);
    for (const c of COBERTURA) {
      expect(typeof c.fixture).toBe('string');
      expect(c.fixture.trim().length).toBeGreaterThan(2);
      /* Um seed sem esta coluna vira um monte de linhas plausíveis: ninguém sabe depois se
         pode mexer numa fixture sem quebrar a observação de outra coisa. */
      expect(typeof c.prova).toBe('string');
      expect(c.prova.trim().length).toBeGreaterThan(10);
    }
  });

  it('a fixture do serviço PENDENTE existe e diz que a aprovação é feita no produto', () => {
    const pendente = COBERTURA.find((c) => /PENDENTE/i.test(c.fixture));
    /* Esta é a fixture que carrega a regra `SEED_STATE != RUNTIME_ACCEPTANCE`. Se ela sumir,
       alguém provavelmente semeou o serviço já aprovado — e aí a baixa de estoque e a comissão
       passam a ser afirmações deste script, não observações do sistema. */
    expect(pendente).toBeTruthy();
    expect(pendente.prova).toMatch(/PRODUTO/i);
  });
});
