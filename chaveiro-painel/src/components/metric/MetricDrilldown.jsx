/**
 * Registros por trás do número.
 *
 * A PROPRIEDADE QUE DÁ SENTIDO A ESTE COMPONENTE
 *   O total exibido aqui é o MESMO que o herói exibe. Se divergirem, ou o total mente ou a lista
 *   mente, e o usuário não tem como saber qual — pior do que qualquer um dos dois erros isolado.
 *   Por isso o total vem do backend junto com os registros, e a UI não recalcula
 *   `registros.length`: com paginação, esse comprimento é o tamanho da página, não do conjunto.
 *
 * COLUNAS VÊM DO PAYLOAD, NÃO DE UMA LISTA FIXA
 *   A página declara as colunas que a métrica sabe exibir; a coluna só é renderizada se o campo
 *   CHEGOU. Campo redigido pelo backend não existe no dado, então a coluna some sozinha — não há
 *   caminho para "renderizar vazio", que o usuário leria como zero.
 *
 *   `camposOmitidos` chega junto e vira uma frase explícita: a diferença entre "não há valor" e
 *   "você não pode ver o valor" importa, e só a segunda tem solução (pedir acesso).
 */

import { Lock } from 'lucide-react';
import FeedbackState from '../ui/FeedbackState.jsx';

export default function MetricDrilldown({ dados, colunas, carregando, erro, autorizado }) {
  if (!autorizado) {
    return (
      <FeedbackState
        compact
        announce
        state="permission-denied"
        title="Sem acesso aos registros"
        description="Você vê o total, mas não os registros que o compõem. São permissões diferentes."
      />
    );
  }
  if (carregando) {
    return (
      <FeedbackState
        compact
        announce
        state="loading"
        title="Carregando registros"
        description="Buscando a lista."
      />
    );
  }
  if (erro) {
    return (
      <FeedbackState compact announce state="error" title="Não foi possível listar os registros" />
    );
  }
  if (!dados) return null;
  if (dados.total === 0) {
    return <FeedbackState compact state="empty" title="Nenhum registro no período" />;
  }

  const primeiro = dados.registros[0] ?? {};
  const visiveis = colunas.filter((c) => c.campo in primeiro);
  const omitidos = dados.camposOmitidos ?? [];
  const rotuloOmitido = colunas.filter((c) => omitidos.includes(c.campo)).map((c) => c.rotulo);

  const { offset = 0, nestaPagina } = dados.paginacao ?? {};
  const paginado = nestaPagina != null && nestaPagina < dados.total;

  return (
    <div>
      <p className="text-sm text-muted mb-2">
        <strong className="text-slate-200 tnum">{dados.total}</strong> registros formam este número
        {paginado && (
          <span>
            {' '}
            · exibindo {offset + 1}–{offset + nestaPagina}
          </span>
        )}
      </p>

      {rotuloOmitido.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted mb-2">
          <Lock size={12} aria-hidden="true" />
          {rotuloOmitido.length === 1
            ? `Coluna "${rotuloOmitido[0]}" omitida: exige permissão que seu perfil não tem.`
            : `Colunas ${rotuloOmitido.map((r) => `"${r}"`).join(', ')} omitidas: exigem permissão que seu perfil não tem.`}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Registros que compõem o total do período</caption>
          <thead>
            <tr className="text-left text-xs text-muted">
              {visiveis.map((c) => (
                <th
                  key={c.campo}
                  scope="col"
                  className={`py-1.5 ${c.alinharDireita ? 'text-right' : ''}`}
                >
                  {c.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados.registros.map((r) => (
              <tr key={r.id} className="border-t border-dark-600">
                {visiveis.map((c) => (
                  <td
                    key={c.campo}
                    className={`py-1.5 ${c.alinharDireita ? 'text-right tnum' : ''}`}
                  >
                    {c.formatar ? c.formatar(r[c.campo]) : r[c.campo]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
