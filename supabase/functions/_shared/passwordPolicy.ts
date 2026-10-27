// The newsroom's password rules. These mirror the "Password requirements" in the
// Supabase dashboard (Authentication -> Sign In / Providers -> Email): at least
// 12 characters with a lowercase letter, an uppercase letter and a digit.
//
// Supabase enforces its own copy of the rules and is the authority; this file just lets
// the sign-in screens and the account function explain them *before* a request is made.
// If you change the dashboard settings, change them here too (and in docs/SETUP.md).
//
// No imports on purpose: the browser app and the Deno Edge Function both use this file.

export const PASSWORD_MIN_LENGTH = 12;

export type PasswordRuleId = 'length' | 'lower' | 'upper' | 'digit';

export interface PasswordRule {
  id: PasswordRuleId;
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (p) => [...p].length >= PASSWORD_MIN_LENGTH },
  { id: 'lower', label: 'A lowercase letter (a–z)', test: (p) => /\p{Ll}/u.test(p) },
  { id: 'upper', label: 'An uppercase letter (A–Z)', test: (p) => /\p{Lu}/u.test(p) },
  { id: 'digit', label: 'A digit (0–9)', test: (p) => /\d/.test(p) },
];

/** One-line summary for hints and errors. */
export const PASSWORD_RULES_SUMMARY =
  `At least ${PASSWORD_MIN_LENGTH} characters, with at least one lowercase letter, one uppercase letter and one digit.`;

export interface PasswordCheck { id: PasswordRuleId; label: string; ok: boolean }

/** Every rule, with whether the password meets it (for a live checklist). */
export function checkPassword(password: string): PasswordCheck[] {
  return PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(password) }));
}

/** The rules a password breaks (empty = acceptable). */
export function passwordProblems(password: string): string[] {
  return checkPassword(password).filter((c) => !c.ok).map((c) => c.label);
}

export const isStrongPassword = (password: string): boolean => passwordProblems(password).length === 0;
