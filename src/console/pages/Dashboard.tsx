import { useEffect, useState } from 'preact/hooks';
import { timeAgo } from '@/lib/format';
import { href } from '@/lib/router';
import { Icon } from '@/ui/Icon';
import { listArticles, countTable, countWhere, type ArticleListItem } from '../api';
import { useMe } from '../auth';
import { useRefs } from '../refs';
import { STATUS_BADGE, STATUS_LABEL } from './Articles';

function Stat({ label, value, icon, to, tone }: { label: string; value: number | string; icon: string; to?: string; tone?: string }) {
  const body = (
    <>
      <span class={`stat-icon ${tone ?? ''}`}><Icon name={icon} size={20} /></span>
      <div><div class="stat-num">{value}</div><div class="stat-label">{label}</div></div>
    </>
  );
  return to ? <a class="stat" href={href(to)}>{body}</a> : <div class="stat">{body}</div>;
}

export function Dashboard({ admin = false }: { admin?: boolean }) {
  const me = useMe();
  const { sectionName } = useRefs();
  const [articles, setArticles] = useState<ArticleListItem[] | null>(null);
  const [newTips, setNewTips] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<number | null>(null);
  useEffect(() => {
    listArticles().then(setArticles).catch(() => setArticles([]));
    if (admin) countTable('profiles').then(setAccounts).catch(() => undefined);
    if (me.isEditor) countWhere('tips', 'status', 'new').then(setNewTips).catch(() => setNewTips(null));
  }, []);

  const mine = (articles ?? []).filter((a) => me.isAdmin || a.created_by === me.userId || (me.isEditor && me.profile.sections.includes(a.section_id)));
  const by = (s: string) => mine.filter((a) => a.status === s).length;
  const weekAgo = Date.now() - 7 * 864e5;
  const recent = mine.slice(0, 6);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div class="stack" style={{ '--stack': '22px' }}>
      <div>
        <h1 class="page-title">{greeting}, {(me.profile.display_name || 'there').split(' ')[0]} 👋</h1>
        <p class="muted">{admin ? 'Here’s the state of the newsroom.' : me.isEditor ? 'Here’s what’s on your desk.' : 'Ready to write something great?'}</p>
      </div>
      <div class="stats">
        {me.isEditor && <Stat label="Waiting for review" value={articles ? by('submitted') : '…'} icon="inbox" to="/articles" tone="warn" />}
        <Stat label="My drafts" value={articles ? mine.filter((a) => a.status === 'draft' && (a.created_by === me.userId || me.isEditor)).length : '…'} icon="pencil" to="/articles" />
        <Stat label="Published this week" value={articles ? mine.filter((a) => a.status === 'published' && a.published_at && new Date(a.published_at).getTime() > weekAgo).length : '…'} icon="newspaper" />
        {me.isEditor && <Stat label="New tips" value={newTips ?? '…'} icon="megaphone" to="/tips" tone="gold" />}
        {admin && <Stat label="Accounts" value={accounts ?? '…'} icon="users" to="/people" />}
      </div>

      <div class="dash-grid">
        <section class="card-box stack" style={{ '--stack': '12px' }}>
          <div class="spread"><h2 class="h3">Recent stories</h2><a class="btn btn-sm btn-primary" href={href('/articles/new')}><Icon name="plus" size={14} /> New story</a></div>
          {articles === null ? <p class="muted">Loading…</p> : recent.length === 0 ? <p class="muted">No stories yet — your first one is a click away.</p> : (
            <ul class="list">
              {recent.map((a) => (
                <li key={a.id}>
                  <a href={href(`/articles/${a.id}`)}>
                    <span class="grow"><strong>{a.title || 'Untitled story'}</strong><span class="small muted"> · {sectionName(a.section_id)} · {timeAgo(a.last_edited_at)}</span></span>
                    <span class={`badge ${STATUS_BADGE[a.status]}`}>{STATUS_LABEL[a.status]}</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section class="card-box stack" style={{ '--stack': '10px' }}>
          <h2 class="h3">Quick guide</h2>
          <ul class="ticks small">
            <li><Icon name="check" size={14} /> <span>Write in plain text — use <code>##</code> for subheads and <code>**bold**</code>.</span></li>
            <li><Icon name="check" size={14} /> <span>Add a cover photo with a description and credit.</span></li>
            <li><Icon name="check" size={14} /> <span>{me.isEditor ? 'Publish when ready — or schedule it for later.' : 'Submit for review when you’re done; your section leader will publish it.'}</span></li>
            <li><Icon name="check" size={14} /> <span>Fix something after publishing? Add an update notice so readers know.</span></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
