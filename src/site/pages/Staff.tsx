import { href } from '@/lib/router';
import { Avatar } from '@/ui/Avatar';
import { Empty } from '@/ui/States';
import { plural } from '@/lib/format';
import type { StaffMember } from '@/lib/types';
import { useNews } from '../data';
import { ArticleCard } from '../components/ArticleParts';
import { NotFound } from './NotFound';

function PersonCard({ p }: { p: StaffMember }) {
  const { articles } = useNews();
  const count = articles.filter((a) => a.byline_ids.includes(p.id)).length;
  return (
    <li>
      <a class="person" href={href(`/staff/${p.slug}`)}>
        <Avatar name={p.name} src={p.photo_url} size={52} />
        <div class="grow">
          <strong class="person-name">{p.name}</strong>
          <div class="small muted">{p.title}</div>
          {count > 0 && <div class="small">{plural(count, 'story', 'stories')}</div>}
        </div>
      </a>
    </li>
  );
}

export function StaffPage() {
  const { allSections, staff } = useNews();
  const groups = allSections
    .map((s) => ({ section: s, people: staff.filter((p) => p.sections.includes(s.id)).sort((a, b) => Number(b.lead_of.includes(s.id)) - Number(a.lead_of.includes(s.id)) || a.sort_order - b.sort_order) }))
    .filter((g) => g.people.length > 0);
  const ungrouped = staff.filter((p) => p.sections.length === 0);
  return (
    <div class="stack" style={{ '--stack': '32px' }}>
      <header class="page-head">
        <span class="eyebrow">Masthead</span>
        <h1>Meet the newsroom</h1>
        <p class="muted">The students behind every story, photo, post and pixel. Click a name to read their profile and latest work.</p>
      </header>
      {groups.length === 0 && <Empty icon="users" title="The staff list is coming soon" />}
      {groups.map(({ section, people }) => (
        <section key={section.id} aria-labelledby={`team-${section.id}`}>
          <div class="section-head"><h2 id={`team-${section.id}`}>{section.name}</h2></div>
          <ul class="people">{people.map((p) => <PersonCard key={`${section.id}-${p.id}`} p={p} />)}</ul>
        </section>
      ))}
      {ungrouped.length > 0 && (
        <section><div class="section-head"><h2>Contributors</h2></div><ul class="people">{ungrouped.map((p) => <PersonCard key={p.id} p={p} />)}</ul></section>
      )}
    </div>
  );
}

export function StaffMemberPage({ slug }: { slug: string }) {
  const { staff, articles, sectionById, loading } = useNews();
  const p = staff.find((s) => s.slug === slug);
  if (!p) return loading ? <p class="muted">Loading…</p> : <NotFound />;
  const mine = articles.filter((a) => a.byline_ids.includes(p.id));
  return (
    <div class="stack" style={{ '--stack': '32px' }}>
      <header class="profile">
        <Avatar name={p.name} src={p.photo_url} size={112} />
        <div class="stack" style={{ '--stack': '8px' }}>
          <span class="eyebrow">{p.title}</span>
          <h1>{p.name}</h1>
          <div class="row">
            {p.sections.map((id) => sectionById.get(id)).filter(Boolean).map((s) => (
              <a key={s!.id} class="chip" href={s!.active ? href(`/section/${s!.id}`) : undefined}>
                {p.lead_of.includes(s!.id) ? `${s!.name} leader` : s!.name}
              </a>
            ))}
          </div>
          <p class="profile-bio">{p.bio || 'This writer’s bio is coming soon.'}</p>
        </div>
      </header>
      <section aria-labelledby="work-h">
        <div class="section-head"><h2 id="work-h">Stories by {p.name.split(' ')[0]}</h2></div>
        {mine.length ? <div class="card-grid">{mine.map((a) => <ArticleCard key={a.id} article={a} variant="compact" />)}</div>
          : <Empty title="No published stories yet">When {p.name.split(' ')[0]} publishes, their work will appear here.</Empty>}
      </section>
    </div>
  );
}
