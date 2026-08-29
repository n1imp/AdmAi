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
  HistoryIcon,
  FileText,
} from 'lucide-react';
import { capabilityAtiva } from '../lib/capabilities.js';

/**
 * Navegação derivada (DDR-1, DECISOR 01a04abb) — pipeline único:
 *
 *   capability habilitada (registry) → papel → permissão efetiva → projeção
 *
 * MANIFESTO ÚNICO de destinos: cada destino existe UMA vez (to/icon/guard/capability) e
 * declara em `porPapel` como cada papel o vê — grupo canônico, rótulo, prioridade mobile.
 * Presença do papel = ter a chave. Isso substitui os três catálogos duplicados
 * (DONO/GESTOR/FUNCIONARIO) que o DECISOR rejeitou, preservando prioridades por papel.
 *
 * Grupos canônicos (DDR-1):
 *   Dono        → Negócio · Operação · Equipe · Materiais e estoque · Administração · Conta e suporte
 *   Gestor      → Operação · Equipe · Materiais e estoque · Conta e suporte
 *   Funcionário → Meu trabalho · Minha conta e suporte
 *
 * Bottom-nav (4 + "Mais"): Dono Painel/Financeiro/Aprovações/Equipe · Gestor Hoje/Serviços/
 * Aprovações/Equipe (corrige Serviços escondido em "Mais") · Funcionário Hoje/Ponto/
 * Registrar/Serviços (corrige Perfil ocupando slot primário — vai para "Mais").
 *
 * `capability` liga o destino ao registry: capability desligada (lifecycle/flag, regra única
 * §26) REMOVE o destino ANTES de qualquer guard — capacidade diferida não é questão de quem
 * pode: ela não está no ar. Isso substitui os antigos `guard.feature` manuais.
 *
 * Divergências documentadas da tabela DDR-1 (preservação de exposição atual; ajuste fica
 * para as slices de superfície): /reparticao segue visível ao Gestor com permissão
 * `financeiro` (a tabela omitia); Perfil/Segurança do Dono seguem no hub Configurações até
 * FR-19. Segurança: ocultação aqui é UX — autorização real permanece no backend.
 */

const DESTINOS = [
  {
    to: '/',
    icon: LayoutDashboard,
    end: true,
    guard: { modulo: 'dashboard' },
    porPapel: {
      dono: {
        label: 'Painel',
        descricao: 'Visão geral da empresa',
        group: 'Negócio',
        mobile: 'primary',
        ordem: 1,
      },
      gestor: {
        label: 'Hoje',
        descricao: 'Indicadores do dia',
        group: 'Operação',
        mobile: 'primary',
        ordem: 1,
      },
      funcionario: {
        label: 'Hoje',
        descricao: 'Seu resumo do dia',
        group: 'Meu trabalho',
        mobile: 'primary',
        ordem: 1,
        icon: Home,
        guard: { sempre: true },
      },
    },
  },
  {
    to: '/reparticao',
    icon: PieChart,
    guard: { modulo: 'financeiro' },
    porPapel: {
      dono: {
        label: 'Financeiro',
        descricao: 'Faturamento e repartição',
        group: 'Negócio',
        mobile: 'primary',
        ordem: 2,
      },
      gestor: {
        label: 'Relatórios',
        descricao: 'Faturamento e repartição',
        group: 'Operação',
        mobile: 'more',
      },
    },
  },
  {
    to: '/servicos',
    icon: ClipboardList,
    guard: { modulo: 'servicos' },
    porPapel: {
      dono: {
        label: 'Serviços',
        descricao: 'Todos os atendimentos',
        group: 'Operação',
        mobile: 'more',
      },
      gestor: {
        label: 'Serviços',
        descricao: 'Todos os atendimentos',
        group: 'Operação',
        mobile: 'primary',
        ordem: 2,
      },
    },
  },
  {
    to: '/aprovacoes',
    icon: CheckCircle,
    guard: { modulo: 'aprovacoes' },
    porPapel: {
      dono: {
        label: 'Aprovações',
        descricao: 'Serviços aguardando aval',
        group: 'Operação',
        mobile: 'primary',
        ordem: 3,
      },
      gestor: {
        label: 'Aprovações',
        descricao: 'Serviços aguardando aval',
        group: 'Operação',
        mobile: 'primary',
        ordem: 3,
      },
    },
  },
  {
    to: '/tecnicos',
    icon: Users,
    guard: { modulo: 'tecnicos' },
    porPapel: {
      dono: {
        label: 'Equipe',
        descricao: 'Sua equipe e desempenho',
        group: 'Equipe',
        mobile: 'primary',
        ordem: 4,
      },
      gestor: {
        label: 'Equipe',
        descricao: 'Sua equipe e desempenho',
        group: 'Equipe',
        mobile: 'primary',
        ordem: 4,
      },
    },
  },
  {
    to: '/materiais',
    icon: Package,
    guard: { modulo: 'estoque' },
    porPapel: {
      dono: {
        label: 'Materiais',
        descricao: 'Catálogo de peças e preços',
        group: 'Materiais e estoque',
        mobile: 'more',
      },
      gestor: {
        label: 'Materiais',
        descricao: 'Catálogo de peças e preços',
        group: 'Materiais e estoque',
        mobile: 'more',
      },
    },
  },
  {
    to: '/estoque',
    icon: Boxes,
    guard: { modulo: 'estoque' },
    porPapel: {
      dono: {
        label: 'Estoque',
        descricao: 'Saldo e movimentações',
        group: 'Materiais e estoque',
        mobile: 'more',
      },
      gestor: {
        label: 'Estoque',
        descricao: 'Saldo e movimentações',
        group: 'Materiais e estoque',
        mobile: 'more',
      },
    },
  },
  {
    to: '/avaliacoes',
    icon: Star,
    capability: 'GOOGLE_REVIEWS',
    guard: { modulo: 'avaliacoes' },
    porPapel: {
      dono: {
        label: 'Avaliações',
        descricao: 'Notas e comentários de clientes',
        group: 'Negócio',
        mobile: 'more',
      },
      gestor: {
        label: 'Avaliações',
        descricao: 'Notas e comentários de clientes',
        group: 'Operação',
        mobile: 'more',
      },
    },
  },
  {
    to: '/configuracao/usuarios',
    icon: UserCog,
    guard: { modulo: 'usuarios' },
    porPapel: {
      dono: {
        label: 'Usuários',
        descricao: 'Contas e permissões',
        group: 'Administração',
        mobile: 'more',
      },
    },
  },
  {
    to: '/configuracao/auditoria',
    icon: HistoryIcon,
    /* adminOnly no backend; `admin` entra no ctx junto do shell novo (fail-closed até lá). */
    guard: { admin: true },
    porPapel: {
      dono: {
        label: 'Auditoria',
        descricao: 'Quem fez o quê e quando',
        group: 'Administração',
        mobile: 'more',
      },
    },
  },
  {
    to: '/configuracao',
    icon: Settings,
    end: true,
    guard: { sempre: true },
    porPapel: {
      dono: {
        label: 'Configurações',
        descricao: 'Preferências da conta',
        group: 'Administração',
        mobile: 'more',
      },
      gestor: {
        label: 'Configurações',
        descricao: 'Preferências da conta',
        group: 'Conta e suporte',
        mobile: 'more',
      },
    },
  },
  {
    to: '/meu-ponto',
    icon: Clock,
    guard: { proprio: 'bater_ponto' },
    porPapel: {
      funcionario: {
        label: 'Ponto',
        descricao: 'Entrada e saída do expediente',
        group: 'Meu trabalho',
        mobile: 'primary',
        ordem: 2,
      },
    },
  },
  {
    to: '/meus-servicos/novo',
    icon: Plus,
    guard: { proprio: 'registrar_servico' },
    porPapel: {
      funcionario: {
        label: 'Registrar',
        descricao: 'Novo serviço em campo',
        group: 'Meu trabalho',
        mobile: 'primary',
        ordem: 3,
      },
    },
  },
  {
    to: '/meus-servicos',
    icon: Wrench,
    end: true,
    guard: { proprio: 'registrar_servico' },
    porPapel: {
      funcionario: {
        label: 'Serviços',
        descricao: 'Histórico dos seus registros',
        group: 'Meu trabalho',
        mobile: 'primary',
        ordem: 4,
      },
    },
  },
  {
    to: '/configuracao/perfil',
    icon: User,
    end: true,
    guard: { sempre: true },
    porPapel: {
      funcionario: {
        label: 'Perfil',
        descricao: 'Seus dados pessoais',
        group: 'Minha conta e suporte',
        mobile: 'more',
      },
    },
  },
  {
    to: '/meus-documentos',
    icon: FileText,
    end: true,
    guard: { proprio: 'documentos' },
    porPapel: {
      funcionario: {
        label: 'Documentos',
        descricao: 'Contrato, RG, CNH e comprovantes',
        group: 'Minha conta e suporte',
        mobile: 'more',
      },
    },
  },
  {
    to: '/configuracao/seguranca',
    icon: ShieldCheck,
    guard: { sempre: true },
    porPapel: {
      funcionario: {
        label: 'Segurança',
        descricao: 'Senha e acesso',
        group: 'Minha conta e suporte',
        mobile: 'more',
      },
    },
  },
  {
    to: '/configuracao/notificacoes',
    icon: Bell,
    capability: 'NOTIFICACOES',
    guard: { sempre: true },
    porPapel: {
      funcionario: {
        label: 'Notificações',
        descricao: 'Alertas e avisos',
        group: 'Minha conta e suporte',
        mobile: 'more',
      },
    },
  },
  {
    to: '/ajuda',
    icon: HelpCircle,
    guard: { sempre: true },
    porPapel: {
      dono: {
        label: 'Ajuda',
        descricao: 'Dúvidas e suporte',
        group: 'Conta e suporte',
        mobile: 'more',
      },
      gestor: {
        label: 'Ajuda',
        descricao: 'Dúvidas e suporte',
        group: 'Conta e suporte',
        mobile: 'more',
      },
      funcionario: {
        label: 'Ajuda',
        descricao: 'Dúvidas e suporte',
        group: 'Minha conta e suporte',
        mobile: 'more',
      },
    },
  },
];

const GROUP_ORDER = {
  dono: [
    'Negócio',
    'Operação',
    'Equipe',
    'Materiais e estoque',
    'Administração',
    'Conta e suporte',
  ],
  gestor: ['Operação', 'Equipe', 'Materiais e estoque', 'Conta e suporte'],
  funcionario: ['Meu trabalho', 'Minha conta e suporte'],
};

// Limite de destinos persistentes no mobile (o 5º slot é sempre "Mais").
export const MAX_PRIMARY = 4;

function permite(guard, ctx) {
  if (!guard) return true;
  if (guard.sempre) return true;
  if (guard.admin) return ctx.admin === true; // fail-closed: sem ctx.admin, some
  if (guard.proprio) return ctx.podeProprio(guard.proprio);
  if (guard.modulo) return ctx.pode(guard.modulo, guard.acao ?? 'ver');
  return true;
}

// Constrói a navegação para o papel/permissões atuais.
// ctx: { papel, pode, podeProprio, admin? }
// Retorna { primary, moreGroups, desktopGroups } — todos derivados do mesmo manifesto.
export function buildNavigation(ctx) {
  const papel = ctx?.papel in GROUP_ORDER ? ctx.papel : 'funcionario';

  const visiveis = [];
  for (const destino of DESTINOS) {
    const alocacao = destino.porPapel[papel];
    if (!alocacao) continue;
    /* Capability PRIMEIRO — antes de `sempre` e antes da permissão (invariante herdado do
       GAP-UX-NAV-DIFERIDA-01): capacidade fora do ar não é questão de quem pode. */
    if (destino.capability && !capabilityAtiva(destino.capability)) continue;
    if (!permite(alocacao.guard ?? destino.guard, ctx)) continue;
    visiveis.push({
      to: destino.to,
      end: destino.end,
      icon: alocacao.icon ?? destino.icon,
      label: alocacao.label,
      descricao: alocacao.descricao,
      group: alocacao.group,
      mobile: alocacao.mobile,
      ordem: alocacao.ordem ?? 99,
    });
  }

  const primary = visiveis
    .filter((d) => d.mobile === 'primary')
    .sort((a, b) => a.ordem - b.ordem)
    .slice(0, MAX_PRIMARY);
  const primarySet = new Set(primary.map((d) => d.to));
  const overflow = visiveis.filter((d) => !primarySet.has(d.to));

  const grupos = (fonte) =>
    GROUP_ORDER[papel]
      .map((titulo) => ({ titulo, itens: fonte.filter((d) => d.group === titulo) }))
      .filter((g) => g.itens.length > 0);

  return {
    primary,
    moreGroups: grupos(overflow),
    desktopGroups: grupos(visiveis),
  };
}
