import { useNavigate } from 'react-router-dom';
import BackHeader from '../components/BackHeader.jsx';
import ServicoForm from '../features/servicos/ServicoForm.jsx';

/** Registro de serviço em campo (funcionário) — casca fina do form por seções: sem campo de
 *  técnico (deriva da sessão); catálogo condicionado ao regime da empresa (DECISOR §iii). */
export default function NovoServicoFuncionario() {
  const navigate = useNavigate();
  return (
    <div className="adm-shell flex flex-col h-full">
      <BackHeader titulo="Registrar serviço" para="/meus-servicos" />
      <div
        className="flex-1 overflow-y-auto px-4 pb-6 lg:max-w-2xl"
        style={{ background: 'var(--adm-canvas)' }}
      >
        <div style={{ paddingTop: 'var(--adm-s4)' }}>
          <ServicoForm variante="campo" onSucesso={() => navigate('/meus-servicos')} />
        </div>
      </div>
    </div>
  );
}
