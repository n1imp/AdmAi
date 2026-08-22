import {
  LayoutDashboard,
  Home,
  Users,
  PieChart,
  ClipboardList,
  CheckCircle,
  Boxes,
  Package,
  Star,
  Clock,
  Plus,
  Wrench,
  User,
  Settings,
  ShieldCheck,
  Bell,
  HelpCircle,
  UserCog,
  FileText,
} from 'lucide-react';
import { featureAtiva } from '../lib/featureFlags.js';

// Manifesto único de navegação (F2 / PR2 + PR4). Fonte única de verdade para
// BottomNav (mobile), Sidebar (desktop) e "Mais". Cada papel recebe uma experiência
// própria com rotas REAIS e sem destinos duplicados.
//
// Cada destino declara como é liberado (`guard`):
//   { sempre: true }        → escopo próprio (conta), sempre visível quando autenticado
//   { modulo, acao }        → visível se pode(modulo, acao ?? 'ver')
//   { proprio }             → visível se podeProprio(proprio)
// e onde aparece:
//   mobile: 'primary'       → destino persistente da bottom navigation (máx. 5 com "Mais")
//   mobile: 'more'          → vai para a página "Mais"
//   group                   → seção da sidebar desktop
//   descricao               → subtítulo curto (usado nos cards de "Mais"; opcional)
//
// Regra de segurança: a ocultação aqui é apenas UX. A autorização real permanece no
// backend (requireAuth/requirePermissao). O Dono não recebe destinos de autosserviço
// (`/meu-ponto`, `/meus-servicos`) só porque `podeProprio()` retorna true para ele.

const DONO = {
  groupOrder: ['Visão', 'Gestão', 'Recursos', 'Administração'],
  destinos: [
    {
      to: '/',
      label: 'Painel',
      descricao: 'Visão geral da empresa',
      icon: LayoutDashboard,
      end: true,
      mobile: 'primary',
      group: 'Visão',
      guard: { modulo: 'dashboard' },
    },
    {
      to: '/tecnicos',
      label: 'Equipe',
      descricao: 'Sua equipe e desempenho',
      icon: Users,
      mobile: 'primary',
      group: 'Gestão',
      guard: { modulo: 'tecnicos' },
    },
    {
      to: '/reparticao',
      label: 'Relatórios',
      descricao: 'Faturamento e repartição',
      icon: PieChart,
      mobile: 'primary',
      group: 'Visão',
      guard: { modulo: 'financeiro' },
    },
    {
      to: '/servicos',
      label: 'Serviços',
      descricao: 'Todos os atendimentos',
      icon: ClipboardList,
      mobile: 'more',
      group: 'Gestão',
      guard: { modulo: 'servicos' },
    },
    {
      to: '/aprovacoes',
      label: 'Aprovações',
      descricao: 'Serviços aguardando aval',
      icon: CheckCircle,
      mobile: 'more',
      group: 'Gestão',
      guard: { modulo: 'aprovacoes' },
    },
    {
      to: '/avaliacoes',
      label: 'Avaliações',
      descricao: 'Notas e comentários de clientes',
      icon: Star,
      mobile: 'more',
      group: 'Visão',
      guard: { modulo: 'avaliacoes', feature: 'GOOGLE_REVIEWS' },
    },
    {
      to: '/materiais',
      label: 'Materiais',
      descricao: 'Catálogo de peças e preços',
      icon: Package,
      mobile: 'more',
      group: 'Recursos',
      guard: { modulo: 'estoque' },
    },
    {
      to: '/estoque',
      label: 'Estoque',
      descricao: 'Saldo e movimentações',
      icon: Boxes,
      mobile: 'more',
      group: 'Recursos',
      guard: { modulo: 'estoque' },
    },
    {
      to: '/configuracao/usuarios',
      label: 'Usuários',
      descricao: 'Contas e permissões',
      icon: UserCog,
      mobile: 'more',
      group: 'Administração',
      guard: { modulo: 'usuarios' },
    },
    {
      to: '/configuracao',
      label: 'Configurações',
      descricao: 'Preferências da conta',
      icon: Settings,
      end: true,
      mobile: 'more',
      group: 'Administração',
      guard: { sempre: true },
    },
    {
      to: '/ajuda',
      label: 'Ajuda',
      descricao: 'Dúvidas e suporte',
      icon: HelpCircle,
      mobile: 'more',
      group: 'Administração',
      guard: { sempre: true },
    },
  ],
};

const GESTOR = {
  groupOrder: ['Operação', 'Equipe', 'Recursos', 'Acompanhamento', 'Conta'],
  destinos: [
    {
      to: '/',
      label: 'Operação',
      descricao: 'Indicadores do dia',
      icon: LayoutDashboard,
      end: true,
      mobile: 'primary',
      group: 'Operação',
      guard: { modulo: 'dashboard' },
    },
    {
      to: '/aprovacoes',
      label: 'Aprovações',
      descricao: 'Serviços aguardando aval',
      icon: CheckCircle,
      mobile: 'primary',
      group: 'Operação',
      guard: { modulo: 'aprovacoes' },
    },
    {
      to: '/tecnicos',
      label: 'Equipe',
      descricao: 'Sua equipe e desempenho',
      icon: Users,
      mobile: 'primary',
      group: 'Equipe',
      guard: { modulo: 'tecnicos' },
    },
    {
      to: '/estoque',
      label: 'Estoque',
      descricao: 'Saldo e movimentações',
      icon: Boxes,
      mobile: 'primary',
      group: 'Recursos',
      guard: { modulo: 'estoque' },
    },
    {
      to: '/servicos',
      label: 'Serviços',
      descricao: 'Todos os atendimentos',
      icon: ClipboardList,
      mobile: 'more',
      group: 'Operação',
      guard: { modulo: 'servicos' },
    },
    {
      to: '/materiais',
      label: 'Materiais',
      descricao: 'Catálogo de peças e preços',
      icon: Package,
      mobile: 'more',
      group: 'Recursos',
      guard: { modulo: 'estoque' },
    },
    {
      to: '/reparticao',
      label: 'Relatórios',
      descricao: 'Faturamento e repartição',
      icon: PieChart,
      mobile: 'more',
      group: 'Acompanhamento',
      guard: { modulo: 'financeiro' },
    },
    {
      to: '/avaliacoes',
      label: 'Avaliações',
      descricao: 'Notas e comentários de clientes',
      icon: Star,
      mobile: 'more',
      group: 'Acompanhamento',
      guard: { modulo: 'avaliacoes', feature: 'GOOGLE_REVIEWS' },
    },
    {
      to: '/configuracao',
      label: 'Configurações',
      descricao: 'Preferências da conta',
      icon: Settings,
      end: true,
      mobile: 'more',
      group: 'Conta',
      guard: { sempre: true },
    },
    {
      to: '/ajuda',
      label: 'Ajuda',
      descricao: 'Dúvidas e suporte',
      icon: HelpCircle,
      mobile: 'more',
      group: 'Conta',
      guard: { sempre: true },
    },
  ],
};

const FUNCIONARIO = {
  groupOrder: ['Meu trabalho', 'Conta'],
  destinos: [
    {
      to: '/',
      label: 'Início',
      descricao: 'Seu resumo do dia',
      icon: Home,
      end: true,
      mobile: 'primary',
      group: 'Meu trabalho',
      guard: { sempre: true },
    },
    {
      to: '/meu-ponto',
      label: 'Ponto',
      descricao: 'Entrada e saída do expediente',
      icon: Clock,
      mobile: 'primary',
      group: 'Meu trabalho',
      guard: { proprio: 'bater_ponto' },
    },
    {
      to: '/meus-servicos/novo',
      label: 'Registrar',
      descricao: 'Novo serviço em campo',
      icon: Plus,
      mobile: 'primary',
      group: 'Meu trabalho',
      guard: { proprio: 'registrar_servico' },
    },
    {
      to: '/configuracao/perfil',
      label: 'Perfil',
      descricao: 'Seus dados pessoais',
      icon: User,
      end: true,
      mobile: 'primary',
      group: 'Conta',
      guard: { sempre: true },
    },
    {
      to: '/meus-servicos',
      label: 'Meus serviços',
      descricao: 'Histórico dos seus registros',
      icon: Wrench,
      end: true,
      mobile: 'more',
      group: 'Meu trabalho',
      guard: { proprio: 'registrar_servico' },
    },
    {
      to: '/meus-documentos',
      label: 'Documentos',
      descricao: 'Contrato, RG, CNH e comprovantes',
      icon: FileText,
      end: true,
      mobile: 'more',
      group: 'Conta',
      guard: { proprio: 'documentos' },
    },
    {
      to: '/configuracao/seguranca',
      label: 'Segurança',
      descricao: 'Senha e acesso',
      icon: ShieldCheck,
      mobile: 'more',
      group: 'Conta',
      guard: { sempre: true },
    },
    {
      to: '/configuracao/notificacoes',
      label: 'Notificações',
      descricao: 'Alertas e avisos',
      icon: Bell,
      mobile: 'more',
      group: 'Conta',
      guard: { sempre: true },
    },
    {
      to: '/ajuda',
      label: 'Ajuda',
      descricao: 'Dúvidas e suporte',
      icon: HelpCircle,
      mobile: 'more',
      group: 'Conta',
      guard: { sempre: true },
    },
  ],
};

const POR_PAPEL = { dono: DONO, gestor: GESTOR, funcionario: FUNCIONARIO };

// Limite prático de destinos persistentes no mobile (o 5º slot é sempre "Mais").
export const MAX_PRIMARY = 4;

function permite(guard, ctx) {
  if (!guard || guard.sempre) return true;
  /* `feature` vem ANTES da permissão: capacidade diferida não existe neste release, então nem
     chega a ser questão de quem pode. Ordem invertida deixaria o item aparecer para quem tem a
     permissão de uma feature que não foi lançada. [SCOPE-F3] */
  if (guard.feature && !featureAtiva(guard.feature)) return false;
  if (guard.proprio) return ctx.podeProprio(guard.proprio);
  if (guard.modulo) return ctx.pode(guard.modulo, guard.acao ?? 'ver');
  return true;
}

// Constrói a navegação para o papel/permissões atuais.
// ctx: { papel, pode, podeProprio }
// Retorna { primary, moreGroups, desktopGroups } — todos derivados do mesmo manifesto.
export function buildNavigation(ctx) {
  const manifesto = POR_PAPEL[ctx?.papel] ?? FUNCIONARIO;
  const visiveis = manifesto.destinos.filter((d) => permite(d.guard, ctx));

  const primary = visiveis.filter((d) => d.mobile === 'primary').slice(0, MAX_PRIMARY);
  const primarySet = new Set(primary.map((d) => d.to));
  const overflow = visiveis.filter((d) => !primarySet.has(d.to));

  const grupos = (fonte) =>
    manifesto.groupOrder
      .map((titulo) => ({ titulo, itens: fonte.filter((d) => d.group === titulo) }))
      .filter((g) => g.itens.length > 0);

  return {
    primary,
    moreGroups: grupos(overflow),
    desktopGroups: grupos(visiveis),
  };
}
