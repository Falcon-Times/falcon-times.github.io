// Keyboard shortcuts and text transformations for the story editor's Markdown box.
// Everything here is pure (no DOM), so it can be unit-tested.

export type ShortcutId =
  | 'bold' | 'italic' | 'underline' | 'strike' | 'link'
  | 'heading' | 'quote' | 'bullets' | 'numbers' | 'help';

/** The bits of a keyboard event the shortcuts care about. */
export interface KeyInfo { key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }

export interface Shortcut {
  id: ShortcutId;
  label: string;
  /** What to press, after the Ctrl/⌘ key. */
  keys: string[];
  /** Shown in the list on small print. */
  note?: string;
  matches: (e: KeyInfo, mac: boolean) => boolean;
}

// "Ctrl" on Windows / Linux / Chromebooks, "⌘ Command" on Mac. (Ctrl+B etc. on a Mac are cursor
// movement in text boxes, so there only ⌘ counts.)
const mod = (e: KeyInfo, mac: boolean) => (mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey);
const plain = (e: KeyInfo, mac: boolean, letter: string) => mod(e, mac) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === letter;
const shifted = (e: KeyInfo, mac: boolean, code: string) => mod(e, mac) && e.shiftKey && !e.altKey && e.code === code;

export const SHORTCUTS: Shortcut[] = [
  { id: 'bold', label: 'Bold', keys: ['B'], matches: (e, m) => plain(e, m, 'b') },
  { id: 'italic', label: 'Italic', keys: ['I'], matches: (e, m) => plain(e, m, 'i') },
  { id: 'underline', label: 'Underline', keys: ['U'], matches: (e, m) => plain(e, m, 'u') },
  { id: 'strike', label: 'Strikethrough', keys: ['Shift', 'X'], matches: (e, m) => shifted(e, m, 'KeyX') },
  { id: 'link', label: 'Add a link', keys: ['K'], matches: (e, m) => plain(e, m, 'k') },
  { id: 'heading', label: 'Subheading', keys: ['Alt', '2'], matches: (e, m) => mod(e, m) && e.altKey && !e.shiftKey && e.code === 'Digit2' },
  { id: 'quote', label: 'Quote', keys: ['Shift', '9'], matches: (e, m) => shifted(e, m, 'Digit9') },
  { id: 'bullets', label: 'Bulleted list', keys: ['Shift', '8'], matches: (e, m) => shifted(e, m, 'Digit8') },
  { id: 'numbers', label: 'Numbered list', keys: ['Shift', '7'], matches: (e, m) => shifted(e, m, 'Digit7') },
  {
    id: 'help', label: 'Show this list', keys: ['?'], note: 'also Ctrl/⌘ + /',
    // "?" is Shift + "/" on a US keyboard; accept either.
    matches: (e, m) => mod(e, m) && !e.altKey && (e.key === '?' || e.key === '/' || e.code === 'Slash'),
  },
];

/** Which shortcut (if any) this key press is. */
export function matchShortcut(e: KeyInfo, mac = isMac()): ShortcutId | null {
  return SHORTCUTS.find((s) => s.matches(e, mac))?.id ?? null;
}

export function isMac(nav: Pick<Navigator, 'platform' | 'userAgent'> | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(`${nav?.platform ?? ''} ${nav?.userAgent ?? ''}`);
}

/** "Bold (Ctrl+B)" / "Bold (⌘B)" for tooltips. */
export function shortcutHint(id: ShortcutId, mac = isMac()): string {
  const s = SHORTCUTS.find((x) => x.id === id)!;
  return mac ? `${s.label} (${keyLabels(s, true).join('')})` : `${s.label} (${keyLabels(s, false).join('+')})`;
}

/** The individual key caps for a shortcut, including Ctrl or ⌘ first. */
export function keyLabels(s: Pick<Shortcut, 'keys'>, mac = isMac()): string[] {
  const names = s.keys.map((k) => (mac ? ({ Shift: '⇧', Alt: '⌥' } as Record<string, string>)[k] ?? k : k));
  return [mac ? '⌘' : 'Ctrl', ...names];
}

// ------------------------------------------------------------ text transforms

export interface Edit { text: string; selStart: number; selEnd: number }

/**
 * Wrap the selection in `l`…`r` (e.g. ** for bold). If it is already wrapped in exactly those marks,
 * take them off instead, so the same shortcut toggles.
 */
export function applyWrap(value: string, a: number, b: number, l: string, r = l, placeholder = 'text'): Edit {
  const before = value.slice(0, a), sel = value.slice(a, b), after = value.slice(b);
  const marked = (bf: string, af: string) => {
    if (!bf.endsWith(l) || !af.startsWith(r)) return false;
    if (l !== '*') return true;
    // Italic is one "*": "**bold**" must not count as italic, but "***both***" does.
    const lead = /\**$/.exec(bf)![0].length, trail = /^\**/.exec(af)![0].length;
    return lead % 2 === 1 && trail % 2 === 1;
  };

  // Marks just outside the selection: "**|word|**"
  if (sel && marked(before, after)) {
    const start = before.length - l.length;
    return { text: before.slice(0, start) + sel + after.slice(r.length), selStart: start, selEnd: start + sel.length };
  }
  // Marks inside the selection: "|**word**|"
  if (sel.length >= l.length + r.length && sel.startsWith(l) && sel.endsWith(r) && (l !== '*' || (!sel.startsWith('**') || sel.startsWith('***')))) {
    const inner = sel.slice(l.length, sel.length - r.length);
    return { text: before + inner + after, selStart: before.length, selEnd: before.length + inner.length };
  }
  const inner = sel || placeholder;
  return { text: before + l + inner + r + after, selStart: before.length + l.length, selEnd: before.length + l.length + inner.length };
}

/**
 * Put `prefix` ("## ", "> ", "- ", "1. ") on every line the selection touches. If they all have it
 * already, take it off instead.
 */
export function applyLinePrefix(value: string, a: number, b: number, prefix: string): Edit {
  const start = value.lastIndexOf('\n', a - 1) + 1;
  const nl = value.indexOf('\n', b > a && value[b - 1] === '\n' ? b - 1 : b);
  const end = nl === -1 ? value.length : nl;
  const lines = value.slice(start, end).split('\n');
  const numbered = prefix === '1. ';
  const has = (l: string) => (numbered ? /^\d+\.\s/.test(l) : l.startsWith(prefix));
  const strip = (l: string) => (numbered ? l.replace(/^\d+\.\s/, '') : l.slice(prefix.length));
  const nonEmpty = lines.filter((l) => l.trim() !== '');
  const off = nonEmpty.length > 0 && nonEmpty.every(has);
  let n = 0;
  const out = lines.map((l) => {
    if (off) return has(l) ? strip(l) : l;
    if (l.trim() === '' && lines.length > 1) return l;
    n += 1;
    return (numbered ? `${n}. ` : prefix) + (l === '' ? 'text' : l);
  }).join('\n');
  return { text: value.slice(0, start) + out + value.slice(end), selStart: start, selEnd: start + out.length };
}
