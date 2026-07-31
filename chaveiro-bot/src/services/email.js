import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { comTimeout, criarBreaker } from '../utils/resiliencia.js';

let _resend = null;
// Breaker por réplica: se o Resend cair, abre e falha rápido (sem esperar o timeout de 15s
// a cada e-mail) por 30s, então testa de novo. E-mail é best-effort, degrada com elegância.
const breakerEmail = criarBreaker({ rotulo: 'resend', limiar: 5, resetMs: 30000 });

async function getResend() {
  if (!env.RESEND_API_KEY) return null;
  if (!_resend) {
    const { Resend } = await import('resend');
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}

async function enviar({ to, subject, html, text }) {
  const resend = await getResend();
  if (!resend) {
    logger.warn('email_skip', { to, subject, motivo: 'RESEND_API_KEY não configurado' });
    return;
  }
  try {
    await breakerEmail(() =>
      comTimeout(
        resend.emails.send({ from: env.FROM_EMAIL, to, subject, html, text }),
        15000,
        'resend.send'
      )
    );
    logger.info('email_enviado', { to, subject });
  } catch (e) {
    logger.warn('email_falha', { to, subject, erro: e.message });
  }
}

function baseUrl() {
  return env.FRONTEND_URL ?? 'http://localhost:5173';
}

function layout(titulo, corpo) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo}</title>
<style>
  body{margin:0;padding:0;background:#0f172a;font-family:system-ui,sans-serif;color:#e2e8f0}
  .wrap{max-width:560px;margin:40px auto;background:#1e293b;border-radius:12px;overflow:hidden}
  .header{background:#6366f1;padding:24px 32px}
  .header h1{margin:0;font-size:20px;color:#fff}
  .body{padding:32px}
  .body p{margin:0 0 16px;line-height:1.6}
  .btn{display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin:8px 0}
  .footer{padding:20px 32px;font-size:12px;color:#64748b;border-top:1px solid #334155}
  .footer a{color:#94a3b8}
</style>
</head>
<body>
<div class="wrap">
  <div class="header"><h1>⚙️ AdmAi</h1></div>
  <div class="body">${corpo}</div>
  <div class="footer">
    AdmAi — Gestão inteligente para chaveiros<br>
    <a href="${baseUrl()}/privacidade">Privacidade</a> · <a href="${baseUrl()}/termos">Termos</a>
    · <a href="mailto:${env.SUPPORT_EMAIL}">${env.SUPPORT_EMAIL}</a>
  </div>
</div>
</body>
</html>`;
}

export async function enviarEmailVerificacao(usuario, token) {
  const link = `${baseUrl()}/verificar-email?token=${token}`;
  await enviar({
    to: usuario.email,
    subject: 'Verifique seu e-mail — AdmAi',
    html: layout(
      'Verifique seu e-mail',
      `
      <p>Olá, <strong>${usuario.nome}</strong>!</p>
      <p>Clique no botão abaixo para verificar seu e-mail e ativar sua conta.</p>
      <a href="${link}" class="btn">Verificar e-mail</a>
      <p style="margin-top:24px;font-size:13px;color:#94a3b8">Link válido por 24 horas. Se não foi você, ignore este e-mail.</p>
    `
    ),
    text: `Olá ${usuario.nome},\n\nVerifique seu e-mail acessando: ${link}\n\nLink válido por 24 horas.`,
  });
}

/**
 * F-BYPASS (revisão independente): troca de e-mail via PATCH /me aplicava a mudança
 * imediatamente, sem confirmar com o endereço ANTIGO — um atacante com JWT roubado podia
 * redirecionar recuperação de senha (tomada de conta permanente) ou o código de exclusão
 * de conta para um e-mail próprio. Este e-mail vai para o endereço ANTIGO (ainda
 * cadastrado), exigindo consentimento de quem já tinha acesso a ele antes de aplicar.
 */
export async function enviarEmailConfirmarMudancaEmail(usuarioAntigo, novoEmail, token) {
  const link = `${baseUrl()}/confirmar-mudanca-email?token=${token}`;
  await enviar({
    to: usuarioAntigo.email,
    subject: 'Confirme a alteração do seu e-mail — AdmAi',
    html: layout(
      'Alteração de e-mail solicitada',
      `
      <p>Olá, <strong>${usuarioAntigo.nome}</strong>!</p>
      <p>Recebemos uma solicitação para alterar o e-mail da sua conta para <strong>${novoEmail}</strong>.</p>
      <a href="${link}" class="btn">Confirmar alteração</a>
      <p style="margin-top:24px;font-size:13px;color:#94a3b8">
        Link válido por 1 hora. Se não foi você, ignore este e-mail — seu endereço atual
        permanece inalterado e sua conta continua segura.
      </p>
    `
    ),
    text: `Confirme a alteração do seu e-mail para ${novoEmail}: ${link}\n\nVálido por 1 hora. Se não foi você, ignore este e-mail.`,
  });
}

export async function enviarEmailBoasVindas(usuario) {
  await enviar({
    to: usuario.email,
    subject: 'Bem-vindo ao AdmAi! 🎉',
    html: layout(
      'Bem-vindo!',
      `
      <p>Olá, <strong>${usuario.nome}</strong>!</p>
      <p>Sua conta foi verificada com sucesso. Agora você pode aproveitar todos os recursos do AdmAi.</p>
      <a href="${baseUrl()}" class="btn">Acessar o painel</a>
      <p style="margin-top:24px">Comece configurando seu WhatsApp para registrar serviços automaticamente.</p>
    `
    ),
    text: `Bem-vindo ao AdmAi, ${usuario.nome}!\n\nAcesse o painel: ${baseUrl()}`,
  });
}

export async function enviarEmailResetSenha(usuario, token) {
  const link = `${baseUrl()}/redefinir-senha?token=${token}`;
  await enviar({
    to: usuario.email,
    subject: 'Redefinição de senha — AdmAi',
    html: layout(
      'Redefinição de senha',
      `
      <p>Olá, <strong>${usuario.nome}</strong>!</p>
      <p>Recebemos uma solicitação de redefinição de senha para sua conta.</p>
      <a href="${link}" class="btn">Redefinir senha</a>
      <p style="margin-top:24px;font-size:13px;color:#94a3b8">
        Link válido por 1 hora. Se não foi você, sua senha continua protegida — ignore este e-mail.
      </p>
    `
    ),
    text: `Redefinição de senha AdmAi:\n\n${link}\n\nVálido por 1 hora.`,
  });
}

export async function enviarEmailConvite(email, empresa, papel, token) {
  const link = `${baseUrl()}/convite/${token}`;
  const papelLabel = { dono: 'Dono', gestor: 'Gestor', funcionario: 'Funcionário' }[papel] ?? papel;
  await enviar({
    to: email,
    subject: `Você foi convidado para ${empresa} — AdmAi`,
    html: layout(
      'Convite de equipe',
      `
      <p>Você foi convidado para entrar na empresa <strong>${empresa}</strong> como <strong>${papelLabel}</strong>.</p>
      <a href="${link}" class="btn">Aceitar convite</a>
      <p style="margin-top:24px;font-size:13px;color:#94a3b8">Convite válido por 48 horas.</p>
    `
    ),
    text: `Você foi convidado para ${empresa} (${papelLabel}).\n\nAcesse: ${link}\n\nVálido por 48 horas.`,
  });
}

export async function enviarEmailRecibo(usuario, valorFmt, planoNome) {
  await enviar({
    to: usuario.email,
    subject: `Pagamento confirmado — ${planoNome} — AdmAi`,
    html: layout(
      'Pagamento confirmado',
      `
      <p>Olá, <strong>${usuario.nome}</strong>!</p>
      <p>Seu pagamento de <strong>${valorFmt}</strong> para o plano <strong>${planoNome}</strong> foi confirmado.</p>
      <p>Sua assinatura foi renovada com sucesso.</p>
      <a href="${baseUrl()}/configuracao/billing" class="btn">Ver minha assinatura</a>
    `
    ),
    text: `Pagamento confirmado: ${valorFmt} — ${planoNome}.\n\nAdmAi: ${baseUrl()}`,
  });
}

export async function enviarEmailOnboardingDia1(usuario) {
  await enviar({
    to: usuario.email,
    subject: 'Conecte seu WhatsApp — AdmAi',
    html: layout(
      'Configure seu WhatsApp',
      `
      <p>Olá, <strong>${usuario.nome}</strong>!</p>
      <p>Você ainda não conectou seu WhatsApp ao AdmAi. É ele que captura os serviços automaticamente.</p>
      <p>Leva menos de 2 minutos:</p>
      <ol style="color:#94a3b8;line-height:2">
        <li>Acesse <strong style="color:#e2e8f0">Configurações → WhatsApp</strong> no painel</li>
        <li>Clique em <strong style="color:#e2e8f0">Conectar</strong> e escaneie o QR Code</li>
        <li>Escolha o grupo que receberá os resumos</li>
      </ol>
      <a href="${baseUrl()}/configuracao/whatsapp" class="btn">Conectar agora</a>
    `
    ),
    text: `Olá ${usuario.nome},\n\nConecte seu WhatsApp em: ${baseUrl()}/configuracao/whatsapp`,
  });
}

export async function enviarEmailOnboardingDia3(usuario) {
  await enviar({
    to: usuario.email,
    subject: 'Dica: como registrar seu primeiro serviço — AdmAi',
    html: layout(
      'Registre seu primeiro serviço',
      `
      <p>Olá, <strong>${usuario.nome}</strong>!</p>
      <p>Você sabia que pode registrar serviços direto pelo WhatsApp? Basta o técnico enviar uma mensagem no formato:</p>
      <div style="background:#0f172a;border-radius:8px;padding:16px;margin:16px 0;font-family:monospace;font-size:13px;color:#94a3b8">
        Local: [endereço]<br>
        Serviço: [o que foi feito]<br>
        Material: [peça usada ou Nenhum]<br>
        Valor cobrado: R$ [valor]
      </div>
      <p>O AdmAi lê, extrai e registra automaticamente. Sem digitação no painel.</p>
      <a href="${baseUrl()}/ajuda" class="btn">Ver guia completo</a>
    `
    ),
    text: `Olá ${usuario.nome},\n\nVeja como registrar serviços: ${baseUrl()}/ajuda`,
  });
}

export async function enviarEmailOnboardingDia7(usuario) {
  await enviar({
    to: usuario.email,
    subject: 'Uma semana com AdmAi — como está indo?',
    html: layout(
      'Como está indo?',
      `
      <p>Olá, <strong>${usuario.nome}</strong>!</p>
      <p>Faz uma semana que você criou sua conta no AdmAi. Esperamos que esteja sendo útil!</p>
      <p>Funcionalidades que você pode ainda não ter explorado:</p>
      <ul style="color:#94a3b8;line-height:2">
        <li><strong style="color:#e2e8f0">Repartição</strong> — feche o período e veja o que cada técnico recebe</li>
        <li><strong style="color:#e2e8f0">Estoque</strong> — controle materiais e receba alertas de reposição</li>
        <li><strong style="color:#e2e8f0">Avaliações</strong> — solicite feedback automático dos clientes pelo WhatsApp</li>
      </ul>
      <a href="${baseUrl()}" class="btn">Explorar o painel</a>
      <p style="margin-top:24px;font-size:13px;color:#94a3b8">
        Dúvidas? Responda este e-mail ou acesse <a href="${baseUrl()}/ajuda" style="color:#6366f1">suporte</a>.
      </p>
    `
    ),
    text: `Olá ${usuario.nome},\n\nComo está indo? Explore o painel: ${baseUrl()}`,
  });
}

export async function enviarEmailMagicLink(usuario, token) {
  const link = `${baseUrl()}/magic-link?token=${token}`;
  await enviar({
    to: usuario.email,
    subject: 'Seu link de acesso — AdmAi',
    html: layout(
      'Link de acesso',
      `
      <p>Olá, <strong>${usuario.nome}</strong>!</p>
      <p>Clique no botão abaixo para entrar no AdmAi sem precisar de senha.</p>
      <a href="${link}" class="btn">Entrar agora</a>
      <p style="margin-top:24px;font-size:13px;color:#94a3b8">Link válido por 15 minutos e de uso único. Se não foi você, ignore este e-mail.</p>
    `
    ),
    text: `Acesse AdmAi: ${link}\n\nVálido por 15 minutos.`,
  });
}

/**
 * F3: contas sem senha (social-only) e sem 2FA não tinham nenhuma segunda camada de
 * confirmação para excluir a empresa em cascata. Código de confirmação por e-mail,
 * aditivo — não substitui a checagem de senha/2FA quando existem.
 */
export async function enviarEmailCodigoExclusaoConta(usuario, codigo) {
  await enviar({
    to: usuario.email,
    subject: 'Código de confirmação para excluir sua conta — AdmAi',
    html: layout(
      'Confirmar exclusão de conta',
      `
      <p>Olá, <strong>${usuario.nome}</strong>!</p>
      <p>Recebemos uma solicitação para excluir permanentemente sua conta e os dados da empresa.</p>
      <p style="font-size:28px;font-weight:700;letter-spacing:4px;text-align:center;margin:24px 0">${codigo}</p>
      <p style="margin-top:8px;font-size:13px;color:#94a3b8">
        Use este código para confirmar a exclusão. Válido por 10 minutos. Se não foi você, ignore
        este e-mail — sua conta permanece segura.
      </p>
    `
    ),
    text: `Código de confirmação de exclusão de conta AdmAi: ${codigo}\n\nVálido por 10 minutos. Se não foi você, ignore este e-mail.`,
  });
}

export async function enviarEmailFalhaPagamento(usuario) {
  await enviar({
    to: usuario.email,
    subject: 'Falha no pagamento — Ação necessária — AdmAi',
    html: layout(
      'Falha no pagamento',
      `
      <p>Olá, <strong>${usuario.nome}</strong>!</p>
      <p>Não conseguimos processar o pagamento da sua assinatura AdmAi.</p>
      <p>Atualize seu método de pagamento para continuar usando o serviço.</p>
      <a href="${baseUrl()}/configuracao/billing" class="btn">Atualizar pagamento</a>
      <p style="margin-top:24px;font-size:13px;color:#94a3b8">
        Você tem um período de graça de 7 dias antes que o acesso seja suspenso.
      </p>
    `
    ),
    text: `Falha no pagamento AdmAi. Atualize em: ${baseUrl()}/configuracao/billing`,
  });
}
