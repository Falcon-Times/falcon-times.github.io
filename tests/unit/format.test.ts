import { describe, expect, it } from 'vitest';
import { formatDateTime, fromLocalInput, initials, readingMinutes, slugify, toLocalInput } from '@/lib/format';

describe('slugify', () => {
  it('makes URL-safe slugs', () => {
    expect(slugify('Homecoming: Seniors’ Float Wins!')).toBe('homecoming-seniors-float-wins');
    expect(slugify('  Café déjà vu  ')).toBe('cafe-deja-vu');
    expect(slugify('!!!')).toBe('untitled');
  });
  it('caps the length without a trailing dash', () => {
    const s = slugify('word '.repeat(40), 20);
    expect(s.length).toBeLessThanOrEqual(20);
    expect(s.endsWith('-')).toBe(false);
  });
});

describe('time stamps', () => {
  it('formats in Eastern time with the zone abbreviation', () => {
    expect(formatDateTime('2026-10-14T11:15:00Z')).toBe('Oct 14, 2026 at 7:15 AM EDT');
    expect(formatDateTime('2026-12-14T12:15:00Z')).toBe('Dec 14, 2026 at 7:15 AM EST');
  });
  it('round-trips datetime-local values through UTC', () => {
    const iso = '2026-10-14T11:15:00.000Z';
    expect(toLocalInput(iso)).toBe('2026-10-14T07:15');
    expect(fromLocalInput('2026-10-14T07:15')).toBe(iso);
    expect(fromLocalInput('2026-12-14T07:15')).toBe('2026-12-14T12:15:00.000Z');
    expect(fromLocalInput('')).toBeNull();
  });
});

describe('misc helpers', () => {
  it('computes initials', () => {
    expect(initials('Molly Krenicky')).toBe('MK');
    expect(initials('Aamna')).toBe('A');
    expect(initials('')).toBe('?');
  });
  it('estimates reading time', () => {
    expect(readingMinutes('word '.repeat(440))).toBe(2);
    expect(readingMinutes('')).toBe(1);
  });
});
