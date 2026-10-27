/** "123-456-7890": how a 2FA bypass code is shown and typed. Accepts pasted codes with spaces or dashes. */
export function formatBypassCode(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6)].filter(Boolean).join('-');
}
