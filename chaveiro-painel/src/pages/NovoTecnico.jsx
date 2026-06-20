import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Phone, CreditCard, Calendar, MapPin, Briefcase, ShieldCheck, Image as ImageIcon } from 'lucide-react';
import api from '../lib/api.js';
import { formatarMoedaInput, moedaParaNumero } from '../lib/moeda.js';
import BackHeader from '../components/BackHeader.jsx';
import Wizard from '../components/Wizard.jsx';
import { useToast } from '../components/Toast.jsx';

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
  return (
    <div>
      <label className="kpi-label block mb-1.5 flex items-center gap-1">
        {Icon && <Icon size={11} />} {label}
      </label>
      {children}
      {dica && <p className="text-muted text-xs mt-1">{dica}</p>}
    </div>
  );
}

export default function NovoTecnico() {
  const navigate = useNavigate();
  const toast = useToast();
  const [salvando, setSalvando] = useState(false);

  const [f, setF] = useState({
    nome: '', cpf: '', telefone: '', dataNascimento: '', endereco: '',
    modalidade: 'clt',
    // CLT
    salarioBase: '', dataAdmissao: '', horaExtraAtiva: false, horaExtraPercentual: '', adicionalNoturno: false,
    // Autônomo
    comissao: '', metaMensal: '',
    // Intermitente
    valorHora: '',
    // Acesso
    telefoneWhatsapp: '', nivelAcesso: 'tecnico', fotoPerfil: '',
  });

  function set(campo, valor) { setF((prev) => ({ ...prev, [campo]: valor })); }

  function lerFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast('Imagem muito grande (máx 2MB)', 'warning'); return; }
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
        if (f.horaExtraAtiva && f.horaExtraPercentual) payload.horaExtraPercentual = Number(f.horaExtraPercentual);
        payload.adicionalNoturno = Boolean(f.adicionalNoturno);
      } else if (f.modalidade === 'autonomo') {
        payload.comissao = f.comissao === '' ? 0 : Number(f.comissao);
        if (f.metaMensal) payload.metaMensal = moedaParaNumero(f.metaMensal);
      } else if (f.modalidade === 'intermitente') {
        if (f.valorHora) payload.valorHora = moedaParaNumero(f.valorHora);
      }

      await api.post('/tecnicos', payload);
      toast('Técnico cadastrado', 'success');
      navigate('/tecnicos');
    } catch (e) {
      toast(e.response?.data?.erro ?? 'Erro ao cadastrar técnico', 'error');
    } finally {
      setSalvando(false);
    }
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
              <input className="input w-full" value={f.nome} onChange={(e) => set('nome', e.target.value)} placeholder="Nome completo" autoFocus />
            </Campo>
            <Campo label="CPF" Icon={CreditCard}>
              <input className="input w-full" value={f.cpf} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" inputMode="numeric" />
            </Campo>
            <Campo label="Telefone" Icon={Phone} dica="Número de contato (com DDD).">
              <input className="input w-full" value={f.telefone} onChange={(e) => set('telefone', e.target.value)} placeholder="5511912345678" inputMode="numeric" />
            </Campo>
            <Campo label="Data de nascimento" Icon={Calendar}>
              <input type="date" className="input w-full" value={f.dataNascimento} onChange={(e) => set('dataNascimento', e.target.value)} />
            </Campo>
            <Campo label="Endereço" Icon={MapPin}>
              <input className="input w-full" value={f.endereco} onChange={(e) => set('endereco', e.target.value)} placeholder="Rua, número, bairro" />
            </Campo>
          </div>

          {/* Etapa 2 — modalidade */}
          <div className="space-y-2">
            <p className="kpi-label flex items-center gap-1 mb-1"><Briefcase size={11} /> Modalidade de vínculo</p>
            {MODALIDADES.map((m) => (
              <button key={m.value} type="button" onClick={() => set('modalidade', m.value)}
                className={`w-full text-left rounded-lg border px-4 py-3 transition-colors ${
                  f.modalidade === m.value ? 'border-accent-400 bg-accent-400/10' : 'border-dark-600 bg-dark-700 hover:border-dark-500'
                }`}>
                <p className={`text-sm font-semibold ${f.modalidade === m.value ? 'text-accent-300' : 'text-white'}`}>{m.label}</p>
                <p className="text-muted text-xs mt-0.5">{m.desc}</p>
              </button>
            ))}
          </div>

          {/* Etapa 3 — condicional por modalidade */}
          <div className="space-y-4">
            {ehClt(f.modalidade) && (
              <>
                <Campo label="Salário base (R$)">
                  <input className="input w-full" value={f.salarioBase}
                    onChange={(e) => set('salarioBase', formatarMoedaInput(e.target.value))}
                    placeholder="0,00" inputMode="numeric" />
                </Campo>
                <Campo label="Data de admissão" Icon={Calendar}>
                  <input type="date" className="input w-full" value={f.dataAdmissao} onChange={(e) => set('dataAdmissao', e.target.value)} />
                </Campo>
                <label className="flex items-center justify-between gap-3 py-1">
                  <span className="text-white text-sm">Hora extra ativa</span>
                  <input type="checkbox" className="w-4 h-4 accent-accent-400" checked={f.horaExtraAtiva} onChange={(e) => set('horaExtraAtiva', e.target.checked)} />
                </label>
                {f.horaExtraAtiva && (
                  <Campo label="Percentual de hora extra (%)" dica="Ex.: 50 para 50% sobre a hora normal.">
                    <input className="input w-full" value={f.horaExtraPercentual}
                      onChange={(e) => set('horaExtraPercentual', e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
                      placeholder="50" inputMode="decimal" />
                  </Campo>
                )}
                <label className="flex items-center justify-between gap-3 py-1">
                  <span className="text-white text-sm">Adicional noturno</span>
                  <input type="checkbox" className="w-4 h-4 accent-accent-400" checked={f.adicionalNoturno} onChange={(e) => set('adicionalNoturno', e.target.checked)} />
                </label>
              </>
            )}

            {f.modalidade === 'autonomo' && (
              <>
                <Campo label="Comissão (%)" dica="Percentual sobre o valor líquido dos serviços.">
                  <input className="input w-full" value={f.comissao}
                    onChange={(e) => set('comissao', e.target.value.replace(/[^\d.,]/g, '').replace(',', '.'))}
                    placeholder="0" inputMode="decimal" />
                </Campo>
                <Campo label="Meta mensal (R$)">
                  <input className="input w-full" value={f.metaMensal}
                    onChange={(e) => set('metaMensal', formatarMoedaInput(e.target.value))}
                    placeholder="0,00" inputMode="numeric" />
                </Campo>
              </>
            )}

            {f.modalidade === 'intermitente' && (
              <Campo label="Valor da hora (R$)">
                <input className="input w-full" value={f.valorHora}
                  onChange={(e) => set('valorHora', formatarMoedaInput(e.target.value))}
                  placeholder="0,00" inputMode="numeric" />
              </Campo>
            )}
          </div>

          {/* Etapa 4 — acesso */}
          <div className="space-y-4">
            <Campo label="WhatsApp do técnico" Icon={Phone} dica="É por esse número que o robô reconhece o técnico. Se vazio, usamos o telefone informado.">
              <input className="input w-full" value={f.telefoneWhatsapp} onChange={(e) => set('telefoneWhatsapp', e.target.value)} placeholder={f.telefone || '5511912345678'} inputMode="numeric" />
            </Campo>
            <Campo label="Nível de acesso" Icon={ShieldCheck}>
              <select className="input w-full" value={f.nivelAcesso} onChange={(e) => set('nivelAcesso', e.target.value)}>
                {NIVEIS.map((n) => <option key={n.value} value={n.value}>{n.label}</option>)}
              </select>
            </Campo>
            <Campo label="Foto (opcional)" Icon={ImageIcon}>
              <input type="file" accept="image/*" onChange={lerFoto} className="text-muted text-xs file:mr-3 file:rounded-md file:border-0 file:bg-dark-700 file:px-3 file:py-1.5 file:text-white file:text-xs" />
              {f.fotoPerfil && <img src={f.fotoPerfil} alt="Prévia" className="mt-2 w-16 h-16 rounded-md object-cover border border-dark-600" />}
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
              {ehClt(f.modalidade) && <>
                <Resumo label="Salário base" valor={f.salarioBase && `R$ ${f.salarioBase}`} />
                <Resumo label="Admissão" valor={f.dataAdmissao} />
                <Resumo label="Hora extra" valor={f.horaExtraAtiva ? `Sim${f.horaExtraPercentual ? ` (${f.horaExtraPercentual}%)` : ''}` : 'Não'} />
                <Resumo label="Adicional noturno" valor={f.adicionalNoturno ? 'Sim' : 'Não'} />
              </>}
              {f.modalidade === 'autonomo' && <>
                <Resumo label="Comissão" valor={f.comissao && `${f.comissao}%`} />
                <Resumo label="Meta mensal" valor={f.metaMensal && `R$ ${f.metaMensal}`} />
              </>}
              {f.modalidade === 'intermitente' && <Resumo label="Valor/hora" valor={f.valorHora && `R$ ${f.valorHora}`} />}
              <Resumo label="Nível de acesso" valor={NIVEIS.find((n) => n.value === f.nivelAcesso)?.label} />
            </div>
          </div>
        </Wizard>
      </div>
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
