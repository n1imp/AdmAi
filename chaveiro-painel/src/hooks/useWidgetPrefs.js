import { useState, useCallback, useEffect } from 'react';

const STORAGE_KEY = 'admai_dashboard_widgets';

// Persistência LOCAL (localStorage) das preferências de ordem/visibilidade dos widgets do
// dashboard do Dono (F4d). Persistência por servidor/dispositivo é decisão funcional própria
// (tarefa de backend separada) — este hook cobre apenas o dispositivo atual.
//
// Valida contra os ids atuais: ignora ids desconhecidos e acrescenta ids novos ao fim, para
// que a adição futura de um widget não fique invisível nem quebre prefs salvas.
function carregar(ids) {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const salvos = Array.isArray(raw.ordem) ? raw.ordem.filter((id) => ids.includes(id)) : [];
    const ordem = [...salvos, ...ids.filter((id) => !salvos.includes(id))];
    const ocultos = Array.isArray(raw.ocultos) ? raw.ocultos.filter((id) => ids.includes(id)) : [];
    return { ordem, ocultos: new Set(ocultos) };
  } catch {
    return { ordem: [...ids], ocultos: new Set() };
  }
}

export function useWidgetPrefs(ids) {
  const [estado, setEstado] = useState(() => carregar(ids));
  const [editando, setEditando] = useState(false);
  const [anuncio, setAnuncio] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ordem: estado.ordem, ocultos: [...estado.ocultos] })
      );
    } catch {
      // localStorage indisponível (ex.: modo privado): mantém apenas em memória.
    }
  }, [estado]);

  const mover = useCallback((id, delta, label) => {
    setEstado((prev) => {
      const i = prev.ordem.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.ordem.length) return prev;
      const ordem = [...prev.ordem];
      [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
      setAnuncio(`${label} movido para a posição ${j + 1} de ${ordem.length}.`);
      return { ...prev, ordem };
    });
  }, []);

  const alternarVisibilidade = useCallback((id, label) => {
    setEstado((prev) => {
      const ocultos = new Set(prev.ocultos);
      if (ocultos.has(id)) {
        ocultos.delete(id);
        setAnuncio(`${label} exibido.`);
      } else {
        ocultos.add(id);
        setAnuncio(`${label} ocultado.`);
      }
      return { ...prev, ocultos };
    });
  }, []);

  return {
    ordem: estado.ordem,
    ocultos: estado.ocultos,
    editando,
    setEditando,
    mover,
    alternarVisibilidade,
    anuncio,
  };
}
