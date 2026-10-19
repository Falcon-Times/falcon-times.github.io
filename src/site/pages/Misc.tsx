import { useMemo, useState } from 'preact/hooks';
import { navigate } from '@/lib/router';
import { Empty } from '@/ui/States';
import { Icon } from '@/ui/Icon';
import { useNews } from '../data';
import { ArticleCard } from '../components/ArticleParts';
import { Scoreboard } from '../components/Scoreboard';
import { openTipLine } from '../components/Tip';

export function SearchPage({ query }: { query: string }) {
  const { articles, staffById, sectionById } = useNews();
  const [q, setQ] = useState(query);
  const results = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return articles;
    return articles.filter((a) => {
      const hay = [
        a.title, a.deck, a.subsection ?? '', sectionById.get(a.section_id)?.name ?? '', a.tags.join(' '),
        a.byline_ids.map((id) => staffById.get(id)?.name ?? '').join(' '),
      ].join(' ').toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [query, articles, staffById, sectionById]);
  return (
    <div class="stack" style={{ '--stack': '24px' }}>
      <header class="page-head">
        <span class="eyebrow">Search</span>
        <h1>{query ? `Results for “${query}”` : 'All stories'}</h1>
        <form class="search search-big" role="search" onSubmit={(e) => { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}>
          <Icon name="search" size={16} />
          <input type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Search by headline, writer, section or tag" aria-label="Search stories" />
          <button class="btn btn-primary btn-sm" type="submit">Search</button>
        </form>
      </header>
      {results.length ? <div class="card-grid">{results.map((a) => <ArticleCard key={a.id} article={a} />)}</div>
        : <Empty icon="search" title="No stories matched">Try a different word, or browse a section from the menu.</Empty>}
    </div>
  );
}

export function ScoresPage() {
  return (
    <div class="stack" style={{ '--stack': '24px' }}>
      <header class="page-head"><span class="eyebrow">Athletics</span><h1>Scores &amp; schedule</h1></header>
      <div style={{ maxWidth: '720px' }}><Scoreboard full /></div>
    </div>
  );
}

export function AboutPage() {
  const { site, sections } = useNews();
  const s = site.settings;
  return (
    <div class="stack about" style={{ '--stack': '28px' }}>
      <header class="page-head"><span class="eyebrow">About</span><h1>About {s.site.name}</h1></header>
      <div class="prose" style={{ maxWidth: '68ch' }}>
        <p>{s.site.name} is the student newspaper of {s.site.school}, produced by the {s.site.school} Newspaper Club. Our reporters, photographers, designers and social media team work in {sections.length} sections to cover school news, sports, opinion and advice, culture and entertainment, social media and photo/video.</p>
        <h2>Our standards</h2>
        <ul>{s.standards.points.map((p) => <li key={p}>{p}</li>)}</ul>
        <h2>Get in touch</h2>
        <p>
          The fastest way to reach our editors is the <a href="#tip" onClick={(e) => { e.preventDefault(); openTipLine(); }}>tip line</a>, which can be anonymous.
          {s.contact.email && <> You can also email <a href={`mailto:${s.contact.email}`}>{s.contact.email}</a>.</>}
        </p>
        <p>{s.site.school} · {s.site.address}</p>
      </div>
    </div>
  );
}
