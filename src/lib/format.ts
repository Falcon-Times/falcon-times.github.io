import { TIME_ZONE } from './config';

const dateTime = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});
const dateOnly = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric' });
const timeOnly = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
const longToday = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

/** "Oct 14, 2026 at 7:15 AM EDT" — the timestamp stamped on every article. */
export function formatDateTime(iso: string | Date): string {
  const parts = dateTime.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('month')} ${get('day')}, ${get('year')} at ${get('hour')}:${get('minute')} ${get('dayPeriod')} ${get('timeZoneName')}`;
}
export const formatDate = (iso: string | Date) => dateOnly.format(new Date(iso));
export const formatShortDate = (iso: string | Date) => shortDate.format(new Date(iso));
export const formatTime = (iso: string | Date) => timeOnly.format(new Date(iso));
export const formatToday = () => longToday.format(new Date()).toUpperCase();

export function timeAgo(iso: string | Date): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return formatDate(iso);
}

/** Value for <input type="datetime-local"> in the newspaper's time zone. */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(iso));
  return parts.replace(' ', 'T');
}

/** Inverse of toLocalInput(): interpret "YYYY-MM-DDTHH:mm" as newsroom time. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null;
  const asUtc = new Date(`${value}:00Z`);
  // Find the zone offset at that wall-clock time and correct for it.
  const shown = toLocalInput(asUtc.toISOString());
  const drift = new Date(`${shown}:00Z`).getTime() - asUtc.getTime();
  return new Date(asUtc.getTime() - drift).toISOString();
}

export function readingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 220));
}

export function slugify(text: string, max = 70): string {
  const s = text
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, max).replace(/-+$/g, '') || 'untitled';
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
