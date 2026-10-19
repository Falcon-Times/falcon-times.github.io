import { initials } from '@/lib/format';

export function Avatar({ name, src, size = 44 }: { name: string; src?: string | null; size?: number }) {
  const style = { '--s': `${size}px` } as Record<string, string>;
  return src
    ? <img class="avatar" src={src} alt="" style={style} loading="lazy" />
    : <span class="avatar" style={style} aria-hidden="true">{initials(name)}</span>;
}
