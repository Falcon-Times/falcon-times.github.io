// Authenticated data access used by the newsroom and admin consoles.
// Row-level security does the real authorisation; these are just queries.
import { sessionClient, unwrap } from '@/lib/supabase';
import { slugify } from '@/lib/format';
import type {
  Article, ArticleComment, ArticleStatus, AuditEntry, Game, Poll, Profile, Section, StaffMember, Tip,
} from '@/lib/types';

const db = () => sessionClient();

export interface DirectoryEntry { id: string; display_name: string; role: string; sections: string[]; staff_member_id: string | null; active: boolean }

export async function loadRefs() {
  const [sections, staff, directory] = await Promise.all([
    db().from('sections').select('*').order('sort_order'),
    db().from('staff_members').select('*').order('sort_order'),
    db().from('staff_directory').select('*'),
  ]);
  return {
    sections: unwrap(sections) as Section[],
    staff: unwrap(staff) as StaffMember[],
    directory: unwrap(directory) as DirectoryEntry[],
  };
}

// ---------------------------------------------------------------- articles
export type ArticleListItem = Omit<Article, 'body_md'>;
const LIST_COLS = 'id,slug,title,section_id,subsection,status,featured,is_lead,created_by,byline_ids,published_at,updated_at,last_edited_at,created_at,deck,cover_image_url,image_alt,image_caption,photo_credit,tags,update_note';

export async function listArticles(): Promise<ArticleListItem[]> {
  const res = await db().from('articles').select(LIST_COLS).order('last_edited_at', { ascending: false }).limit(500);
  return unwrap(res) as ArticleListItem[];
}

export async function getArticle(id: string): Promise<Article | null> {
  const res = await db().from('articles').select('*').eq('id', id).maybeSingle();
  return unwrap(res) as Article | null;
}

export type ArticleInput = Pick<Article,
  'title' | 'deck' | 'body_md' | 'section_id' | 'subsection' | 'cover_image_url' | 'image_alt' | 'image_caption' |
  'photo_credit' | 'byline_ids' | 'tags' | 'status' | 'featured' | 'is_lead' | 'published_at' | 'update_note' | 'slug'>;

const isUnique = (e: { code?: string } | null) => e?.code === '23505';
const rand = () => Math.random().toString(36).slice(2, 6);

export async function saveArticle(id: string | null, input: ArticleInput, userId: string): Promise<Article> {
  if (id) {
    const res = await db().from('articles').update(input).eq('id', id).select('*').single();
    return unwrap(res) as Article;
  }
  const base = slugify(input.title);
  for (let attempt = 0; attempt < 4; attempt++) {
    const slug = attempt === 0 && !input.slug ? `${base}-${rand()}` : input.slug && attempt === 0 ? input.slug : `${base}-${rand()}${rand()}`;
    const res = await db().from('articles').insert({ ...input, slug, created_by: userId }).select('*').single();
    if (isUnique(res.error)) continue;
    return unwrap(res) as Article;
  }
  throw new Error('Could not generate a unique link for this story. Try changing the headline slightly.');
}

export async function deleteArticle(id: string) {
  const res = await db().from('articles').delete().eq('id', id).select('id');
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error('You don’t have permission to delete this story.');
}

export async function setArticleFlags(id: string, patch: Partial<Pick<Article, 'featured' | 'is_lead' | 'status'>>) {
  const res = await db().from('articles').update(patch).eq('id', id).select('id');
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error('That change was not allowed.');
}

export async function listComments(articleId: string): Promise<ArticleComment[]> {
  const res = await db().from('article_comments').select('*').eq('article_id', articleId).order('created_at');
  return unwrap(res) as ArticleComment[];
}
export async function addComment(articleId: string, authorId: string, body: string) {
  const res = await db().from('article_comments').insert({ article_id: articleId, author_id: authorId, body });
  if (res.error) throw new Error(res.error.message);
}

// -------------------------------------------------------------------- tips
export async function listTips(): Promise<Tip[]> {
  const res = await db().from('tips').select('*').order('created_at', { ascending: false }).limit(500);
  return unwrap(res) as Tip[];
}
export async function updateTip(id: string, patch: Partial<Pick<Tip, 'status' | 'assigned_to' | 'internal_notes'>>) {
  const res = await db().from('tips').update(patch).eq('id', id).select('id');
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error('You can’t change that tip.');
}
export async function deleteTip(id: string) {
  const res = await db().from('tips').delete().eq('id', id).select('id');
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error('Only admins can delete tips.');
}

// ------------------------------------------------------------ generic CRUD
export async function listRows<T>(table: string, orderBy: string, ascending = true, limit = 500): Promise<T[]> {
  const res = await db().from(table).select('*').order(orderBy, { ascending }).limit(limit);
  return unwrap(res) as T[];
}
export async function upsertRow<T extends object>(table: string, key: string, row: T, isNew: boolean): Promise<void> {
  const q = isNew ? db().from(table).insert(row) : db().from(table).update(row).eq(key, (row as Record<string, unknown>)[key] as string);
  const res = await q.select();
  if (res.error) throw new Error(friendly(res.error.message));
  if (!isNew && !res.data?.length) throw new Error('Nothing was saved — you may not have permission to change that.');
}
export async function deleteRow(table: string, key: string, value: string): Promise<void> {
  const res = await db().from(table).delete().eq(key, value).select();
  if (res.error) throw new Error(friendly(res.error.message));
  if (!res.data?.length) throw new Error('Nothing was deleted — you may not have permission.');
}
function friendly(msg: string): string {
  if (/duplicate key/i.test(msg)) return 'Something with that name/ID already exists.';
  if (/row-level security/i.test(msg)) return 'You don’t have permission to do that.';
  return msg;
}

export async function pollTallies(): Promise<Record<string, number>> {
  const res = await db().from('poll_tallies').select('poll_id,votes');
  const out: Record<string, number> = {};
  for (const r of unwrap(res) as { poll_id: string; votes: number }[]) out[r.poll_id] = (out[r.poll_id] ?? 0) + r.votes;
  return out;
}
export async function pollResults(poll: Poll): Promise<Record<string, number>> {
  const res = await db().from('poll_tallies').select('option_id,votes').eq('poll_id', poll.id);
  return Object.fromEntries((unwrap(res) as { option_id: string; votes: number }[]).map((r) => [r.option_id, r.votes]));
}
export async function resetPoll(id: string) {
  const res = await db().from('poll_tallies').delete().eq('poll_id', id);
  if (res.error) throw new Error(res.error.message);
}

export async function listGames(): Promise<Game[]> { return listRows<Game>('games', 'starts_at', false); }

// ------------------------------------------------------------------ profile
export async function updateMyName(id: string, display_name: string) {
  const res = await db().from('profiles').update({ display_name }).eq('id', id);
  if (res.error) throw new Error(res.error.message);
}
export async function updateStaffBio(id: string, patch: { bio: string; photo_url: string | null }) {
  const res = await db().from('staff_members').update(patch).eq('id', id).select('id');
  if (res.error) throw new Error(res.error.message);
  if (!res.data?.length) throw new Error('Could not save your profile.');
}

// ------------------------------------------------------------------ counts
export async function countTable(table: string): Promise<number> {
  const res = await db().from(table).select('id', { count: 'exact', head: true });
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}
export async function countWhere(table: string, column: string, value: string): Promise<number> {
  const res = await db().from(table).select('id', { count: 'exact', head: true }).eq(column, value);
  if (res.error) throw new Error(res.error.message);
  return res.count ?? 0;
}

// -------------------------------------------------------------------- admin
export async function listProfiles(): Promise<Profile[]> {
  return listRows<Profile>('profiles', 'display_name');
}
export async function listAudit(): Promise<AuditEntry[]> {
  const res = await db().from('audit_log').select('*').order('at', { ascending: false }).limit(300);
  return unwrap(res) as AuditEntry[];
}
export async function saveSetting(key: string, value: unknown) {
  const res = await db().from('site_settings').upsert({ key, value }, { onConflict: 'key' });
  if (res.error) throw new Error(res.error.message);
}

export interface AdminUserInfo { id: string; last_sign_in_at: string | null; banned: boolean; mfa: boolean }
interface AdminCall {
  action: 'create' | 'list' | 'reset_password' | 'reset_mfa' | 'set_active' | 'delete';
  [k: string]: unknown;
}
export async function adminUsers<T = unknown>(body: AdminCall): Promise<T> {
  const { data, error } = await db().functions.invoke('admin-users', { body });
  if (error) {
    // supabase-js hides the JSON error body behind a Response on `context`.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try { const j = await ctx.json(); if (j?.error) throw new Error(j.error); } catch (e) { if (e instanceof Error && e.message) throw e; }
    }
    throw new Error(error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export type { ArticleStatus };
