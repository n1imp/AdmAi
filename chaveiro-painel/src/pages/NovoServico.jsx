import { useNavigate } from 'react-router-dom';
import BackHeader from '../components/BackHeader.jsx';
import ServicoForm from '../features/servicos/ServicoForm.jsx';

/** Novo serviço (D/G) — casca fina: o form single-page por seções vive na feature
 *  (DECISOR 01a04bfb §iii; o wizard de 4 etapas foi removido). */
export default function NovoServico() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col h-full">
      <BackHeader titulo="Novo serviço" para="/servicos" />
      <div
        className="adm-shell flex-1 overflow-y-auto px-4 pb-6 lg:max-w-2xl"
        style={{ background: 'var(--adm-canvas)' }}
      >
        <div style={{ paddingTop: 'var(--adm-s4)' }}>
          <ServicoForm variante="gestao" onSucesso={() => navigate('/servicos')} />
        </div>
      </div>
    </div>
  );
}
