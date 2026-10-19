import { useEffect, useState } from 'preact/hooks';

/** A tiny observable value with a Preact hook — enough for global UI state. */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((l) => l(value));
    },
    use(): T {
      const [v, setV] = useState(value);
      useEffect(() => {
        listeners.add(setV);
        setV(value);
        return () => void listeners.delete(setV);
      }, []);
      return v;
    },
  };
}

export function safeStorage(kind: 'local' | 'session' = 'local') {
  const s = () => (kind === 'local' ? window.localStorage : window.sessionStorage);
  return {
    get<T>(key: string, fallback: T): T {
      try {
        const raw = s().getItem(key);
        return raw === null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    set(key: string, value: unknown) {
      try {
        s().setItem(key, JSON.stringify(value));
      } catch {
        /* private mode / quota — ignore */
      }
    },
    remove(key: string) {
      try {
        s().removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}
