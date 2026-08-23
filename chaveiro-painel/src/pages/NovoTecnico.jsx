import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Phone,
  CreditCard,
  Calendar,
  MapPin,
  Briefcase,
  ShieldCheck,
  Image as ImageIcon,
  KeyRound,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import api, { formatarMoeda } from '../lib/api.js';
import { formatarMoedaInput, moedaParaNumero } from '../lib/moeda.js';
import BackHeader from '../components/BackHeader.jsx';
import Wizard from '../components/Wizard.jsx';
import { useToast } from '../components/Toast.jsx';
import { Overlay } from '../components/ui/index.js';

const MODALIDADES = [
  { value: 'clt', label: 'CLT', desc: 'Carteira assinada, jornada padrão' },
  { value: 'clt_meio', label: 'CLT meio período', desc: '6h/dia' },
  { value: 'clt_12x36', label: 'CLT 12x36', desc: 'Plantão 12h trabalha, 36h descansa' },
  { value: 'intermitente', label: 'Intermitente', desc: 'Pagamento por hora trabalhada' },
  { value: 'autonomo', label: 'Autônomo', desc: 'Comissão sobre serviços' },
];

const NIVEIS = [
  { value: 'tecnico', label: 'Técnico' },
  { value: 'gerente', label: 'Gerente' },
  { value: 'admin', label: 'Administrador' },
];

const ehClt = (m) => m === 'clt' || m === 'clt_meio' || m === 'clt_12x36';

function Campo({ label, Icon, children, dica }) {
  /* A label ENVOLVE o controle (associação implícita) em vez de ser irmã dele. Antes, o campo de
     data era o único do formulário sem nome acessível — os demais só "passavam" porque
     placeholder vale como nome, que é o nome mais fraco que existe. Envolver conserta o
     formulário INTEIRO de uma vez, sem espalhar htmlFor/id por dezesseis campos. [SL-01] */
  return (
    <div>
      <label className="block">
        <span className="kpi-label mb-1.5 flex items-center gap-1">
          {Icon && <Icon size={11} />} {label}
        </span>
        {children}
      </label>
      {dica && <p className="text-muted text-xs mt-1">{dica}</p>}
    </div>
  );
}

export default function NovoTecnico() {
  const navigate = useNavigate();
  const toast = useToast();
  const [salvando, setSalvando] = useState(false);
  // Credenciais do funcionário recém-criado (o PIN só aparece uma vez).
  const [acesso, setAcesso] = useState(null);

  const [f, setF] = useState({
    nome: '',
    cpf: '',
    telefone: '',
    dataNascimento: '',
    endereco: '',
    modalidade: 'clt',
    // CLT
    salarioBase: '',
    dataAdmissao: '',
    horaExtraAtiva: false,
    horaExtraPercentual: '',
    adicionalNoturno: false,
    // Autônomo
    comissao: '',
    metaMensal: '',
    // Intermitente
    valorHora: '',
    // Acesso
    telefoneWhatsapp: '',
    nivelAcesso: 'tecnico',
    fotoPerfil: '',
  });

  function set(campo, valor) {
    setF((prev) => ({ ...prev, [campo]: valor }));
  }

  function lerFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast('Imagem muito grande (máx 2MB)', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set('fotoPerfil', reader.result);
    reader.readAsDataURL(file);
  }

  // Habilita "Próximo"/"Concluir" por etapa.
  function podeAvancar(indice) {
    if (indice === 0) return f.nome.trim().length > 0;
    if (indice === 1) return Boolean(f.modalidade);
    return true;
  }

  async function concluir() {
    setSalvando(true);
    try {
      const payload = {
        nome: f.nome.trim(),
        cpf: f.cpf.trim() || undefined,
        telefone: (f.telefoneWhatsapp || f.telefone).replace(/\D/g, '') || undefined,
        dataNascimento: f.dataNascimento || undefined,
        endereco: f.endereco.trim() || undefined,
        nivelAcesso: f.nivelAcesso || undefined,
        modalidade: f.modalidade,
        fotoPerfil: f.fotoPerfil || undefined,
      };

      if (ehClt(f.modalidade)) {
        if (f.salarioBase) payload.salarioBase = moedaParaNumero(f.salarioBase);
        if (f.dataAdmissao) payload.dataAdmissao = new Date(f.dataAdmissao).toISOString();
        payload.horaExtraAtiva = Boolean(f.horaExtraAtiva);
        if (f.horaExtraAtiva && f.horaExtraPercentual)
          payload.horaExtraPercentual = Number(f.horaExtraPercentual);
        payload.adicionalNoturno = Boolean(f.adicionalNoturno);
      } else if (f.modalidade === 'autonomo') {
        payload.comissao = f.comissao === '' ? 0 : Number(f.comissao);
        if (f.metaMensal) payload.metaMensal = moedaParaNumero(f.metaMensal);
      } else if (f.modalidade === 'intermitente') {
        if (f.valorHora) payload.valorHora = moedaParaNumero(f.valorHora);
      }

      const { data } = await api.post('/tecnicos', payload);
      toast('Técnico cadastrado', 'success');
      // Se vier acesso, mostra o cartão de credenciais (PIN aparece uma única vez)
      // e só redireciona quando o usuário fechar. Senão, volta direto à lista.
      if (data?.acesso?.pin) {
        setAcesso(data.acesso);
      } else {
        navigate('/tecnicos');
      }
    } catch (e) {
      toast(e.response?.data?.erro ?? 'Erro ao cadastrar técnico', 'error');
    } finally {
      setSalvando(false);
    }
  }

  function copiarPin() {
    if (!acesso?.pin) return;
    navigator.clipboard
      ?.writeText(acesso.pin)
      .then(() => toast('PIN copiado', 'success'))
      .catch(() => {});
  }

  const modalidadeLabel = MODALIDADES.find((m) => m.value === f.modalidade)?.label ?? f.modalidade;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <BackHeader titulo="Novo técnico" para="/tecnicos" />
      <p className="px-4 -mt-0.5 mb-3 text-muted text-xs">Cadastro guiado em etapas</p>

      <div className="px-4 pb-8 lg:max-w-2xl">
        <Wizard
          etapas={['Dados', 'Vínculo', 'Condições', 'Acesso', 'Confirmação']}
          podeAvancar={podeAvancar}
          onConcluir={concluir}
          concluindo={salvando}
          rotuloConcluir="Cadastrar técnico"
          onCancelar={() => navigate('/tecnicos')}
        >
          {/* Etapa 1 — dados pessoais */}
          <div className="space-y-4">
            <Campo label="Nome *" Icon={User}>
              <input
                className="input w-full"
                value={f.nome}
                onChange={(e) => set('nome', e.target.value)}
                placeholder="Nome completo"
                autoFocus
              />
            </Campo>
            <Campo label="CPF" Icon={CreditCard}>
              <input
                className="input w-full"
                value={f.cpf}
                onChange={(e) => set('cpf', e.target.value)}
                placeholder="000.000.000-00"
                inputMode="numeric"
              />
            </Campo>
            <Campo label="Telefone" Icon={Phone} dica="Número de contato (com DDD).">
              <input
                className="input w-full"
                value={f.telefone}
                onChange={(e) => set('telefone', e.target.value)}
                placeholder="5511912345678"
                inputMode="numeric"
              />
            </Campo>
            <Campo label="Data de nascimento" Icon={Calendar}>
              <input
                type="date"
                className="input w-full"
                value={f.dataNascimento}
                onChange={(e) => set('dataNascimento', e.target.value)}
              />
            </Campo>
            <Campo label="Endereço" Icon={MapPin}>
              <input
                className="input w-full"
                value={f.endereco}
                onChange={(e) => set('endereco', e.target.value)}
                placeholder="Rua, número, bairro"
              />
            </Campo>
          </div>

          {/* Etapa 2 — modalidade */}
          <div className="space-y-2">
            <p className="kpi-label flex items-center gap-1 mb-1">
              <Briefcase size={11} /> Modalidade de vínculo
            </p>
            {MODALIDADES.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => set('modalidade', m.value)}
                className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                  f.modalidade === m.value
                    ? 'border-accent-400 bg-accent-400/10'
                    : 'border-dark-600 bg-dark-700 hover:border-dark-500'
                }`}
              >
                <p
                  className={`text-sm font-semibold ${f.modalidade === m.value ? 'text-accent-300' : 'text-white'}`}
                >
                  {m.label}
                </p>
                <p className="text-muted text-xs mt-0.5">{m.desc}</p>
              </button>
            ))}
          </div>

          {/* Etapa 3 — condicional por modalidade */}
          <div className="space-y-4">
            {ehClt(f.modalidade) && (
              <>
                <Campo label="Salário base (R$)">
                  <input
                    className="input w-full"
                    value={f.salarioBase}
                    onChange={(e) => set('salarioBase', formatarMoedaInput(e.target.value))}
                    placeholder="0,00"
                    inputMode="numeric"
                  />
                </Campo>
                <Campo label="Data de admissão" Icon={Calendar}>
                  <input
                    type="date"
                    className="input w-full"
                    value={f.dataAdmissao}
                    onChange={(e) => set('dataAdmissao', e.target.value)}
                  />
                </Campo>
                <label className="flex items-center justify-between gap-3 py-1">
                  <span className="text-white text-sm">Hora extra ativa</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-accent-400"
                    checked={f.horaExtraAtiva}
                    onChange={(e) => set('horaExtraAtiva', e.target.checked)}
                  />
                </label>
                {f.horaExtraAtiva && (
                  <Campo
                    label="Percentual de hora extra (%)"
                    dica="Ex.: 50 para 50% sobre a hora normal."
                  >
                    <input
                      className="input w-full"
                      value={f.horaExtraPercentual}
                      onChange={(e) =>
                        set(
                          'horaExtraPercentual',
                          e.target.value.replace(/[^\d.,]/g, '').replace(',', '.')
                        )
                      }
                      placeholder="50"
                      inputMode="decimal"
                    />
                  </Campo>
                )}
                <label className="flex items-center justify-between gap-3 py-1">
                  <span className="text-white text-sm">Adicional noturno</span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-accent-400"
                    checked={f.adicionalNoturno}
                    onChange={(e) => set('adicionalNoturno', e.target.checked)}
                  />
                </label>
              </>
            )}

            {f.modalidade === 'autonomo' && (
              <>
                <Campo label="Comissão (%)" dica="Percentual sobre o valor líquido dos serviços.">
                  <input
                    className="input w-full"
                    value={f.comissao}
                    onChange={(e) =>
                      set('comissao', e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))
                    }
                    placeholder="0"
                    inputMode="decimal"
                  />
                </Campo>
                <Campo label="Meta mensal (R$)">
                  <input
                    className="input w-full"
                    type="number"
                    min="0"
                    step="50"
                    value={f.metaMensal}
                    onChange={(e) => set('metaMensal', e.target.value)}
                    placeholder="0"
                    inputMode="decimal"
                  />
                </Campo>
              </>
            )}

            {f.modalidade === 'intermitente' && (
              <Campo label="Valor da hora (R$)">
                <input
                  className="input w-full"
                  value={f.valorHora}
                  onChange={(e) => set('valorHora', formatarMoedaInput(e.target.value))}
                  placeholder="0,00"
                  inputMode="numeric"
                />
              </Campo>
            )}
          </div>

          {/* Etapa 4 — acesso */}
          <div className="space-y-4">
            <Campo
              label="WhatsApp do técnico"
              Icon={Phone}
              dica="É por esse número que o robô reconhece o técnico. Se vazio, usamos o telefone informado."
            >
              <input
                className="input w-full"
                value={f.telefoneWhatsapp}
                onChange={(e) => set('telefoneWhatsapp', e.target.value)}
                placeholder={f.telefone || '5511912345678'}
                inputMode="numeric"
              />
            </Campo>
            <Campo label="Nível de acesso" Icon={ShieldCheck}>
              <select
                className="input w-full"
                value={f.nivelAcesso}
                onChange={(e) => set('nivelAcesso', e.target.value)}
              >
                {NIVEIS.map((n) => (
                  <option key={n.value} value={n.value}>
                    {n.label}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Foto (opcional)" Icon={ImageIcon}>
              <input
                type="file"
                accept="image/*"
                onChange={lerFoto}
                className="text-muted text-xs file:mr-3 file:rounded-md file:border-0 file:bg-dark-700 file:px-3 file:py-1.5 file:text-white file:text-xs"
              />
              {f.fotoPerfil && (
                <img
                  src={f.fotoPerfil}
                  alt="Prévia"
                  className="mt-2 w-16 h-16 rounded-md object-cover border border-dark-600"
                />
              )}
            </Campo>
          </div>

          {/* Etapa 5 — confirmação */}
          <div className="space-y-3">
            <p className="kpi-label">Confira os dados antes de cadastrar</p>
            <div className="card divide-y divide-dark-700">
              <Resumo label="Nome" valor={f.nome} />
              <Resumo label="CPF" valor={f.cpf} />
              <Resumo label="Telefone" valor={f.telefoneWhatsapp || f.telefone} />
              <Resumo label="Nascimento" valor={f.dataNascimento} />
              <Resumo label="Endereço" valor={f.endereco} />
              <Resumo label="Modalidade" valor={modalidadeLabel} />
              {ehClt(f.modalidade) && (
                <>
                  <Resumo label="Salário base" valor={f.salarioBase && `R$ ${f.salarioBase}`} />
                  <Resumo label="Admissão" valor={f.dataAdmissao} />
                  <Resumo
                    label="Hora extra"
                    valor={
                      f.horaExtraAtiva
                        ? `Sim${f.horaExtraPercentual ? ` (${f.horaExtraPercentual}%)` : ''}`
                        : 'Não'
                    }
                  />
                  <Resumo label="Adicional noturno" valor={f.adicionalNoturno ? 'Sim' : 'Não'} />
                </>
              )}
              {f.modalidade === 'autonomo' && (
                <>
                  <Resumo label="Comissão" valor={f.comissao && `${f.comissao}%`} />
                  <Resumo
                    label="Meta mensal"
                    valor={f.metaMensal && formatarMoeda(Number(f.metaMensal))}
                  />
                </>
              )}
              {f.modalidade === 'intermitente' && (
                <Resumo label="Valor/hora" valor={f.valorHora && `R$ ${f.valorHora}`} />
              )}
              <Resumo
                label="Nível de acesso"
                valor={NIVEIS.find((n) => n.value === f.nivelAcesso)?.label}
              />
            </div>
          </div>
        </Wizard>
      </div>

      {/* Modal de credenciais — só quando o funcionário recebe acesso ao painel */}
      {acesso && (
        <Overlay
          open
          onClose={() => {
            setAcesso(null);
            navigate('/tecnicos');
          }}
          ariaLabel="Acesso do funcionário"
          showCloseButton={false}
          closeOnBackdrop={false}
          size="sm"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 rounded-lg bg-accent-400/15 border border-accent-400/30 flex items-center justify-center mb-3">
                <KeyRound size={24} className="text-accent-300" />
              </div>
              <p className="font-display font-bold text-lg text-white">Acesso do funcionário</p>
              <p className="text-muted text-xs mt-1">
                Entregue estas credenciais ao funcionário. Ele troca a senha no primeiro acesso.
              </p>
            </div>

            {/* Telefone (login) */}
            <div>
              <label className="kpi-label block mb-1.5 flex items-center gap-1">
                <Phone size={11} /> Telefone (login)
              </label>
              <div className="input flex items-center font-mono text-sm text-white">
                {acesso.telefone || '—'}
              </div>
            </div>

            {/* PIN em destaque */}
            <div>
              <label className="kpi-label block mb-1.5 flex items-center gap-1">
                <KeyRound size={11} /> PIN provisório
              </label>
              <div className="rounded-lg border border-accent-400/40 bg-accent-400/10 px-4 py-4 flex items-center justify-between gap-3">
                <span className="font-display font-bold text-3xl tracking-[0.2em] text-accent-300 tnum">
                  {acesso.pin}
                </span>
                <button
                  type="button"
                  onClick={copiarPin}
                  className="flex items-center gap-1.5 text-xs text-white bg-dark-700 hover:bg-dark-600 border border-dark-600 rounded-md px-3 py-2 transition-colors shrink-0"
                >
                  <Copy size={14} /> Copiar
                </button>
              </div>
            </div>

            {/* Aviso */}
            <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2.5">
              <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
              <p className="text-warning text-xs leading-relaxed">
                Anote o PIN — ele só aparece uma vez. O funcionário vai trocar a senha no primeiro
                acesso.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setAcesso(null);
                navigate('/tecnicos');
              }}
              className="btn-primary"
            >
              <Check size={16} /> Anotei, concluir
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Resumo({ label, valor }) {
  return (
    <div className="flex items-center justify-between py-2 gap-3">
      <span className="text-muted text-xs">{label}</span>
      <span className="text-white text-sm font-medium text-right truncate">{valor || '—'}</span>
    </div>
  );
}
