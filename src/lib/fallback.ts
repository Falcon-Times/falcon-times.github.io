// Content used when the backend is unreachable or not yet configured, so the
// public site still renders something sensible. Same file seeds the database.
import seed from '../../data/seed.json';
import type { Article, ArticleSummary, PollWithVotes, SiteData, StaffMember } from './types';

export const fallbackSite: SiteData = {
  settings: seed.settings as SiteData['settings'],
  sections: seed.sections.map((s) => ({ active: true, ...s })),
  quotes: seed.quotes.map((q, i) => ({ id: `q${i}`, active: true, ...q })),
  announcements: [],
};

export const fallbackStaff: StaffMember[] = seed.staff.map((s) => ({
  id: s.slug, photo_url: null, active: true, ...s,
}));

export const fallbackArticles: Article[] = seed.articles.map((a) => ({
  id: a.slug,
  cover_image_url: null,
  image_alt: '',
  image_caption: '',
  photo_credit: '',
  byline_ids: [],
  featured: false,
  created_by: null,
  updated_at: null,
  update_note: '',
  last_edited_at: a.published_at,
  created_at: a.published_at,
  ...a,
})) as Article[];

export const fallbackSummaries: ArticleSummary[] = fallbackArticles.map(({ body_md: _body, ...rest }) => rest);

export const fallbackPolls: PollWithVotes[] = seed.polls.map((p, i) => ({
  id: `poll${i}`, active: true, created_at: new Date().toISOString(), votes: {}, ...p,
}));
