import { useState, useCallback, useEffect, useRef } from 'react';
import api from '../lib/api.js';

const STORAGE_KEY = 'admai_dashboard_widgets';

// Persistência das preferências de ordem/visibilidade dos widgets do dashboard do Dono (F4d).
// Camadas: localStorage (cache offline, paint rápido, funciona sem backend) + sync server-side
// cross-device (F9/M5): no load busca as prefs do usuário e, ao alterar, grava via API.
// Tudo best-effort — 404 (backend sem M5) / offline degradam para o localStorage sem quebrar.
//
// Reconcilia contra os ids atuais: ignora ids desconhecidos e acrescenta ids novos ao fim, para
// que a adição futura de um widget não fique invisível nem quebre prefs salvas.
function reconciliar(raw, ids) {
  const salvos = Array.isArray(raw?.ordem) ? raw.ordem.filter((id) => ids.includes(id)) : [];
  const ordem = [...salvos, ...ids.filter((id) => !salvos.includes(id))];
  const ocultos = Array.isArray(raw?.ocultos) ? raw.ocultos.filter((id) => ids.includes(id)) : [];
  return { ordem, ocultos: new Set(ocultos) };
}

function carregar(ids) {
  try {
    return reconciliar(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'), ids);
  } catch {
    return { ordem: [...ids], ocultos: new Set() };
  }
}

export function useWidgetPrefs(ids) {
  const [estado, setEstado] = useState(() => carregar(ids));
  const [editando, setEditando] = useState(false);
  const [anuncio, setAnuncio] = useState('');
  // Só grava no servidor quando a mudança veio de uma AÇÃO do usuário (não do load inicial
  // nem da reconciliação com o que o servidor devolveu) — evita PUT redundante em loop.
  const origemUsuario = useRef(false);

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ ordem: estado.ordem, ocultos: [...estado.ocultos] })
      );
    } catch {
      // localStorage indisponível (ex.: modo privado): mantém apenas em memória.
    }
    if (origemUsuario.current) {
      origemUsuario.current = false;
      // M5: sincroniza cross-device (best-effort). Envolto em Promise.resolve para nunca
      // lançar de forma síncrona (ex.: api.put ausente num mock) — degrada em silêncio.
      Promise.resolve()
        .then(() =>
          api.put('/me/preferencias/dashboard', {
            ordem: estado.ordem,
            ocultos: [...estado.ocultos],
          })
        )
        .catch(() => {});
    }
  }, [estado]);

  // M5: no load, busca as prefs do usuário no servidor; se existirem, reconcilia sobre elas.
  // Sem backend (404) / offline, mantém o que veio do localStorage. Roda uma vez no mount.
  useEffect(() => {
    let ativo = true;
    Promise.resolve()
      .then(() => api.get('/me/preferencias/dashboard'))
      .then((res) => {
        const dash = res?.data?.dashboard;
        if (ativo && dash) setEstado(reconciliar(dash, ids));
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
    // Uma vez no mount; `ids` é estável na prática (lista de widgets do papel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mover = useCallback((id, delta, label) => {
    setEstado((prev) => {
      const i = prev.ordem.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= prev.ordem.length) return prev;
      const ordem = [...prev.ordem];
      [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
      setAnuncio(`${label} movido para a posição ${j + 1} de ${ordem.length}.`);
      origemUsuario.current = true;
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
      origemUsuario.current = true;
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
