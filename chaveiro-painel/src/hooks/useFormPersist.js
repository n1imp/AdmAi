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

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(values));
  }, [key, values]);

  function clear() {
    localStorage.removeItem(key);
    setValues(initialValues);
  }

  return [values, setValues, clear];
}
