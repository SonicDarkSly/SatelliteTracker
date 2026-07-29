/** État React persisté en localStorage (aucune base de données côté serveur). */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  // Écriture différée : évite d'écrire à chaque frappe dans un champ de recherche.
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* quota dépassé ou mode privé : on continue sans persistance */
      }
    }, 250);
    return () => window.clearTimeout(timer.current);
  }, [key, value]);

  const update = useCallback((next: T) => setValue(next), []);
  return [value, update];
}

/** Lecture/écriture directe d'un objet JSON en localStorage (hors cycle React). */
export const localJson = {
  read<T>(key: string): T | undefined {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? undefined : (JSON.parse(raw) as T);
    } catch {
      return undefined;
    }
  },
  write(key: string, value: unknown): boolean {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* rien à faire */
    }
  },
};
