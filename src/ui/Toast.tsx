import { createStore } from '@/lib/store';
import { Icon } from './Icon';

interface ToastItem { id: number; text: string; kind: 'info' | 'ok' | 'bad' }
const store = createStore<ToastItem[]>([]);
let counter = 0;

export function toast(text: string, kind: ToastItem['kind'] = 'info', ms = 4200) {
  const id = ++counter;
  store.set([...store.get(), { id, text, kind }]);
  setTimeout(() => store.set(store.get().filter((t) => t.id !== id)), ms);
}
export const toastError = (e: unknown) => toast(e instanceof Error ? e.message : String(e), 'bad', 7000);

export function Toasts() {
  const items = store.use();
  return (
    <div class="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} class={`toast toast-${t.kind}`}>
          <Icon name={t.kind === 'bad' ? 'warning' : t.kind === 'ok' ? 'circle-check' : 'info'} size={18} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
