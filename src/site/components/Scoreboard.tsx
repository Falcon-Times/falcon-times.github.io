import { useMemo, useState } from 'preact/hooks';
import type { Game } from '@/lib/types';
import { formatShortDate, formatTime } from '@/lib/format';
import { href } from '@/lib/router';
import { Icon } from '@/ui/Icon';
import { useNews } from '../data';

type Tab = 'all' | 'recent' | 'upcoming' | 'home' | 'away';
const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'recent', label: 'Recent' }, { id: 'upcoming', label: 'Upcoming' },
  { id: 'home', label: 'Home' }, { id: 'away', label: 'Away' },
];

export function gameResult(g: Game): 'W' | 'L' | 'T' | null {
  if (g.status !== 'final' || g.our_score == null || g.their_score == null) return null;
  return g.our_score > g.their_score ? 'W' : g.our_score < g.their_score ? 'L' : 'T';
}

export function splitGames(games: Game[]) {
  const cutoff = Date.now() - 3 * 3600_000;
  const upcoming = games
    .filter((g) => g.status !== 'final' && new Date(g.starts_at).getTime() >= cutoff)
    .sort((a, b) => +new Date(a.starts_at) - +new Date(b.starts_at));
  const recent = games
    .filter((g) => g.status === 'final')
    .sort((a, b) => +new Date(b.starts_at) - +new Date(a.starts_at));
  return { upcoming, recent };
}

function GameRow({ g }: { g: Game }) {
  const result = gameResult(g);
  return (
    <li class="game">
      <div class="game-main">
        <div class="row" style={{ '--gap': '6px' }}>
          <span class={`badge ${g.is_home ? 'badge-navy' : ''}`}>{g.is_home ? 'HOME' : 'AWAY'}</span>
          <strong class="truncate">{g.sport}</strong>
        </div>
        <div class="game-opp truncate">{g.is_home ? 'vs.' : 'at'} {g.opponent}</div>
        <div class="game-when small muted">
          {formatShortDate(g.starts_at)} · {formatTime(g.starts_at)}{g.location ? ` · ${g.location}` : ''}
        </div>
      </div>
      <div class="game-score">
        {g.status === 'final' && g.our_score != null ? (
          <span class={`score score-${result}`}>{result} {g.our_score}–{g.their_score}</span>
        ) : g.status === 'scheduled' ? (
          <span class="score score-next">{formatTime(g.starts_at)}</span>
        ) : (
          <span class="score score-off">{g.status === 'postponed' ? 'Postponed' : 'Cancelled'}</span>
        )}
      </div>
    </li>
  );
}

export function Scoreboard({ limit = 6, full = false }: { limit?: number; full?: boolean }) {
  const { games, site } = useNews();
  const [tab, setTab] = useState<Tab>('all');
  const { upcoming, recent } = useMemo(() => splitGames(games), [games]);
  const list = useMemo(() => {
    const everything = [...upcoming, ...recent];
    const picked =
      tab === 'recent' ? recent
      : tab === 'upcoming' ? upcoming
      : tab === 'home' ? everything.filter((g) => g.is_home)
      : tab === 'away' ? everything.filter((g) => !g.is_home)
      : [...upcoming.slice(0, 4), ...recent];
    return full ? picked : picked.slice(0, limit);
  }, [tab, upcoming, recent, full, limit]);

  return (
    <section class="panel scoreboard" aria-labelledby="scores-h">
      <header class="scoreboard-head">
        <span class="scoreboard-icon"><Icon name="trophy" size={18} /></span>
        <div>
          <h2 id="scores-h">Falcons Scoreboard</h2>
          <p class="small">Results &amp; schedule · {site.settings.site.school}</p>
        </div>
      </header>
      <div class="tabs" role="tablist" aria-label="Filter games">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} class={`tab ${tab === t.id ? 'on' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>
      {list.length === 0 ? (
        <p class="scoreboard-empty muted">
          {games.length === 0 ? 'No games have been posted yet. Check back soon!' : 'Nothing to show for this filter.'}
        </p>
      ) : (
        <ul class="games">{list.map((g) => <GameRow key={g.id} g={g} />)}</ul>
      )}
      {!full && (
        <footer class="scoreboard-foot">
          <a href={href('/scores')}>Full schedule &amp; results <Icon name="chevron-right" size={14} /></a>
        </footer>
      )}
    </section>
  );
}
