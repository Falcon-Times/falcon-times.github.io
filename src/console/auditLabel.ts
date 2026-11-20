// The little badge in the Activity log: what happened to what, in plain words.

const OP: Record<string, string> = { INSERT: 'created', UPDATE: 'changed', DELETE: 'deleted' };
const TABLE: Record<string, string> = {
  articles: 'story', profiles: 'account', staff_members: 'staff member', sections: 'section', site_settings: 'setting',
  polls: 'poll', games: 'game', quotes: 'quote', announcements: 'announcement', tips: 'tip' /* the tip line is gone; old log entries remain */,
};

// Account actions are logged with the operation ACCOUNT and say what they did in the summary text
// (written by the admin-users function and the bypass-code functions), so the badge reads it from there.
const ACCOUNT_ACTIONS: [RegExp, string][] = [
  [/^created \S+ account\b/i, 'created account'],
  [/^deleted account\b/i, 'deleted account'],
  [/^enabled account\b/i, 'enabled account'],
  [/^disabled account\b/i, 'disabled account'],
  [/^reset password\b/i, 'reset password'],
  [/^temporary password expired\b/i, 'temp password expired'],
  [/^reset two-factor\b/i, 'reset two-factor'],
  [/^created a 2FA bypass code\b/i, 'created bypass code'],
  [/^revoked the 2FA bypass code\b/i, 'revoked bypass code'],
  [/^signed in with a 2FA bypass code\b/i, 'used bypass code'],
  [/bypass code locked\b/i, 'locked bypass code'],
];

/**
 * "created story", "changed setting", "deleted staff member", "created account", "reset password"…
 * Never a raw upper-case operation: unknown ones are lower-cased, and unrecognised account actions read
 * "account change" (the details column has the full sentence).
 */
export function auditLabel(op: string, table: string, summary = ''): string {
  if (op === 'ACCOUNT') return ACCOUNT_ACTIONS.find(([re]) => re.test(summary.trim()))?.[1] ?? 'account change';
  return `${OP[op] ?? op.toLowerCase()} ${TABLE[table] ?? table}`;
}
