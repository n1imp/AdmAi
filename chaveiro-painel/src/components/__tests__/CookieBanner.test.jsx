/**
 * GAP-UX-CONSENT-01 — o consentimento reserva espaço real.  [SCOPE-F2F]
 *
 * O DEFEITO
 *   `CookieBanner` é `position: fixed` e nada reservava altura equivalente, então ele deitava por
 *   cima do que já estava na tela. Medido em 35 superfícies: em 360px cortava o botão de entrar do
 *   login ao meio, cobria o campo E o botão da troca de senha OBRIGATÓRIA, escondia o
 *   "INICIAR SERVIÇO" do técnico em campo, e tapava a navegação inferior inteira em quase toda
 *   tela autenticada.
 *
 * O QUE ESTES TESTES PROVAM, E O QUE NÃO PROVAM
 *   jsdom não faz layout: toda caixa mede zero. Então aqui se prova o CONTRATO — a variável é
 *   publicada enquanto o banner existe, e devolvida quando ele sai — e se prova que as regras de
 *   CSS que consomem a variável estão no lugar. A geometria real é provada em runtime, por CDP,
 *   e está registrada no gap: `scrollHeight` 940 -> 1186 em 360x800, com o botão de submissão
 *   saindo de inalcançável para alcançável por hit-test.
 *
 *   Confundir uma prova com a outra seria o erro clássico: `TEST_PASS != RUNTIME_ACCEPTED`.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import CookieBanner, { EVENTO_PREFERENCIAS_COOKIES } from '../CookieBanner.jsx';

/* O banner traz um `<Link to="/cookies">` — "Saiba mais" — entao precisa de um Router. */
const montar = () => render(<CookieBanner />, { wrapper: MemoryRouter });

const VAR_CONSENT = '--admai-consent-h';
const INDEX_CSS = resolve(process.cwd(), 'src/index.css');
const leVar = () => document.documentElement.style.getPropertyValue(VAR_CONSENT);

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.style.removeProperty(VAR_CONSENT);
});

describe('CookieBanner — espaço reservado', () => {
  it('POSITIVO: publica a própria altura enquanto está na tela', () => {
    montar();
    /* O valor é 0px em jsdom porque não há layout; o que importa é que a propriedade EXISTE.
       Ausência da propriedade significaria layout sem reserva, que é o defeito original. */
    expect(leVar()).not.toBe('');
    expect(leVar()).toMatch(/^\d+px$/);
  });

  it('NEGATIVO: devolve o espaço ao ser respondido', async () => {
    /* Banner dispensado que continuasse reservando altura deixaria uma faixa morta no rodapé de
       todas as telas — trocaria um defeito visível por um invisível. */
    montar();
    expect(leVar()).not.toBe('');

    await userEvent.click(screen.getByRole('button', { name: /apenas necess/i }));

    expect(leVar()).toBe('');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('NEGATIVO: quem já respondeu não vê o banner nem paga a reserva', () => {
    localStorage.setItem('admai_cookies_consent', 'necessary');
    montar();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(leVar()).toBe('');
  });

  it('senta ACIMA da navegação inferior, e não sobre ela', () => {
    /* As duas são `fixed` no mesmo canto. Sem o deslocamento, a de maior z-index simplesmente
       apaga a outra — foi o que cobriu a navegação inteira em quase toda tela autenticada. */
    montar();
    expect(screen.getByRole('dialog')).toHaveStyle({ bottom: 'var(--admai-nav-h, 0px)' });
  });

  /**
   * SABOTAGEM — as duas regras de CSS que consomem a variável.
   *
   * A variável sozinha não faz nada: quem transforma medida em espaço é o CSS. Se alguém
   * remover qualquer uma das duas regras, o banner volta a cobrir conteúdo e nenhum teste de
   * componente perceberia. Por isso a asserção é sobre a folha de estilo.
   */
  it('SABOTAGEM: as duas regras que consomem a variável existem', () => {
    const css = readFileSync(INDEX_CSS, 'utf8');

    /* (1) Página CURTA: o utilitário compartilhado por 13 cascas desconta a altura medida, então
       layout centrado volta a centralizar no espaço visível. */
    expect(css).toMatch(
      /\.min-h-dvh\s*\{[^}]*min-height:\s*calc\(100dvh\s*-\s*var\(--admai-consent-h[^)]*\)\)/
    );

    /* (2) Página LONGA: o padding no fim do documento devolve a altura ao curso de rolagem, então
       o último conteúdo consegue subir acima do banner em vez de ficar preso debaixo dele. */
    expect(css).toMatch(/padding-bottom:\s*var\(--admai-consent-h,\s*0px\)/);
  });

  it('SABOTAGEM: o desconto é MEDIDO, nunca um número fixo', () => {
    /* Um offset constante acerta num tamanho e erra calado em todos os outros: a altura muda com
       viewport, quebra de linha, escala de fonte do sistema e tradução futura. Em 360px o banner
       mede 246px; em 1440px, bem menos. */
    const fonte = readFileSync(resolve(process.cwd(), 'src/components/CookieBanner.jsx'), 'utf8');
    expect(fonte).toMatch(/getBoundingClientRect\(\)\.height/);
    expect(fonte).toMatch(/ResizeObserver/);
    expect(fonte).toMatch(/setProperty\(\s*'--admai-consent-h'/);
    /* E some ao sair: sem isto a reserva viraria permanente. */
    expect(fonte).toMatch(/removeProperty\('--admai-consent-h'\)/);
  });

  it('o evento de preferências REABRE um banner já dispensado (revogação do rodapé)', async () => {
    localStorage.setItem('admai_cookies_consent', 'all');
    montar();
    expect(screen.queryByRole('dialog', { name: 'Preferências de cookies' })).toBeNull();

    localStorage.removeItem('admai_cookies_consent'); // o helper do rodapé faz isso antes do evento
    window.dispatchEvent(new Event(EVENTO_PREFERENCIAS_COOKIES));

    expect(
      await screen.findByRole('dialog', { name: 'Preferências de cookies' })
    ).toBeInTheDocument();
  });
});
