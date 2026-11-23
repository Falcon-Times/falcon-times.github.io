import type { ArticleSummary, Section, StaffMember } from '@/lib/types';
import { formatDateTime, formatDate } from '@/lib/format';
import { href } from '@/lib/router';
import { Icon } from '@/ui/Icon';
import { useNews } from '../data';

const hueOf = (id: string) => [...id].reduce((n, c) => n + c.charCodeAt(0), 0) % 6;

/** Cover photo, or an on-brand typographic placeholder when there isn't one. */
export function Cover({ article, section, class: cls = '', eager = false }: {
  article: Pick<ArticleSummary, 'cover_image_url' | 'image_alt' | 'title' | 'section_id'>; section?: Section; class?: string; eager?: boolean;
}) {
  return (
    <div class={`cover ${cls}`}>
      {article.cover_image_url ? (
        <img src={article.cover_image_url} alt={article.image_alt} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      ) : (
        <div class={`cover-ph ph-${hueOf(article.section_id)}`} aria-hidden="true">
          <Icon name={section?.icon ?? 'newspaper'} size={44} strokeWidth={1.25} />
          <span>The Falcon Times</span>
        </div>
      )}
    </div>
  );
}

export function bylineStaff(article: Pick<ArticleSummary, 'byline_ids'>, staffById: Map<string, StaffMember>): StaffMember[] {
  return article.byline_ids.map((id) => staffById.get(id)).filter((s): s is StaffMember => Boolean(s));
}

export function Byline({ article, link = true }: { article: Pick<ArticleSummary, 'byline_ids'>; link?: boolean }) {
  const { staffById } = useNews();
  const people = bylineStaff(article, staffById);
  if (people.length === 0) return <span class="byline">The Falcon Times Staff</span>;
  return (
    <span class="byline">
      By{' '}
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && (i === people.length - 1 ? ' & ' : ', ')}
          {link ? <a href={href(`/staff/${p.slug}`)}>{p.name}</a> : p.name}
        </span>
      ))}
    </span>
  );
}

export function SectionTag({ article }: { article: Pick<ArticleSummary, 'section_id' | 'subsection'> }) {
  const { sectionById } = useNews();
  const section = sectionById.get(article.section_id);
  if (!section) return null;
  return (
    <span class="tag-line">
      <a href={href(`/section/${section.id}`)}>{section.name}</a>
      {article.subsection && <span class="muted"> · {article.subsection}</span>}
    </span>
  );
}

/** Publication stamp, plus a clear notice if the story has been updated. */
export function Stamp({ article, full = false }: { article: Pick<ArticleSummary, 'published_at' | 'updated_at' | 'update_note'>; full?: boolean }) {
  if (!article.published_at) return null;
  return (
    <div class="stamp">
      <span class="stamp-line">
        <Icon name="clock" size={14} />
        <time dateTime={article.published_at}>{full ? `Published ${formatDateTime(article.published_at)}` : formatDate(article.published_at)}</time>
        {!full && article.updated_at && <span class="badge badge-warn">Updated</span>}
      </span>
      {full && article.updated_at && (
        <p class="update-note" role="note">
          <Icon name="refresh" size={15} />
          <span>
            <strong>Updated {formatDateTime(article.updated_at)}</strong>
            {article.update_note ? ` — ${article.update_note}` : ''}
          </span>
        </p>
      )}
    </div>
  );
}

export function ArticleCard({ article, variant = 'default', eager = false }: {
  article: ArticleSummary; variant?: 'default' | 'compact' | 'wide'; eager?: boolean;
}) {
  const { sectionById } = useNews();
  const section = sectionById.get(article.section_id);
  const url = href(`/article/${article.slug}`);
  return (
    <article class={`card card-${variant}`}>
      <a class="card-cover" href={url} tabIndex={-1} aria-hidden="true">
        <Cover article={article} section={section} eager={eager} />
      </a>
      <div class="card-body">
        <SectionTag article={article} />
        <h3 class="card-title"><a href={url}>{article.title}</a></h3>
        {variant !== 'compact' && article.deck && <p class="card-deck clamp-3">{article.deck}</p>}
        <div class="card-meta"><Byline article={article} /><Stamp article={article} /></div>
      </div>
    </article>
  );
}
