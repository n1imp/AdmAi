export const politicaCookies = {
  titulo: 'Política de Cookies',
  secoes: [
    {
      titulo: '1. O que são cookies',
      paragrafos: [
        'Cookies são pequenos arquivos de texto armazenados no seu navegador ou dispositivo quando você acessa o AdmAi. Usamos tecnologias similares (localStorage, sessionStorage) para o mesmo propósito.',
      ],
    },
    {
      titulo: '2. Cookies que usamos',
      itens: [
        'Necessários — autenticação (token JWT no localStorage): mantém você logado entre as páginas. Sem este cookie, o painel não funciona.',
        'Preferências — tema, estado do tour de boas-vindas, consentimento de cookies. Nenhum dado pessoal.',
        'Analíticos (com consentimento) — PostHog: entendemos quais funcionalidades são mais usadas para melhorar o produto. Nenhum identificador vendido a terceiros.',
        'Suporte (com consentimento) — Crisp.chat: identifica seu histórico de atendimento para agilizar o suporte.',
      ],
    },
    {
      titulo: '3. Como gerenciar cookies',
      paragrafos: [
        'Você pode alterar suas preferências de cookies a qualquer momento clicando em "Preferências de cookies" no rodapé do painel. Os cookies necessários não podem ser desativados pois são essenciais para a segurança da sessão.',
        'Você também pode limpar todos os cookies do seu navegador nas configurações. Isso encerrará sua sessão no AdmAi.',
      ],
    },
    {
      titulo: '4. Cookies de terceiros',
      itens: [
        'PostHog (analíticos) — somente com seu consentimento. Saiba mais: posthog.com/privacy.',
        'Crisp.chat (suporte) — somente com seu consentimento. Saiba mais: crisp.chat/privacy.',
        'Sentry (monitoramento de erros) — necessário para estabilidade do serviço; não rastreia comportamento.',
      ],
    },
    {
      titulo: '5. Retenção',
      paragrafos: [
        'O token de sessão expira em 24 horas. Preferências locais ficam armazenadas até você limpá-las manualmente. Dados de analytics são retidos por 90 dias no PostHog.',
      ],
    },
    {
      titulo: '6. Contato',
      paragrafos: ['Dúvidas sobre o uso de cookies: privacidade@barbers-flow.com.'],
    },
  ],
};
