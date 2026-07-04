import { useState } from 'react';
import {
  MessageCircle, QrCode, FileText, Users, Bell, ChevronDown, Headphones, Mail,
} from 'lucide-react';
import BackHeader from '../components/BackHeader.jsx';

function abrirCrisp() {
  if (typeof window !== 'undefined' && window.$crisp) {
    window.$crisp.push(['do', 'chat:open']);
  } else {
    window.location.href = 'mailto:suporte@barbers-flow.com';
  }
}

// Conteúdo do tutorial — cada seção é um passo-a-passo conciso e fiel ao app.
const SECOES = [
  {
    id: 'whatsapp-servico',
    titulo: 'Registrar um serviço pelo WhatsApp',
    icon: MessageCircle,
    cor: 'text-success',
    bg: 'bg-success/10',
    resumo: 'O técnico envia uma mensagem padronizada no grupo e o bot salva sozinho.',
    conteudo: (
      <>
        <p>
          O técnico envia a mensagem padronizada no grupo do WhatsApp. O bot lê,
          extrai os dados e registra o serviço automaticamente no painel.
        </p>
        <p className="mt-3 mb-1.5 font-semibold text-white">Campos do modelo:</p>
        <ul className="flex flex-col gap-1.5">
          <li className="flex gap-2"><span className="text-accent-300">Local:</span> onde o serviço foi feito</li>
          <li className="flex gap-2"><span className="text-accent-300">Serviço:</span> o que foi realizado</li>
          <li className="flex gap-2"><span className="text-accent-300">Material:</span> peça/insumo usado (ou "Nenhum")</li>
          <li className="flex gap-2"><span className="text-accent-300">Valor cobrado:</span> o valor recebido do cliente</li>
        </ul>
        <p className="mt-3 text-muted">
          Quanto mais fiel ao modelo, melhor a leitura automática. Você também pode
          cadastrar manualmente em <span className="text-accent-300">Serviços → Novo</span>.
        </p>
      </>
    ),
  },
  {
    id: 'conectar-whatsapp',
    titulo: 'Conectar o WhatsApp',
    icon: QrCode,
    cor: 'text-accent-300',
    bg: 'bg-accent-400/10',
    resumo: 'Escaneie o QR Code uma vez e escolha o grupo de resumos.',
    conteudo: (
      <ol className="flex flex-col gap-2 list-decimal list-inside marker:text-accent-300 marker:font-bold">
        <li>Vá em <span className="text-accent-300">Mais → Configurações → WhatsApp</span>.</li>
        <li>Clique em <span className="text-accent-300">Conectar</span>.</li>
        <li>Escaneie o QR Code com o celular que usa o WhatsApp do negócio.</li>
        <li>Escolha o grupo que receberá os resumos.</li>
      </ol>
    ),
  },
  {
    id: 'reparticao',
    titulo: 'Fechar o período (Repartição)',
    icon: FileText,
    cor: 'text-sky-300',
    bg: 'bg-sky-400/10',
    resumo: 'Calcule a divisão por técnico e exporte o relatório em PDF.',
    conteudo: (
      <ol className="flex flex-col gap-2 list-decimal list-inside marker:text-accent-300 marker:font-bold">
        <li>Vá em <span className="text-accent-300">Mais → Repartição</span>.</li>
        <li>Escolha o período (datas de início e fim) e clique em <span className="text-accent-300">Calcular</span>.</li>
        <li>Confira o consolidado e a divisão por técnico.</li>
        <li>Clique em <span className="text-accent-300">Exportar PDF</span> para baixar o relatório.</li>
      </ol>
    ),
  },
  {
    id: 'tecnicos-materiais',
    titulo: 'Técnicos e Materiais',
    icon: Users,
    cor: 'text-indigo-300',
    bg: 'bg-indigo-400/10',
    resumo: 'Cadastre técnicos, defina comissão e metas; controle o estoque.',
    conteudo: (
      <>
        <p className="mb-1.5 font-semibold text-white">Técnicos</p>
        <p>
          Cadastre cada técnico e defina o <span className="text-accent-300">percentual de comissão</span> e a
          <span className="text-accent-300"> meta mensal</span> de receita líquida. O perfil mostra o
          desempenho, o saldo pendente e o histórico de pagamentos.
        </p>
        <p className="mt-3 mb-1.5 font-semibold text-white">Materiais</p>
        <p>
          Cadastre os materiais e acompanhe o <span className="text-accent-300">estoque</span>. Defina o
          mínimo para receber alertas quando a quantidade ficar baixa.
        </p>
      </>
    ),
  },
  {
    id: 'notificacoes',
    titulo: 'Notificações',
    icon: Bell,
    cor: 'text-warning',
    bg: 'bg-warning/10',
    resumo: 'Alertas de estoque baixo e o resumo semanal do desempenho.',
    conteudo: (
      <>
        <p>
          O painel avisa quando algo precisa da sua atenção. Os principais avisos são:
        </p>
        <ul className="mt-2 flex flex-col gap-1.5">
          <li className="flex gap-2"><span className="text-accent-300">Estoque baixo:</span> quando um material atinge o mínimo.</li>
          <li className="flex gap-2"><span className="text-accent-300">Resumo semanal:</span> balanço do desempenho da semana.</li>
        </ul>
        <p className="mt-3 text-muted">
          Em <span className="text-accent-300">Notificações → Preferências</span> você escolhe quais avisos quer receber.
        </p>
      </>
    ),
  },
];

function Acordeao({ secao, aberto, onToggle }) {
  const { titulo, icon: Icon, cor, bg, resumo, conteudo } = secao;
  return (
    <div className="card p-0 overflow-hidden">
      <button
        onClick={onToggle}
        aria-expanded={aberto}
        className="w-full flex items-center gap-3 text-left p-4"
      >
        <div className={`w-10 h-10 rounded-md border border-dark-600 flex items-center justify-center shrink-0 ${bg}`}>
          <Icon size={19} className={cor} strokeWidth={1.8} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white text-sm">{titulo}</p>
          {!aberto && <p className="text-muted text-xs mt-0.5 leading-snug">{resumo}</p>}
        </div>
        <ChevronDown
          size={18}
          className={`text-muted shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`}
        />
      </button>
      {aberto && (
        <div className="px-4 pb-4 pt-0 text-sm text-muted leading-relaxed animate-fade-in">
          <div className="pt-1 border-t border-dark-700 mt-1">
            <div className="pt-3">{conteudo}</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Ajuda() {
  // Primeira seção aberta por padrão para orientar o usuário.
  const [aberto, setAberto] = useState(SECOES[0].id);

  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Como usar" para="/mais" />

      <div className="flex-1 overflow-y-auto px-4 pt-2 pb-8 lg:max-w-2xl">
        <p className="text-muted text-sm mb-4">
          Guia rápido do AdmAi. Toque em uma seção para ver o passo a passo.
        </p>

        <div className="flex flex-col gap-3">
          {SECOES.map((secao) => (
            <Acordeao
              key={secao.id}
              secao={secao}
              aberto={aberto === secao.id}
              onToggle={() => setAberto((atual) => (atual === secao.id ? null : secao.id))}
            />
          ))}
        </div>

        {/* Suporte direto */}
        <div className="mt-6 card p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-md bg-accent-400/10 border border-dark-600 flex items-center justify-center shrink-0">
            <Headphones size={19} className="text-accent-300" strokeWidth={1.8} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">Precisa de ajuda?</p>
            <p className="text-xs text-muted mt-0.5">Fale com nossa equipe de suporte.</p>
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            <button
              type="button"
              onClick={abrirCrisp}
              className="btn-primary text-xs py-1.5 px-3 gap-1.5"
            >
              <Headphones size={13} /> Chat
            </button>
            <a
              href="mailto:suporte@barbers-flow.com"
              className="btn-secondary text-xs py-1.5 px-3 gap-1.5 flex items-center justify-center"
            >
              <Mail size={13} /> E-mail
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
