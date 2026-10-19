import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: focus trap, Esc to close, scroll lock, focus restore. */
export function Modal({ title, onClose, children, footer, width = 560 }: {
  title: string; onClose: () => void; children: ComponentChildren; footer?: ComponentChildren; width?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector<HTMLElement>('input,textarea,select') ?? ref.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const items = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const a = items[0], z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, []);

  return (
    <div class="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref} style={{ '--w': `${width}px` }}>
        <div class="modal-head">
          <h2>{title}</h2>
          <button type="button" class="btn btn-icon btn-sm" onClick={onClose} aria-label="Close"><Icon name="x" size={16} /></button>
        </div>
        <div class="modal-body">{children}</div>
        {footer && <div class="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}
