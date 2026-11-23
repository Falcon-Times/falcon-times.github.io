import { describe, expect, it } from 'vitest';
import { checkPassword, isStrongPassword, passwordProblems, PASSWORD_MIN_LENGTH } from '@/lib/passwordPolicy';

describe('password policy (mirrors the Supabase dashboard setting)', () => {
  it('requires 12+ characters with lowercase, uppercase and a digit', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(isStrongPassword('Abcdefghij1k')).toBe(true);
    expect(isStrongPassword('Abcdefghij1')).toBe(false);        // 11 characters
    expect(isStrongPassword('abcdefghij1k')).toBe(false);       // no capital
    expect(isStrongPassword('ABCDEFGHIJ1K')).toBe(false);       // no lowercase
    expect(isStrongPassword('Abcdefghijkl')).toBe(false);       // no digit
  });

  it('names exactly the rules that are broken', () => {
    expect(passwordProblems('short')).toEqual(['At least 12 characters', 'An uppercase letter (A–Z)', 'A digit (0–9)']);
    expect(passwordProblems('Correct-Horse-Battery-9')).toEqual([]);
    expect(checkPassword('').every((c) => !c.ok)).toBe(true);
  });

  it('counts characters, not UTF-16 units, and accepts accented letters', () => {
    expect(isStrongPassword('Éa1Éa1Éa1Éa1')).toBe(true);
    expect(isStrongPassword('Aa1😀😀😀😀😀😀😀😀😀')).toBe(true); // 12 characters, 21 code units
    expect(isStrongPassword('Aa1😀😀😀😀😀😀😀😀')).toBe(false); // 11 characters
  });
});
