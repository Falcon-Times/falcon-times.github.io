import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/lib/markdown';
import { applyLinePrefix, applyWrap, keyLabels, matchShortcut, SHORTCUTS, shortcutHint, type KeyInfo } from '@/console/editorKeys';

const key = (k: string, o: Partial<KeyInfo> = {}): KeyInfo => ({ key: k, code: `Key${k.toUpperCase()}`, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o });

describe('matchShortcut', () => {
  it('uses Ctrl on Windows/Linux and ⌘ on a Mac', () => {
    expect(matchShortcut(key('b', { ctrlKey: true }), false)).toBe('bold');
    expect(matchShortcut(key('b', { metaKey: true }), true)).toBe('bold');
    // Ctrl+B is "cursor back" on a Mac, and ⌘ is the Windows key elsewhere: neither counts
    expect(matchShortcut(key('b', { ctrlKey: true }), true)).toBeNull();
    expect(matchShortcut(key('b', { metaKey: true }), false)).toBeNull();
    expect(matchShortcut(key('b'), false)).toBeNull();
  });
  it('knows every shortcut', () => {
    const c = { ctrlKey: true };
    expect(matchShortcut(key('i', c), false)).toBe('italic');
    expect(matchShortcut(key('U', c), false)).toBe('underline');   // Caps Lock
    expect(matchShortcut(key('k', c), false)).toBe('link');
    expect(matchShortcut(key('X', { ...c, shiftKey: true }), false)).toBe('strike');
    expect(matchShortcut({ ...key('2', c), code: 'Digit2', altKey: true }, false)).toBe('heading');
    expect(matchShortcut({ ...key('(', c), code: 'Digit9', shiftKey: true }, false)).toBe('quote');
    expect(matchShortcut({ ...key('*', c), code: 'Digit8', shiftKey: true }, false)).toBe('bullets');
    expect(matchShortcut({ ...key('&', c), code: 'Digit7', shiftKey: true }, false)).toBe('numbers');
  });
  it('opens the list with Ctrl/⌘ + ? or /', () => {
    expect(matchShortcut({ ...key('?', { ctrlKey: true, shiftKey: true }), code: 'Slash' }, false)).toBe('help');
    expect(matchShortcut({ ...key('/', { ctrlKey: true }), code: 'Slash' }, false)).toBe('help');
    expect(matchShortcut({ ...key('?', { metaKey: true, shiftKey: true }), code: 'Slash' }, true)).toBe('help');
  });
  it('leaves other combinations alone (copy, paste, select all, undo…)', () => {
    for (const k of ['c', 'v', 'x', 'a', 'z', 'y', 's', 'f']) expect(matchShortcut(key(k, { ctrlKey: true }), false)).toBeNull();
    expect(matchShortcut(key('b', { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(matchShortcut(key('b', { ctrlKey: true, altKey: true }), false)).toBeNull();
  });
  it('has no two shortcuts on the same keys', () => {
    const seen = new Set(SHORTCUTS.map((s) => s.keys.join('+')));
    expect(seen.size).toBe(SHORTCUTS.length);
  });
  it('writes keys for the platform', () => {
    expect(shortcutHint('bold', false)).toBe('Bold (Ctrl+B)');
    expect(shortcutHint('bold', true)).toBe('Bold (⌘B)');
    expect(shortcutHint('strike', true)).toBe('Strikethrough (⌘⇧X)');
    expect(keyLabels({ keys: ['Alt', '2'] }, false)).toEqual(['Ctrl', 'Alt', '2']);
  });
});

describe('applyWrap', () => {
  it('wraps the selection and keeps it selected', () => {
    const r = applyWrap('say hello now', 4, 9, '**');
    expect(r.text).toBe('say **hello** now');
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('hello');
  });
  it('inserts a placeholder when nothing is selected', () => {
    const r = applyWrap('ab', 1, 1, '**');
    expect(r.text).toBe('a**text**b');
    expect(r.text.slice(r.selStart, r.selEnd)).toBe('text');
  });
  it('toggles off whether the marks are outside or inside the selection', () => {
    expect(applyWrap('say **hello** now', 6, 11, '**').text).toBe('say hello now');
    expect(applyWrap('say **hello** now', 4, 13, '**').text).toBe('say hello now');
    expect(applyWrap('<u>x</u>', 3, 4, '<u>', '</u>').text).toBe('x');
  });
  it('keeps italic and bold apart', () => {
    // italic on bold text adds italic; it doesn't strip one star of the bold
    expect(applyWrap('**hi**', 2, 4, '*').text).toBe('***hi***');
    // …and italic again takes only the italic off
    expect(applyWrap('***hi***', 3, 5, '*').text).toBe('**hi**');
    expect(applyWrap('*hi*', 1, 3, '*').text).toBe('hi');
    // bold on italic text adds bold
    expect(applyWrap('*hi*', 1, 3, '**').text).toBe('***hi***');
  });
  it('wraps underline in <u> and renders it for readers', () => {
    const r = applyWrap('make this count', 5, 9, '<u>', '</u>');
    expect(r.text).toBe('make <u>this</u> count');
    expect(renderMarkdown(r.text)).toContain('<u>this</u>');
  });
  it('does strikethrough with ~~, which renders as <del>', () => {
    const r = applyWrap('old news', 0, 3, '~~');
    expect(r.text).toBe('~~old~~ news');
    expect(renderMarkdown(r.text)).toContain('<del>old</del>');
  });
});

describe('applyLinePrefix', () => {
  it('prefixes the line the cursor is on', () => {
    const r = applyLinePrefix('one\ntwo\nthree', 5, 5, '## ');
    expect(r.text).toBe('one\n## two\nthree');
  });
  it('prefixes every selected line, numbering lists', () => {
    expect(applyLinePrefix('a\nb\nc', 0, 5, '- ').text).toBe('- a\n- b\n- c');
    expect(applyLinePrefix('a\nb\nc', 0, 5, '1. ').text).toBe('1. a\n2. b\n3. c');
  });
  it('takes the prefix off again', () => {
    expect(applyLinePrefix('- a\n- b', 0, 7, '- ').text).toBe('a\nb');
    expect(applyLinePrefix('1. a\n2. b', 0, 9, '1. ').text).toBe('a\nb');
    expect(applyLinePrefix('> quoted', 3, 3, '> ').text).toBe('quoted');
  });
  it('does not drag in the next line when the selection ends at a line break', () => {
    expect(applyLinePrefix('a\nb\nc', 0, 2, '- ').text).toBe('- a\nb\nc');
  });
  it('starts a line on an empty one', () => {
    expect(applyLinePrefix('', 0, 0, '> ').text).toBe('> text');
  });
});
