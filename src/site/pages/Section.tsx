import { href } from '@/lib/router';
import { Empty } from '@/ui/States';
import { useNews } from '../data';
import { ArticleCard } from '../components/ArticleParts';
import { Scoreboard } from '../components/Scoreboard';
import { Icon } from '@/ui/Icon';
import { NotFound } from './NotFound';

export function SectionPage({ id, sub }: { id: string; sub?: string }) {
  const { sectionById, articles, loading } = useNews();
  const section = sectionById.get(id);
  if (!section) return loading ? <p class="muted">Loading…</p> : <NotFound />;
  const inSection = articles.filter((a) => a.section_id === id);
  const items = sub ? inSection.filter((a) => a.subsection === sub) : inSection;
  return (
    <div class="stack" style={{ '--stack': '28px' }}>
      <header class="page-head">
        <span class="eyebrow"><Icon name={section.icon} size={14} /> Section</span>
        <h1>{section.name}{sub ? <span class="sub"> / {sub}</span> : null}</h1>
        <p class="muted">{section.description}</p>
        {section.subsections.length > 0 && (
          <nav class="chips" aria-label={`${section.name} sub-sections`}>
            <a class={`chip ${!sub ? 'on' : ''}`} href={href(`/section/${id}`)}>All</a>
            {section.subsections.map((s) => (
              <a key={s} class={`chip ${sub === s ? 'on' : ''}`} href={href(`/section/${id}/${encodeURIComponent(s)}`)}>{s}</a>
            ))}
          </nav>
        )}
      </header>
      <div class={id === 'sports' ? 'split' : ''}>
        {items.length ? (
          <div class="card-grid">{items.map((a, i) => <ArticleCard key={a.id} article={a} eager={i < 3} />)}</div>
        ) : (
          <Empty title={sub ? `No ${sub} stories yet` : `No ${section.name} stories yet`}>
            Our team is working on it. <a href={href('/')}>Back to the front page</a>
          </Empty>
        )}
        {id === 'sports' && <aside><Scoreboard limit={8} /></aside>}
      </div>
    </div>
  );
}
