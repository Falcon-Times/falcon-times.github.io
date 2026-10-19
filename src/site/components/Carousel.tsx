import { useRef } from 'preact/hooks';
import type { ArticleSummary } from '@/lib/types';
import { href } from '@/lib/router';
import { Icon } from '@/ui/Icon';
import { useNews } from '../data';
import { Byline, Cover, SectionTag, Stamp } from './ArticleParts';

/** Scroll-snap carousel: swipeable on phones, arrow buttons on desktop. */
export function TrendingCarousel({ items }: { items: ArticleSummary[] }) {
  const track = useRef<HTMLUListElement>(null);
  const { sectionById } = useNews();
  const scroll = (dir: number) => {
    const el = track.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.85, 260), behavior: 'smooth' });
  };
  if (items.length === 0) return null;
  return (
    <section class="panel trending" aria-labelledby="trending-h">
      <div class="panel-head">
        <div>
          <span class="eyebrow"><Icon name="flame" size={14} /> Pulse of the hallways</span>
          <h2 id="trending-h">Trending at AHS</h2>
        </div>
        <div class="row" style={{ '--gap': '6px' }}>
          <button class="btn btn-icon" onClick={() => scroll(-1)} aria-label="Previous stories"><Icon name="arrow-left" size={16} /></button>
          <button class="btn btn-icon" onClick={() => scroll(1)} aria-label="Next stories"><Icon name="arrow-right" size={16} /></button>
        </div>
      </div>
      <ul class="carousel" ref={track} tabIndex={0} aria-label="Trending stories, scrollable">
        {items.map((a, i) => (
          <li key={a.id} class="carousel-item">
            <article class="card card-trend">
              <a class="card-cover" href={href(`/article/${a.slug}`)} tabIndex={-1} aria-hidden="true">
                <Cover article={a} section={sectionById.get(a.section_id)} />
                <span class="rank">{i + 1}</span>
              </a>
              <div class="card-body">
                <SectionTag article={a} />
                <h3 class="card-title clamp-3"><a href={href(`/article/${a.slug}`)}>{a.title}</a></h3>
                <div class="card-meta"><Byline article={a} /><Stamp article={a} /></div>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
