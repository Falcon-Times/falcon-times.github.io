import { createContext } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import {
  loadArticles, loadGames, loadPolls, loadSite, loadStaff, loadTrendingIds,
} from '@/lib/api';
import { fallbackPolls, fallbackSite, fallbackStaff, fallbackSummaries } from '@/lib/fallback';
import type { ArticleSummary, Game, PollWithVotes, Section, SiteData, StaffMember } from '@/lib/types';

export interface NewsData {
  loading: boolean;
  degraded: boolean;
  site: SiteData;
  sections: Section[];          // active sections only, in nav order
  allSections: Section[];       // includes teams without public articles
  articles: ArticleSummary[];
  staff: StaffMember[];
  games: Game[];
  polls: PollWithVotes[];
  trendingIds: string[];
  staffById: Map<string, StaffMember>;
  sectionById: Map<string, Section>;
  lead: ArticleSummary | undefined;
  trending: ArticleSummary[];
  refresh: () => void;
}

const Ctx = createContext<NewsData | null>(null);
export const useNews = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNews outside provider');
  return v;
};

export function NewsProvider({ children }: { children: ComponentChildren }) {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState({
    loading: true, degraded: false, site: fallbackSite, articles: fallbackSummaries,
    staff: fallbackStaff, games: [] as Game[], polls: fallbackPolls, trendingIds: [] as string[],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [site, articles, staff, games, polls, trending] = await Promise.allSettled([
        loadSite(), loadArticles(), loadStaff(), loadGames(), loadPolls(), loadTrendingIds(8),
      ]);
      if (cancelled) return;
      const failed = [site, articles, staff].some((r) => r.status === 'rejected');
      if (failed) console.warn('Some content failed to load; showing fallback content.', { site, articles, staff });
      setState({
        loading: false,
        degraded: failed,
        site: site.status === 'fulfilled' ? site.value : fallbackSite,
        articles: articles.status === 'fulfilled' ? articles.value : failed ? fallbackSummaries : [],
        staff: staff.status === 'fulfilled' ? staff.value : fallbackStaff,
        games: games.status === 'fulfilled' ? games.value : [],
        polls: polls.status === 'fulfilled' ? polls.value : [],
        trendingIds: trending.status === 'fulfilled' ? trending.value : [],
      });
    })();
    return () => { cancelled = true; };
  }, [tick]);

  const value = useMemo<NewsData>(() => {
    const allSections = [...state.site.sections].sort((a, b) => a.sort_order - b.sort_order);
    const sections = allSections.filter((s) => s.active);
    const lead = state.articles.find((a) => a.is_lead) ?? state.articles[0];
    const byId = new Map(state.articles.map((a) => [a.id, a]));
    const picked: ArticleSummary[] = [];
    const add = (a: ArticleSummary | undefined) => {
      if (a && a.id !== lead?.id && !picked.includes(a)) picked.push(a);
    };
    state.articles.filter((a) => a.featured).forEach(add);
    state.trendingIds.forEach((id) => add(byId.get(id)));
    state.articles.forEach(add);
    return {
      ...state,
      sections,
      allSections,
      lead,
      trending: picked.slice(0, 8),
      staffById: new Map(state.staff.map((s) => [s.id, s])),
      sectionById: new Map(allSections.map((s) => [s.id, s])),
      refresh: () => setTick((t) => t + 1),
    };
  }, [state]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

