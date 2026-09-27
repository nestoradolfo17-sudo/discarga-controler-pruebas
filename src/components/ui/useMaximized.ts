import { useState } from 'react';

// Ventana a pantalla completa, recordada en este navegador (por modal).
// Se guarda solo como preferencia local de quien usa la tablet.
export function useMaximized(storageKey: string): [boolean, () => void] {
  const [isMaximized, setIsMaximized] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () =>
    setIsMaximized((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        /* sin almacenamiento: solo dura mientras la ventana esté abierta */
      }
      return next;
    });
  return [isMaximized, toggle];
}
