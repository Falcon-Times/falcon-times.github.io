import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatDateTime, timeAgo } from '@/lib/format';
import { href } from '@/lib/router';
import type { ArticleStatus } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { Empty, ErrorNote, Loading } from '@/ui/States';
import { toast, toastError } from '@/ui/Toast';
import { listArticles, setArticleFlags, type ArticleListItem } from '../api';
import { useMe } from '../auth';
import { useRefs } from '../refs';

export const STATUS_LABEL: Record<ArticleStatus, string> = { draft: 'Draft', submitted: 'In review', published: 'Published', archived: 'Archived' };
export const STATUS_BADGE: Record<ArticleStatus, string> = { draft: '', submitted: 'badge-warn', published: 'badge-ok', archived: 'badge-bad' };
type Tab = 'all' | ArticleStatus;

export function Articles() {
  const me = useMe();
  const { sections, sectionName, personName } = useRefs();
  const [rows, setRows] = useState<ArticleListItem[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [tab, setTab] = useState<Tab>(me.isEditor ? 'submitted' : 'all');
  const [section, setSection] = useState('');
  const [q, setQ] = useState('');
  const [tick, setTick] = useState(0);
  useEffect(() => {
    listArticles().then((r) => {
      setRows(r);
      // Start on the review queue only when there is something in it.
      if (tick === 0 && me.isEditor && !r.some((a) => a.status === 'submitted')) setTab('all');
    }).catch(setError);
  }, [tick]);

  // RLS lets everyone read published stories; here we narrow to "my work".
  const mine = useMemo(() => (rows ?? []).filter((a) =>
    me.isAdmin || a.created_by === me.userId || (me.isEditor && me.profile.sections.includes(a.section_id))), [rows, me]);
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: mine.length };
    for (const a of mine) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [mine]);
  const shown = mine.filter((a) =>
    (tab === 'all' || a.status === tab) && (!section || a.section_id === section) &&
    (!q || a.title.toLowerCase().includes(q.toLowerCase())));

  async function flag(a: ArticleListItem, patch: Parameters<typeof setArticleFlags>[1], msg: string) {
    try { await setArticleFlags(a.id, patch); toast(msg, 'ok'); setTick((t) => t + 1); } catch (e) { toastError(e); }
  }
  const canEditorial = (a: ArticleListItem) => me.isAdmin || (me.isEditor && me.profile.sections.includes(a.section_id));

  return (
    <div class="stack" style={{ '--stack': '18px' }}>
      <div class="spread">
        <h1 class="page-title">{me.isEditor ? 'Stories' : 'My stories'}</h1>
        <a class="btn btn-primary" href={href('/articles/new')}><Icon name="plus" size={16} /> New story</a>
      </div>
      <div class="toolbar">
        <div class="tabs-pill" role="tablist">
          {(['all', 'submitted', 'draft', 'published', 'archived'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} class={`pill ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
              {t === 'all' ? 'All' : STATUS_LABEL[t]} <span class="count">{counts[t] ?? 0}</span>
            </button>
          ))}
        </div>
        <div class="row">
          <select class="select select-sm" value={section} onChange={(e) => setSection((e.target as HTMLSelectElement).value)} aria-label="Filter by section">
            <option value="">All sections</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input class="input select-sm" type="search" placeholder="Search headlines…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Search headlines" />
        </div>
      </div>
      {error ? <ErrorNote error={error} /> : !rows ? <Loading /> : shown.length === 0 ? (
        <Empty icon="file" title={tab === 'submitted' ? 'Nothing waiting for review' : 'No stories here yet'}>
          {tab === 'submitted' ? 'When writers submit stories in your sections they will show up here.' : <>Start something new with <a href={href('/articles/new')}>New story</a>.</>}
        </Empty>
      ) : (
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Headline</th><th>Section</th><th>Status</th><th>Author</th><th>Edited</th><th class="col-actions"><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {shown.map((a) => (
                <tr key={a.id}>
                  <td>
                    <a class="row-title" href={href(`/articles/${a.id}`)}>{a.title || 'Untitled story'}</a>
                    <div class="row small" style={{ '--gap': '6px' }}>
                      {a.is_lead && <span class="badge badge-gold"><Icon name="star" size={11} /> Lead</span>}
                      {a.featured && <span class="badge badge-info"><Icon name="flame" size={11} /> Trending pick</span>}
                      {a.status === 'published' && a.published_at && new Date(a.published_at) > new Date() && <span class="badge badge-warn"><Icon name="clock" size={11} /> Scheduled</span>}
                    </div>
                  </td>
                  <td>{sectionName(a.section_id)}</td>
                  <td><span class={`badge ${STATUS_BADGE[a.status]}`}>{STATUS_LABEL[a.status]}</span></td>
                  <td>{personName(a.created_by)}</td>
                  <td title={formatDateTime(a.last_edited_at)} class="nowrap">{timeAgo(a.last_edited_at)}</td>
                  <td class="col-actions">
                    <div class="row" style={{ '--gap': '4px', 'justify-content': 'flex-end', 'flex-wrap': 'nowrap' }}>
                      {canEditorial(a) && a.status === 'published' && (
                        <>
                          <button class="btn btn-sm btn-ghost" title={a.featured ? 'Remove from trending picks' : 'Pin to the trending carousel'} onClick={() => flag(a, { featured: !a.featured }, a.featured ? 'Removed from trending picks' : 'Pinned to trending')}><Icon name="flame" size={14} /></button>
                          <button class="btn btn-sm btn-ghost" title={a.is_lead ? 'Currently the lead story' : 'Make this the lead story'} disabled={a.is_lead} onClick={() => flag(a, { is_lead: true }, 'Now the lead story')}><Icon name="star" size={14} /></button>
                        </>
                      )}
                      {a.status === 'published' && <a class="btn btn-sm btn-ghost" href={`/#/article/${a.slug}`} target="_blank" rel="noopener" title="View on the site"><Icon name="external" size={14} /></a>}
                      <a class="btn btn-sm" href={href(`/articles/${a.id}`)}><Icon name="pencil" size={13} /> Open</a>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
