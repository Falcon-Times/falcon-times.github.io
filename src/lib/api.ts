// Public (anonymous) data access for the newspaper itself.
import { isConfigured } from './config';
import { anonClient, unwrap } from './supabase';
import {
  fallbackArticles, fallbackPolls, fallbackSite, fallbackStaff, fallbackSummaries,
} from './fallback';
import type {
  Announcement, Article, ArticleSummary, Game, PollWithVotes, Quote, Section, SiteData,
  SiteSettings, StaffMember, TipCategory,
} from './types';

const SUMMARY_COLUMNS =
  'id,slug,title,deck,section_id,subsection,cover_image_url,image_alt,image_caption,photo_credit,byline_ids,tags,status,featured,is_lead,created_by,published_at,updated_at,update_note,last_edited_at,created_at';

const nowIso = () => new Date().toISOString();

function mergeSettings(rows: { key: string; value: unknown }[]): SiteSettings {
  const merged: Record<string, unknown> = { ...fallbackSite.settings };
  for (const row of rows) {
    const base = (merged[row.key] ?? {}) as object;
    merged[row.key] = Array.isArray(row.value) ? row.value : { ...base, ...(row.value as object) };
  }
  return merged as unknown as SiteSettings;
}

export async function loadSite(): Promise<SiteData> {
  if (!isConfigured) return fallbackSite;
  const db = anonClient();
  const [settings, sections, quotes, announcements] = await Promise.all([
    db.from('site_settings').select('key,value'),
    db.from('sections').select('*').order('sort_order'),
    db.from('quotes').select('*').eq('active', true).order('sort_order'),
    db.from('announcements').select('*').eq('active', true).order('starts_at', { ascending: false }),
  ]);
  return {
    settings: mergeSettings(unwrap(settings)),
    sections: unwrap(sections) as Section[],
    quotes: unwrap(quotes) as Quote[],
    announcements: unwrap(announcements) as Announcement[],
  };
}

/** Newest published articles, without their (large) bodies. */
export async function loadArticles(limit = 150): Promise<ArticleSummary[]> {
  if (!isConfigured) return fallbackSummaries;
  const res = await anonClient()
    .from('articles')
    .select(SUMMARY_COLUMNS)
    .eq('status', 'published')
    .lte('published_at', nowIso())
    .order('published_at', { ascending: false })
    .limit(limit);
  return unwrap(res) as ArticleSummary[];
}

export async function loadArticle(slug: string): Promise<Article | null> {
  if (!isConfigured) return fallbackArticles.find((a) => a.slug === slug) ?? null;
  const res = await anonClient()
    .from('articles')
    .select('*')
    .eq('slug', slug)
    .eq('status', 'published')
    .lte('published_at', nowIso())
    .maybeSingle();
  return unwrap(res) as Article | null;
}

export async function loadStaff(): Promise<StaffMember[]> {
  if (!isConfigured) return fallbackStaff;
  const res = await anonClient().from('staff_members').select('*').eq('active', true).order('sort_order');
  return unwrap(res) as StaffMember[];
}

export async function loadGames(): Promise<Game[]> {
  if (!isConfigured) return [];
  const res = await anonClient().from('games').select('*').order('starts_at', { ascending: false }).limit(80);
  return unwrap(res) as Game[];
}

export async function loadPolls(): Promise<PollWithVotes[]> {
  if (!isConfigured) return fallbackPolls;
  const db = anonClient();
  const [polls, tallies] = await Promise.all([
    db.from('polls').select('*').eq('active', true).order('created_at', { ascending: false }).limit(6),
    db.from('poll_tallies').select('poll_id,option_id,votes'),
  ]);
  const counts = new Map<string, Record<string, number>>();
  for (const t of unwrap(tallies) as { poll_id: string; option_id: string; votes: number }[]) {
    const m = counts.get(t.poll_id) ?? {};
    m[t.option_id] = t.votes;
    counts.set(t.poll_id, m);
  }
  return (unwrap(polls) as PollWithVotes[]).map((p) => ({ ...p, votes: counts.get(p.id) ?? {} }));
}

export async function loadTrendingIds(n = 6): Promise<string[]> {
  if (!isConfigured) return [];
  const res = await anonClient().rpc('trending_article_ids', { p_limit: n });
  return (unwrap(res) as { article_id: string }[]).map((r) => r.article_id);
}

export async function recordView(articleId: string): Promise<void> {
  if (!isConfigured) return;
  await anonClient().rpc('record_view', { p_article: articleId });
}

export async function castVote(pollId: string, optionId: string): Promise<void> {
  if (!isConfigured) return;
  const res = await anonClient().rpc('cast_vote', { p_poll: pollId, p_option: optionId });
  if (res.error) throw new Error(res.error.message);
}

export interface TipInput {
  category: TipCategory;
  section_id: string | null;
  message: string;
  contact: string | null;
}

export async function submitTip(tip: TipInput): Promise<void> {
  if (!isConfigured) throw new Error('The tip line is not connected yet.');
  const res = await anonClient().from('tips').insert(tip);
  if (res.error) {
    throw new Error(/busy/i.test(res.error.message) ? res.error.message : 'We could not send that. Please try again in a moment.');
  }
}
