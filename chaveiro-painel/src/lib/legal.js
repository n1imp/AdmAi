// Conteúdo dos documentos legais exibidos no painel (Privacidade e Termos).
// ⚠️ MODELO: revise com um advogado e substitua os campos entre colchetes [ ]
// antes do lançamento público. A versão integral (fonte) fica em docs/legal/.

export const ATUALIZADO_EM = '[DD/MM/AAAA]';

const AVISO_MODELO =
  'Este é um modelo. Substitua os dados entre colchetes e valide com um advogado antes de publicar.';

export const politicaPrivacidade = {
  titulo: 'Política de Privacidade',
  aviso: AVISO_MODELO,
  secoes: [
    {
      titulo: '1. Quem somos',
      paragrafos: [
        'O ChaveiroBot é um serviço (SaaS) que permite a empresas de chaveiro registrarem serviços via WhatsApp e gerirem receita, comissões, estoque e avaliações por um painel web.',
        'Controlador dos dados de conta: [NOME DA EMPRESA], CNPJ [CNPJ]. Encarregado (DPO): [NOME] — [privacidade@seudominio.com]. Tratamos dados conforme a LGPD (Lei nº 13.709/2018).',
      ],
    },
    {
      titulo: '2. Papéis (controlador e operador)',
      paragrafos: [
        'Somos Controlador dos dados de cadastro e uso do painel (donos e usuários).',
        'Somos Operador dos dados que a empresa-cliente insere sobre seus próprios clientes finais (telefone, nome, foto, avaliação). Nesses casos, a empresa-cliente é a Controladora e tratamos os dados em seu nome.',
      ],
    },
    {
      titulo: '3. Dados que coletamos',
      itens: [
        'Conta: nome, e-mail, telefone, usuário e senha (hash) ou login social, segredo de 2FA (cifrado).',
        'Uso e segurança: logs de acesso, IP, métricas técnicas.',
        'Clientes finais do chaveiro: telefone, nome, foto de evidência e nota de avaliação (1–5).',
      ],
    },
    {
      titulo: '4. Como usamos os dados',
      itens: [
        'Operar registro de serviços, comissões, estoque e avaliações.',
        'Autenticar usuários e proteger contas (2FA, prevenção a abuso).',
        'Enviar mensagens de avaliação ao cliente final a pedido da empresa-cliente.',
        'Gerar métricas e relatórios. Não vendemos dados pessoais.',
      ],
    },
    {
      titulo: '5. WhatsApp e mensageria',
      paragrafos: [
        'O envio e o recebimento de mensagens ocorrem pela API oficial do WhatsApp (Meta), sujeita às políticas da Meta. Mensagens proativas usam modelos (templates) aprovados e respeitam o opt-in do destinatário.',
      ],
    },
    {
      titulo: '6. Compartilhamento',
      paragrafos: ['Compartilhamos dados apenas com prestadores necessários à operação, sob contrato:'],
      itens: [
        'Provedor de hospedagem — infraestrutura (servidores e banco).',
        'Meta (WhatsApp) — envio/recebimento de mensagens.',
        'Sentry — monitoramento de erros (com PII filtrada).',
        'Provedores de login social (Google/Microsoft/Apple) — autenticação opcional.',
      ],
    },
    {
      titulo: '7. Segurança',
      paragrafos: [
        'Adotamos HTTPS/TLS em trânsito, criptografia de segredos em repouso (AES-256-GCM), hashing de senhas, 2FA, isolamento por empresa, rate limiting e monitoramento. Em caso de incidente relevante, comunicaremos os titulares e a ANPD.',
      ],
    },
    {
      titulo: '8. Retenção e descarte',
      itens: [
        'Conta: enquanto ativa e por até [X meses] após o encerramento, salvo obrigação legal.',
        'Clientes finais: padrão de [180 dias], depois anonimizados ou eliminados.',
        'Logs técnicos: até [90 dias].',
      ],
    },
    {
      titulo: '9. Seus direitos (LGPD, art. 18)',
      paragrafos: [
        'Você pode solicitar confirmação, acesso, correção, anonimização, portabilidade, eliminação e revogação de consentimento.',
        'Usuários do painel: via [privacidade@seudominio.com]. Clientes finais: direcione à empresa de chaveiro (Controladora). Prazo de resposta: até 15 dias.',
      ],
    },
    {
      titulo: '10. Cookies',
      paragrafos: [
        'O painel usa armazenamento local/cookies estritamente necessários para sessão e autenticação.',
      ],
    },
    {
      titulo: '11. Exclusão de conta e dados',
      paragrafos: [
        'Você pode excluir sua conta a qualquer momento, sem precisar falar com o suporte, diretamente no painel ou no aplicativo: acesse Configuração → Segurança → "Excluir minha conta" e confirme com a sua senha (e o código 2FA, se estiver ativo).',
        'O que é apagado: se você for o único dono da empresa, a exclusão remove permanentemente a empresa e todos os dados associados (usuários, técnicos, serviços, estoque, registros de ponto e avaliações). Para os demais usuários, apagamos apenas a sua conta de acesso.',
        'Alternativa pela web: também é possível solicitar a exclusão por [privacidade@seudominio.com]; concluiremos em até 15 dias, ressalvados os dados que a lei exige reter (ex.: obrigações fiscais).',
      ],
    },
    {
      titulo: '12. Contato',
      paragrafos: [
        'Dúvidas sobre privacidade: [privacidade@seudominio.com]. Encarregado (DPO): [NOME]. ANPD: gov.br/anpd.',
      ],
    },
  ],
};

export const termosDeUso = {
  titulo: 'Termos de Uso',
  aviso: AVISO_MODELO,
  secoes: [
    {
      titulo: '1. Aceitação',
      paragrafos: [
        'Ao criar uma conta ou usar o ChaveiroBot, você concorda com estes Termos e com a Política de Privacidade. Se não concordar, não utilize a plataforma.',
      ],
    },
    {
      titulo: '2. O serviço',
      paragrafos: [
        'O ChaveiroBot permite registrar serviços via WhatsApp e gerir receita, comissões, estoque e avaliações. É fornecido no modelo "como está", podendo evoluir, e está inicialmente em fase beta.',
      ],
    },
    {
      titulo: '3. Conta e responsabilidade',
      itens: [
        'Forneça informações verdadeiras e mantenha suas credenciais em sigilo.',
        'Você é responsável pela atividade na sua conta. Recomendamos ativar o 2FA.',
        'Cada empresa é um ambiente isolado; você responde pelos usuários que cadastrar.',
        'Uso exclusivamente profissional, por maiores de 18 anos.',
      ],
    },
    {
      titulo: '4. Uso aceitável',
      paragrafos: ['Você concorda em não:'],
      itens: [
        'Violar leis, os Termos do WhatsApp/Meta ou direitos de terceiros.',
        'Enviar spam ou mensagens não solicitadas a clientes finais.',
        'Burlar limites técnicos, o isolamento entre empresas ou acessar dados de outros.',
        'Fazer engenharia reversa ou comprometer a segurança e a infraestrutura.',
      ],
    },
    {
      titulo: '5. Dados de clientes finais',
      paragrafos: [
        'Ao registrar serviços e disparar avaliações, você é o Controlador dos dados dos seus clientes finais e declara possuir base legal/consentimento para tratá-los e para enviar mensagens via WhatsApp.',
      ],
    },
    {
      titulo: '6. WhatsApp e mensageria',
      paragrafos: [
        'O envio depende da API oficial do WhatsApp (Meta) e está sujeito a políticas, limites e tarifas. Mensagens proativas exigem templates aprovados. Não garantimos a entrega de mensagens bloqueadas pela Meta ou pela operadora.',
      ],
    },
    {
      titulo: '7. Planos, pagamento e beta',
      paragrafos: [
        'Durante o beta, o serviço pode ser gratuito ou com condições especiais. Após o beta, poderão ser aplicados planos pagos, informados com antecedência. [Detalhe cobrança, cancelamento e reembolso.]',
      ],
    },
    {
      titulo: '8. Disponibilidade e suporte',
      paragrafos: [
        'Empenhamo-nos em manter a plataforma disponível, mas não garantimos operação ininterrupta, especialmente no beta. Suporte: [canal de suporte].',
      ],
    },
    {
      titulo: '9. Propriedade intelectual',
      paragrafos: [
        'O software, a marca, o código e o design pertencem a [NOME DA EMPRESA]. Você recebe uma licença limitada, não exclusiva e revogável de uso. Os dados que você insere permanecem seus.',
      ],
    },
    {
      titulo: '10. Limitação de responsabilidade',
      paragrafos: [
        'Na máxima extensão da lei, não respondemos por danos indiretos, lucros cessantes, perda de dados por mau uso ou indisponibilidades de terceiros (WhatsApp/Meta, nuvem). A responsabilidade total fica limitada a [valor].',
      ],
    },
    {
      titulo: '11. Suspensão e encerramento',
      paragrafos: [
        'Podemos suspender ou encerrar contas que violem estes Termos ou ameacem a segurança. Você pode encerrar sua conta a qualquer momento, observadas as regras de retenção da Política de Privacidade.',
      ],
    },
    {
      titulo: '12. Lei e foro',
      paragrafos: [
        'Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca de [CIDADE/UF], salvo direito do consumidor de optar pelo foro de seu domicílio.',
      ],
    },
    {
      titulo: '13. Contato',
      paragrafos: ['[NOME DA EMPRESA] — [contato@seudominio.com].'],
    },
  ],
};
