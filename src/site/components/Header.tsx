import { useEffect, useState } from 'preact/hooks';
import { formatToday } from '@/lib/format';
import { href, navigate, type Route } from '@/lib/router';
import { safeStorage } from '@/lib/store';
import { Icon } from '@/ui/Icon';
import { Logo } from '@/ui/Logo';
import { useNews } from '../data';
import { openTipLine } from './Tip';
import { Weather } from './Weather';

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function QuoteTicker() {
  const { site } = useNews();
  const quotes = site.quotes;
  const [i, setI] = useState(() => (quotes.length ? Math.floor(Math.random() * quotes.length) : 0));
  const [paused, setPaused] = useState(() => prefersReducedMotion());
  useEffect(() => {
    if (paused || quotes.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % quotes.length), 8000);
    return () => clearInterval(t);
  }, [paused, quotes.length]);
  if (quotes.length === 0) return <div class="grow" />;
  const q = quotes[i % quotes.length];
  return (
    <div class="ticker grow" aria-label="Quote of the moment">
      <span class="ticker-label"><Icon name="sparkles" size={12} /> Daily spark</span>
      <p class="ticker-text" key={q.id} aria-live={paused ? 'polite' : 'off'}>
        “{q.text}” {q.attribution && <span class="ticker-by">— {q.attribution}</span>}
      </p>
      {quotes.length > 1 && (
        <span class="ticker-ctl">
          <button onClick={() => setI((i - 1 + quotes.length) % quotes.length)} aria-label="Previous quote"><Icon name="chevron-left" size={14} /></button>
          <button onClick={() => setPaused(!paused)} aria-label={paused ? 'Play quotes' : 'Pause quotes'}><Icon name={paused ? 'play' : 'pause'} size={13} /></button>
          <button onClick={() => setI((i + 1) % quotes.length)} aria-label="Next quote"><Icon name="chevron-right" size={14} /></button>
        </span>
      )}
    </div>
  );
}

const themeStore = safeStorage('local');
function ThemeToggle() {
  const [theme, setTheme] = useState<string>(() => themeStore.get('falcon-theme', 'auto'));
  const apply = (t: string) => {
    setTheme(t);
    themeStore.set('falcon-theme', t);
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  };
  const next = theme === 'auto' ? 'dark' : theme === 'dark' ? 'light' : 'auto';
  return (
    <button class="topbar-btn" onClick={() => apply(next)} title={`Theme: ${theme}. Click for ${next}.`} aria-label={`Colour theme: ${theme}. Switch to ${next}.`}>
      <Icon name={theme === 'dark' ? 'eye-off' : theme === 'light' ? 'sun' : 'palette'} size={14} />
      <span class="hide-sm">{theme === 'auto' ? 'Auto' : theme === 'dark' ? 'Dark' : 'Light'}</span>
    </button>
  );
}

export function TopBar() {
  const { site } = useNews();
  return (
    <div class="topbar">
      <div class="wrap topbar-in">
        <QuoteTicker />
        <div class="topbar-right">
          <span class="hide-md"><Weather /></span>
          <ThemeToggle />
          {site.settings.hotline.enabled && (
            <button class="topbar-btn topbar-tip" onClick={openTipLine}><Icon name="megaphone" size={14} /> Submit a tip</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function AnnouncementBar() {
  const { site } = useNews();
  const a = site.announcements[0];
  if (!a) return null;
  const inner = <><Icon name="bell" size={15} /> <span>{a.text}</span>{a.link_url && <Icon name="arrow-right" size={14} />}</>;
  return (
    <div class="announce" role="region" aria-label="Announcement">
      <div class="wrap">
        {a.link_url ? <a href={a.link_url} class="announce-in">{inner}</a> : <div class="announce-in">{inner}</div>}
      </div>
    </div>
  );
}

export function Masthead() {
  const { site } = useNews();
  const s = site.settings.site;
  const [q, setQ] = useState('');
  return (
    <header class="masthead">
      <div class="wrap">
        <div class="masthead-meta">
          <span class="date">{formatToday()}</span>
          <span class="hide-md muted">{s.school} · {s.address}</span>
          <form class="search" role="search" onSubmit={(e) => { e.preventDefault(); if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`); }}>
            <Icon name="search" size={15} />
            <input type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Search stories, writers…" aria-label="Search" />
          </form>
        </div>
        <a class="brand" href={href('/')} aria-label={`${s.name} — front page`}>
          <Logo size={64} class="brand-logo" />
          <span class="brand-name">{s.name.toUpperCase()}</span>
        </a>
        <p class="tagline">{s.tagline}</p>
        <div class="double-rule" aria-hidden="true" />
      </div>
    </header>
  );
}

export function Nav({ route }: { route: Route }) {
  const { sections } = useNews();
  const [mobile, setMobile] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setMobile(false); setOpen(null); }, [route.path]);
  const activeSection = route.path.startsWith('/section/') ? route.path.split('/')[2] : '';

  return (
    <nav class="nav" aria-label="Sections">
      <div class="wrap nav-in">
        <button class="nav-burger" aria-expanded={mobile} aria-controls="nav-list" onClick={() => setMobile(!mobile)}>
          <Icon name={mobile ? 'x' : 'menu'} size={20} /> <span>{mobile ? 'Close' : 'Menu'}</span>
        </button>
        <ul id="nav-list" class={`nav-list ${mobile ? 'open' : ''}`}>
          <li class="nav-item">
            <a class={`nav-link ${route.path === '/' ? 'active' : ''}`} href={href('/')}><Icon name="newspaper" size={15} /> Front page</a>
          </li>
          {sections.map((s) => (
            <li key={s.id} class={`nav-item ${open === s.id ? 'open' : ''}`}>
              <a class={`nav-link ${activeSection === s.id ? 'active' : ''}`} href={href(`/section/${s.id}`)}>{s.name}</a>
              {s.subsections.length > 0 && (
                <>
                  <button class="nav-caret" aria-label={`${s.name} sub-sections`} aria-expanded={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>
                    <Icon name="chevron-down" size={14} />
                  </button>
                  <ul class="dropdown">
                    {s.subsections.map((sub) => (
                      <li key={sub}><a href={href(`/section/${s.id}/${encodeURIComponent(sub)}`)}>{sub}</a></li>
                    ))}
                  </ul>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}
