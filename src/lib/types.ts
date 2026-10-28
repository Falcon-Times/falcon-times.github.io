// Row shapes mirror supabase/migrations/*.sql.

export type Role = 'writer' | 'editor' | 'admin' | 'super_admin';

/** Admins and super admins: full site access (and two-factor is required). */
export const isAdminRole = (r: Role) => r === 'admin' || r === 'super_admin';
export type ArticleStatus = 'draft' | 'submitted' | 'published' | 'archived';
export type TipStatus = 'new' | 'in_review' | 'resolved' | 'dismissed';
export type TipCategory = 'story' | 'correction' | 'letter' | 'poll' | 'scores' | 'feedback' | 'other';
export type GameStatus = 'scheduled' | 'final' | 'postponed' | 'cancelled';

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  sections: string[];
  staff_member_id: string | null;
  active: boolean;
  created_at: string;
}

export interface Section {
  id: string;
  name: string;
  description: string;
  icon: string;
  subsections: string[];
  sort_order: number;
  active: boolean;
}

export interface StaffMember {
  id: string;
  slug: string;
  name: string;
  title: string;
  sections: string[];
  lead_of: string[];
  bio: string;
  photo_url: string | null;
  active: boolean;
  sort_order: number;
}

export interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  deck: string;
  section_id: string;
  subsection: string | null;
  cover_image_url: string | null;
  image_alt: string;
  image_caption: string;
  photo_credit: string;
  byline_ids: string[];
  tags: string[];
  status: ArticleStatus;
  featured: boolean;
  is_lead: boolean;
  created_by: string | null;
  published_at: string | null;
  updated_at: string | null;
  update_note: string;
  last_edited_at: string;
  created_at: string;
}

export interface Article extends ArticleSummary {
  body_md: string;
}

export interface ArticleComment {
  id: string;
  article_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
}

export interface Tip {
  id: string;
  category: TipCategory;
  section_id: string | null;
  message: string;
  contact: string | null;
  status: TipStatus;
  assigned_to: string | null;
  internal_notes: string;
  created_at: string;
  updated_at: string;
}

export interface PollOption {
  id: string;
  label: string;
}

export interface Poll {
  id: string;
  category: string;
  question: string;
  options: PollOption[];
  active: boolean;
  created_at: string;
}

export type PollWithVotes = Poll & { votes: Record<string, number> };

export interface Game {
  id: string;
  sport: string;
  opponent: string;
  is_home: boolean;
  starts_at: string;
  location: string;
  status: GameStatus;
  our_score: number | null;
  their_score: number | null;
  recap_article_id: string | null;
}

export interface Quote {
  id: string;
  text: string;
  attribution: string;
  active: boolean;
  sort_order: number;
}

export interface Announcement {
  id: string;
  text: string;
  link_url: string | null;
  starts_at: string;
  ends_at: string | null;
  active: boolean;
}

export interface AuditEntry {
  id: number;
  at: string;
  actor: string | null;
  actor_email: string | null;
  table_name: string;
  op: string;
  row_id: string | null;
  summary: string;
}

export interface SiteSettings {
  site: {
    name: string;
    tagline: string;
    school: string;
    address: string;
    latitude: number;
    longitude: number;
    place: string;
  };
  contact: { email: string };
  social: { instagram: string; tiktok: string; youtube: string; x: string };
  hotline: { enabled: boolean; intro: string };
  standards: { points: string[] };
}

export interface SiteData {
  settings: SiteSettings;
  sections: Section[];
  quotes: Quote[];
  announcements: Announcement[];
}

export const TIP_CATEGORIES: { id: TipCategory; label: string }[] = [
  { id: 'story', label: 'Story idea / news tip' },
  { id: 'correction', label: 'Correction for a published article' },
  { id: 'letter', label: 'Letter to the editor' },
  { id: 'scores', label: 'Score or athlete shout-out' },
  { id: 'poll', label: 'Poll topic suggestion' },
  { id: 'feedback', label: 'Website feedback' },
  { id: 'other', label: 'Something else' },
];
