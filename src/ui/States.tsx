import type { ComponentChildren } from 'preact';
import { Icon } from './Icon';

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div class="state" role="status">
      <Icon name="loader" size={22} class="spinner" /> <span>{label}</span>
    </div>
  );
}

export function Empty({ icon = 'newspaper', title, children }: { icon?: string; title: string; children?: ComponentChildren }) {
  return (
    <div class="state state-empty">
      <Icon name={icon} size={34} strokeWidth={1.5} />
      <h3>{title}</h3>
      {children && <div class="muted">{children}</div>}
    </div>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  return (
    <div class="notice notice-bad" role="alert">
      <Icon name="warning" />
      <div>{error instanceof Error ? error.message : String(error)}</div>
    </div>
  );
}
