import { render } from 'preact';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** Renders children into <body>, outside whatever dialog or form they were declared in. */
export function Portal({ children }: { children: ComponentChildren }) {
  const host = useRef<HTMLDivElement | null>(null);
  if (!host.current) host.current = document.createElement('div');
  useEffect(() => {
    const el = host.current!;
    document.body.appendChild(el);
    return () => { render(null, el); el.remove(); };
  }, []);
  useEffect(() => { render(<>{children}</>, host.current!); });
  return null;
}
