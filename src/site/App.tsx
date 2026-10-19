import { useEffect } from 'preact/hooks';
import { match, useRoute } from '@/lib/router';
import { Toasts } from '@/ui/Toast';
import { isConfigured } from '@/lib/config';
import { Icon } from '@/ui/Icon';
import { NewsProvider, useNews } from './data';
import { AnnouncementBar, Masthead, Nav, TopBar } from './components/Header';
import { Footer } from './components/Footer';
import { TipModal } from './components/Tip';
import { Home } from './pages/Home';
import { SectionPage } from './pages/Section';
import { ArticlePage } from './pages/Article';
import { StaffMemberPage, StaffPage } from './pages/Staff';
import { AboutPage, ScoresPage, SearchPage } from './pages/Misc';
import { NotFound } from './pages/NotFound';

function Routes() {
  const route = useRoute();
  const { site, degraded } = useNews();
  useEffect(() => { document.title = site.settings.site.name; }, [site.settings.site.name]);

  let page;
  let m: Record<string, string> | null;
  if (route.path === '/') page = <Home />;
  else if ((m = match('/section/:id', route.path))) page = <SectionPage id={m.id} />;
  else if ((m = match('/section/:id/:sub', route.path))) page = <SectionPage id={m.id} sub={m.sub} />;
  else if ((m = match('/article/:slug', route.path))) page = <ArticlePage slug={m.slug} />;
  else if (route.path === '/staff') page = <StaffPage />;
  else if ((m = match('/staff/:slug', route.path))) page = <StaffMemberPage slug={m.slug} />;
  else if (route.path === '/scores') page = <ScoresPage />;
  else if (route.path === '/about') page = <AboutPage />;
  else if (route.path === '/search') page = <SearchPage query={route.query.get('q') ?? ''} />;
  else page = <NotFound />;

  return (
    <>
      <a class="skip-link" href="#main" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>Skip to content</a>
      <TopBar />
      <AnnouncementBar />
      <Masthead />
      <Nav route={route} />
      {(degraded || !isConfigured) && (
        <div class="wrap"><div class="notice notice-warn offline">
          <Icon name="info" />
          <span>{isConfigured ? 'We’re having trouble reaching our newsroom right now, so you’re seeing a limited version of the site.' : 'The newsroom backend is not connected yet — showing starter content.'}</span>
        </div></div>
      )}
      <main id="main" tabIndex={-1} class="wrap main">{page}</main>
      <Footer />
      <TipModal />
      <Toasts />
    </>
  );
}

export function App() {
  return <NewsProvider><Routes /></NewsProvider>;
}
