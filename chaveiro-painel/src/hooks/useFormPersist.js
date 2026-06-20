import { useState, useEffect } from 'react';

export function useFormPersist(key, initialValues) {
  const [values, setValues] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved ? { ...initialValues, ...JSON.parse(saved) } : initialValues;
    } catch {
      return initialValues;
    }
  });

  // Debounce: evita gravar no localStorage a cada tecla digitada.
  useEffect(() => {
    const id = setTimeout(() => {
      localStorage.setItem(key, JSON.stringify(values));
    }, 300);
    return () => clearTimeout(id);
  }, [key, values]);

  function clear() {
    localStorage.removeItem(key);
    setValues(initialValues);
  }

  return [values, setValues, clear];
}
