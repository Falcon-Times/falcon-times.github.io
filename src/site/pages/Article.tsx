import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadArticle, recordView } from '@/lib/api';
import { readingMinutes } from '@/lib/format';
import { renderMarkdown } from '@/lib/markdown';
import { href } from '@/lib/router';
import { safeStorage } from '@/lib/store';
import type { Article } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { ErrorNote, Loading } from '@/ui/States';
import { toast } from '@/ui/Toast';
import { useNews } from '../data';
import { ArticleCard, Byline, SectionTag, Stamp, bylineStaff } from '../components/ArticleParts';
import { Avatar } from '@/ui/Avatar';
import { openTipLine } from '../components/Tip';
import { NotFound } from './NotFound';

const seen = safeStorage('session');

export function ArticleView({ article, preview = false }: { article: Article; preview?: boolean }) {
  const { staffById, articles } = useNews();
  const html = useMemo(() => renderMarkdown(article.body_md), [article.body_md]);
  const people = bylineStaff(article, staffById);
  const related = articles.filter((a) => a.section_id === article.section_id && a.id !== article.id).slice(0, 3);
  const caption = [article.image_caption, article.photo_credit && `Photo: ${article.photo_credit}`].filter(Boolean).join(' · ');

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: article.title, url });
      else { await navigator.clipboard.writeText(url); toast('Link copied to clipboard', 'ok'); }
    } catch { /* user cancelled */ }
  }

  return (
    <article class="article">
      <header class="article-head">
        <SectionTag article={article} />
        <h1>{article.title || 'Untitled story'}</h1>
        {article.deck && <p class="article-deck">{article.deck}</p>}
        <div class="article-meta">
          <div class="stack" style={{ '--stack': '6px' }}>
            <Byline article={article} />
            <Stamp article={article.published_at ? article : { ...article, published_at: new Date().toISOString() }} full />
          </div>
          <div class="row">
            <span class="badge"><Icon name="clock" size={12} /> {readingMinutes(article.body_md)} min read</span>
            {!preview && <button class="btn btn-sm" onClick={share}><Icon name="share" size={14} /> Share</button>}
          </div>
        </div>
      </header>

      {article.cover_image_url && (
        <figure class="article-figure">
          <img src={article.cover_image_url} alt={article.image_alt} decoding="async" />
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
      )}

      <div class="prose" dangerouslySetInnerHTML={{ __html: html }} />

      {article.tags.length > 0 && (
        <ul class="row tags" aria-label="Tags">
          {article.tags.map((t) => <li key={t}><a class="chip" href={href(`/search?q=${encodeURIComponent(t)}`)}>#{t}</a></li>)}
        </ul>
      )}

      {people.length > 0 && (
        <div class="authors">
          {people.map((p) => (
            <a key={p.id} class="author" href={preview ? undefined : href(`/staff/${p.slug}`)}>
              <Avatar name={p.name} src={p.photo_url} size={48} />
              <div><strong>{p.name}</strong><div class="small muted">{p.title}</div>{p.bio && <p class="small clamp-2">{p.bio}</p>}</div>
            </a>
          ))}
        </div>
      )}

      {!preview && (
        <aside class="feedback">
          <div>
            <strong><Icon name="message" size={16} /> Have a response or spotted a mistake?</strong>
            <p class="small muted">We don’t run open comment sections. Send a Letter to the Editor or a correction through our tip line — anonymous is fine.</p>
          </div>
          <button class="btn btn-primary" onClick={openTipLine}>Send feedback</button>
        </aside>
      )}

      {!preview && related.length > 0 && (
        <section class="related" aria-labelledby="related-h">
          <div class="section-head"><h2 id="related-h">More from this section</h2></div>
          <div class="card-grid">{related.map((a) => <ArticleCard key={a.id} article={a} variant="compact" />)}</div>
        </section>
      )}
    </article>
  );
}

export function ArticlePage({ slug }: { slug: string }) {
  const [article, setArticle] = useState<Article | null | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const { site } = useNews();

  useEffect(() => {
    let alive = true;
    setArticle(undefined);
    setError(null);
    loadArticle(slug)
      .then((a) => {
        if (!alive) return;
        setArticle(a);
        if (a && !seen.get(`viewed:${a.id}`, false)) {
          seen.set(`viewed:${a.id}`, true);
          recordView(a.id).catch(() => undefined);
        }
      })
      .catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [slug]);

  useEffect(() => {
    if (article) document.title = `${article.title} | ${site.settings.site.name}`;
    return () => { document.title = site.settings.site.name; };
  }, [article, site.settings.site.name]);

  if (error) return <ErrorNote error={error} />;
  if (article === undefined) return <Loading label="Loading story…" />;
  if (article === null) return <NotFound />;
  return <ArticleView article={article} />;
}
