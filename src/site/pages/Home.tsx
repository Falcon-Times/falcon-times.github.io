import { href } from '@/lib/router';
import { Icon } from '@/ui/Icon';
import { Avatar } from '@/ui/Avatar';
import { Empty } from '@/ui/States';
import { useNews } from '../data';
import { ArticleCard, Byline, Cover, SectionTag, Stamp } from '../components/ArticleParts';
import { TrendingCarousel } from '../components/Carousel';
import { PollCard } from '../components/PollCard';
import { Scoreboard } from '../components/Scoreboard';
import { TipCard } from '../components/Tip';

export function Home() {
  const { lead, trending, articles, sections, sectionById, staff, site, loading } = useNews();
  const leadSection = lead ? sectionById.get(lead.section_id) : undefined;
  const rest = articles.filter((a) => a.id !== lead?.id);
  const latest = rest.slice(0, 6);

  return (
    <div class="stack page-home" style={{ '--stack': '40px' }}>
      <section class="hero">
        {lead ? (
          <article class="lead">
            <a class="lead-cover" href={href(`/article/${lead.slug}`)} tabIndex={-1} aria-hidden="true">
              <Cover article={lead} section={leadSection} class="cover-lead" eager />
              <span class="badge badge-gold lead-flag"><Icon name="star" size={12} /> Lead story</span>
            </a>
            <div class="lead-body">
              <SectionTag article={lead} />
              <h2 class="lead-title"><a href={href(`/article/${lead.slug}`)}>{lead.title}</a></h2>
              {lead.deck && <p class="lead-deck">{lead.deck}</p>}
              <div class="lead-foot">
                <div class="stack" style={{ '--stack': '4px' }}><Byline article={lead} /><Stamp article={lead} full /></div>
                <a class="btn btn-primary" href={href(`/article/${lead.slug}`)}>Read the story <Icon name="arrow-right" size={16} /></a>
              </div>
            </div>
          </article>
        ) : (
          <div class="lead"><div class="lead-body">{loading ? <p class="muted">Loading the front page…</p> : <Empty title="No stories yet">Our reporters are hard at work. Check back soon!</Empty>}</div></div>
        )}
        <aside class="hero-side"><Scoreboard limit={5} /></aside>
      </section>

      <TrendingCarousel items={trending} />

      <div class="split">
        <section aria-labelledby="latest-h" class="stack" style={{ '--stack': '20px' }}>
          <div class="section-head"><h2 id="latest-h">Latest stories</h2></div>
          {latest.length ? (
            <div class="card-grid">{latest.map((a) => <ArticleCard key={a.id} article={a} />)}</div>
          ) : (
            <Empty title="Fresh stories coming soon">Our first reporters are hard at work. In the meantime, say hi through the tip line!</Empty>
          )}
          {rest.length > 6 && <a class="btn" href={href('/search?q=')}>Browse all stories <Icon name="arrow-right" size={16} /></a>}
        </section>
        <aside class="stack side" style={{ '--stack': '24px' }}>
          <PollCard />
          {site.settings.hotline.enabled && <TipCard />}
          <section class="panel standards">
            <h2><Icon name="shield-check" size={18} /> Our standards</h2>
            <ul class="ticks">{site.settings.standards.points.map((p) => <li key={p}><Icon name="check" size={15} />{p}</li>)}</ul>
          </section>
        </aside>
      </div>

      {sections.map((s) => {
        const items = articles.filter((a) => a.section_id === s.id).slice(0, 3);
        if (items.length === 0) return null;
        return (
          <section key={s.id} aria-labelledby={`sec-${s.id}`}>
            <div class="section-head">
              <h2 id={`sec-${s.id}`}><Icon name={s.icon} size={20} /> {s.name}</h2>
              <a href={href(`/section/${s.id}`)} class="more">More {s.name} <Icon name="arrow-right" size={14} /></a>
            </div>
            <div class="card-grid">{items.map((a) => <ArticleCard key={a.id} article={a} variant="compact" />)}</div>
          </section>
        );
      })}

      <section class="panel meet" aria-labelledby="meet-h">
        <div class="panel-head">
          <div><span class="eyebrow">Masthead</span><h2 id="meet-h">Meet our section leaders</h2></div>
          <a class="btn" href={href('/staff')}>Full staff <Icon name="arrow-right" size={16} /></a>
        </div>
        <ul class="leaders">
          {staff.filter((p) => p.lead_of.length > 0).map((p) => (
            <li key={p.id}>
              <a href={href(`/staff/${p.slug}`)} class="leader">
                <Avatar name={p.name} src={p.photo_url} size={56} />
                <strong>{p.name}</strong>
                <span class="small muted">{p.lead_of.map((id) => sectionById.get(id)?.name).filter(Boolean).join(' · ')}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
