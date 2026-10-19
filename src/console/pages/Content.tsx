import { useEffect, useState } from 'preact/hooks';
import { formatDateTime, formatShortDate, formatTime, slugify } from '@/lib/format';
import type { Announcement, Game, Poll, Quote, Section, StaffMember } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { toast, toastError } from '@/ui/Toast';
import { pollTallies, resetPoll } from '../api';
import { useMe } from '../auth';
import { CrudPage, type CrudConfig } from '../crud';
import { newOption } from '../fields';
import { useRefs } from '../refs';

const yesNo = (v: boolean) => <span class={`badge ${v ? 'badge-ok' : ''}`}>{v ? 'Yes' : 'No'}</span>;
const clip = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function Scoreboard() {
  const me = useMe();
  const canEdit = me.isAdmin || (me.isEditor && me.profile.sections.includes('sports'));
  const config: CrudConfig<Game> = {
    title: 'Scoreboard', singular: 'game', table: 'games', orderBy: 'starts_at', ascending: false, canEdit,
    intro: canEdit ? 'Add upcoming games, then enter the final score afterwards. This feeds the scoreboard on the front page.' : 'Only the Sports section leader and admins can edit the scoreboard.',
    defaults: () => ({ sport: '', opponent: '', is_home: true, starts_at: new Date().toISOString(), location: '', status: 'scheduled', our_score: null, their_score: null }),
    columns: () => [
      { label: 'When', render: (g) => <span class="nowrap">{formatShortDate(g.starts_at)} · {formatTime(g.starts_at)}</span> },
      { label: 'Sport', render: (g) => g.sport },
      { label: 'Opponent', render: (g) => `${g.is_home ? 'vs.' : 'at'} ${g.opponent}` },
      { label: 'Status', render: (g) => g.status === 'final' ? <strong>{g.our_score}–{g.their_score}</strong> : <span class="badge">{g.status}</span> },
    ],
    fields: [
      { key: 'sport', label: 'Sport / team', type: 'text', required: true, placeholder: 'Varsity Football', max: 80 },
      { key: 'opponent', label: 'Opponent', type: 'text', required: true, max: 120 },
      { key: 'starts_at', label: 'Date & time', type: 'datetime', required: true },
      { key: 'location', label: 'Location', type: 'text', max: 160, placeholder: 'Falcon Stadium' },
      { key: 'is_home', label: 'Home game', type: 'bool' },
      { key: 'status', label: 'Status', type: 'select', options: [
        { value: 'scheduled', label: 'Scheduled' }, { value: 'final', label: 'Final (enter score)' },
        { value: 'postponed', label: 'Postponed' }, { value: 'cancelled', label: 'Cancelled' }] },
      { key: 'our_score', label: 'Falcons score', type: 'number', showIf: (r) => r.status === 'final' },
      { key: 'their_score', label: 'Opponent score', type: 'number', showIf: (r) => r.status === 'final' },
    ],
    prepare: (v) => {
      if (v.status === 'final' && (v.our_score == null || v.their_score == null)) throw new Error('Enter both scores for a final game.');
      if (v.status !== 'final') { v.our_score = null; v.their_score = null; }
      delete v.recap_article_id;
      return v;
    },
  };
  return <CrudPage config={config} />;
}

export function Polls() {
  const [tallies, setTallies] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(0);
  useEffect(() => { pollTallies().then(setTallies).catch(() => undefined); }, [tick]);
  const me = useMe();
  const config: CrudConfig<Poll> = {
    title: 'Polls', singular: 'poll', table: 'polls', orderBy: 'created_at', ascending: false, canEdit: me.isEditor,
    intro: 'The front page shows every active poll (newest first). Results update live as students vote.',
    defaults: () => ({ category: 'Campus Life', question: '', active: true, options: [newOption(), newOption()] }),
    columns: () => [
      { label: 'Question', render: (p) => <strong>{p.question}</strong> },
      { label: 'Options', render: (p) => <span class="muted small">{p.options.map((o) => o.label).join(' · ')}</span> },
      { label: 'Votes', render: (p) => tallies[p.id] ?? 0 },
      { label: 'Active', render: (p) => yesNo(p.active) },
    ],
    fields: [
      { key: 'question', label: 'Question', type: 'text', required: true, max: 250, full: true },
      { key: 'category', label: 'Label', type: 'text', max: 40, hint: 'A short tag like “Spirit Week”.' },
      { key: 'active', label: 'Show on the site', type: 'bool' },
      { key: 'options', label: 'Answers (2–8)', type: 'options' },
    ],
    prepare: (v) => {
      const options = (v.options as { id: string; label: string }[]).filter((o) => o.label.trim()).map((o) => ({ id: o.id, label: o.label.trim() }));
      if (options.length < 2) throw new Error('A poll needs at least two answers.');
      delete v.created_at; delete v.created_by;
      return { ...v, options };
    },
    extraActions: (p) => me.isEditor ? (
      <button class="btn btn-sm btn-ghost" title="Reset votes to zero" onClick={async () => {
        if (!confirm('Reset all votes for this poll to zero?')) return;
        try { await resetPoll(p.id); toast('Votes reset', 'ok'); setTick((t) => t + 1); } catch (e) { toastError(e); }
      }}><Icon name="refresh" size={14} /></button>
    ) : null,
  };
  return <CrudPage config={config} />;
}

export function Quotes() {
  const me = useMe();
  const config: CrudConfig<Quote> = {
    title: 'Daily Spark quotes', singular: 'quote', table: 'quotes', orderBy: 'sort_order', canEdit: me.isEditor,
    intro: 'These cycle in the banner at the top of every page. Double-check wording and attribution before adding.',
    defaults: () => ({ text: '', attribution: '', active: true, sort_order: 100 }),
    columns: () => [
      { label: 'Quote', render: (q) => <>“{clip(q.text, 110)}”</> },
      { label: 'Attribution', render: (q) => q.attribution },
      { label: 'Active', render: (q) => yesNo(q.active) },
      { label: 'Order', render: (q) => q.sort_order },
    ],
    fields: [
      { key: 'text', label: 'Quote', type: 'textarea', required: true, max: 400 },
      { key: 'attribution', label: 'Who said it', type: 'text', max: 200 },
      { key: 'sort_order', label: 'Order', type: 'number', hint: 'Lower numbers first.' },
      { key: 'active', label: 'Show on the site', type: 'bool' },
    ],
  };
  return <CrudPage config={config} />;
}

export function Notices() {
  const me = useMe();
  const config: CrudConfig<Announcement> = {
    title: 'Announcement bar', singular: 'announcement', table: 'announcements', orderBy: 'starts_at', ascending: false, canEdit: me.isEditor,
    intro: 'A gold banner shown above the masthead. Great for club meetings, deadlines and breaking news. The newest active one is shown.',
    defaults: () => ({ text: '', link_url: null, starts_at: new Date().toISOString(), ends_at: null, active: true }),
    columns: () => [
      { label: 'Message', render: (a) => clip(a.text, 100) },
      { label: 'Shows', render: (a) => <span class="small nowrap">{formatDateTime(a.starts_at)}{a.ends_at ? ` → ${formatDateTime(a.ends_at)}` : ''}</span> },
      { label: 'Active', render: (a) => yesNo(a.active) },
    ],
    fields: [
      { key: 'text', label: 'Message', type: 'text', required: true, max: 300, full: true },
      { key: 'link_url', label: 'Link (optional)', type: 'url', placeholder: 'https://… or #/article/…', full: true },
      { key: 'starts_at', label: 'Starts', type: 'datetime', required: true },
      { key: 'ends_at', label: 'Ends (optional)', type: 'datetime' },
      { key: 'active', label: 'Enabled', type: 'bool' },
    ],
  };
  return <CrudPage config={config} />;
}

export function Sections() {
  const config: CrudConfig<Section> = {
    title: 'Sections', singular: 'section', table: 'sections', key: 'id', orderBy: 'sort_order', canEdit: true, canDelete: false,
    intro: 'The sections in the navigation bar, with their sub-section dropdowns. Turn a section off to hide it (and its articles) from the menu without deleting anything.',
    defaults: () => ({ id: '', name: '', description: '', icon: 'newspaper', subsections: [], sort_order: 100, active: true }),
    columns: () => [
      { label: 'Name', render: (s) => <span class="row" style={{ '--gap': '8px' }}><Icon name={s.icon} size={16} /><strong>{s.name}</strong></span> },
      { label: 'Sub-sections', render: (s) => <span class="muted small">{s.subsections.join(' · ') || '—'}</span> },
      { label: 'In menu', render: (s) => yesNo(s.active) },
      { label: 'Order', render: (s) => s.sort_order },
    ],
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, max: 60 },
      { key: 'id', label: 'URL key', type: 'slug', required: true, createOnly: true, hint: 'Used in links (e.g. “sports”). Can’t be changed later.' },
      { key: 'description', label: 'Description', type: 'textarea', max: 300 },
      { key: 'subsections', label: 'Sub-sections (dropdown)', type: 'tags', full: true },
      { key: 'icon', label: 'Icon', type: 'select', options: ['newspaper', 'school', 'trophy', 'pen', 'masks', 'phone', 'camera', 'layout', 'megaphone', 'sparkles', 'heart', 'chart', 'video', 'users'].map((i) => ({ value: i, label: i })) },
      { key: 'sort_order', label: 'Order', type: 'number', hint: 'Lower numbers first.' },
      { key: 'active', label: 'Show in the menu / allow stories', type: 'bool', hint: 'Off = a behind-the-scenes team (like Layout + Design).' },
    ],
    prepare: (v, isNew) => { if (isNew && !v.id) v.id = slugify(String(v.name)); return v; },
  };
  return <CrudPage config={config} />;
}

export function StaffRoster() {
  const { sectionName } = useRefs();
  const config: CrudConfig<StaffMember> = {
    title: 'Staff roster', singular: 'staff member', table: 'staff_members', orderBy: 'sort_order', canEdit: true,
    intro: 'Everyone listed on “Meet the newsroom”, and who can be credited in a byline. This is separate from login accounts — people can appear here without an account.',
    defaults: () => ({ name: '', slug: '', title: 'Staff Writer', sections: [], lead_of: [], bio: '', photo_url: null, active: true, sort_order: 1000 }),
    columns: () => [
      { label: 'Name', render: (p) => <strong>{p.name}</strong> },
      { label: 'Title', render: (p) => p.title },
      { label: 'Teams', render: (p) => <span class="small">{p.sections.map((s) => (p.lead_of.includes(s) ? `★ ${sectionName(s)}` : sectionName(s))).join(' · ') || '—'}</span> },
      { label: 'Listed', render: (p) => yesNo(p.active) },
    ],
    fields: [
      { key: 'name', label: 'Full name', type: 'text', required: true, max: 120 },
      { key: 'title', label: 'Title', type: 'text', max: 120, hint: 'e.g. Section Leader, Staff Writer, Photographer.' },
      { key: 'sections', label: 'Teams', type: 'sections', includeHidden: true },
      { key: 'lead_of', label: 'Leads (★)', type: 'sections', includeHidden: true, hint: 'Check the teams this person leads.' },
      { key: 'bio', label: 'Bio', type: 'textarea', max: 2000 },
      { key: 'photo_url', label: 'Photo', type: 'image' },
      { key: 'sort_order', label: 'Order', type: 'number', hint: 'Lower numbers first within a team.' },
      { key: 'active', label: 'Listed on the site', type: 'bool' },
    ],
    prepare: (v, isNew) => {
      const name = String(v.name).trim();
      v.name = name;
      if (isNew || !v.slug) v.slug = slugify(name);
      delete v.created_at;
      return v;
    },
    extraActions: () => null,
  };
  return <CrudPage config={config} />;
}

