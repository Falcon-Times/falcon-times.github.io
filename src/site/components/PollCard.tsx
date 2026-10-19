import { useState } from 'preact/hooks';
import { castVote } from '@/lib/api';
import { safeStorage } from '@/lib/store';
import type { PollWithVotes } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { toastError } from '@/ui/Toast';
import { useNews } from '../data';

const KEY = 'falcon-votes';
const store = safeStorage('local');

export function PollCard() {
  const { polls } = useNews();
  const [index, setIndex] = useState(0);
  const [votes, setVotes] = useState<Record<string, string>>(() => store.get(KEY, {}));
  const [extra, setExtra] = useState<Record<string, string>>({}); // optimistic +1 per poll
  const [busy, setBusy] = useState(false);

  if (polls.length === 0) {
    return (
      <section class="panel poll">
        <header class="poll-head"><Icon name="chart" size={18} /><h2>Falcon Pulse Poll</h2></header>
        <p class="muted poll-empty">No poll is running right now. Got an idea for one? Send it through the tip line!</p>
      </section>
    );
  }
  const poll: PollWithVotes = polls[Math.min(index, polls.length - 1)];
  const mine = votes[poll.id] ?? extra[poll.id];
  const counts: Record<string, number> = { ...poll.votes };
  if (extra[poll.id]) counts[extra[poll.id]] = (counts[extra[poll.id]] ?? 0) + 1;
  const total = poll.options.reduce((n, o) => n + (counts[o.id] ?? 0), 0);

  async function vote(optionId: string) {
    if (busy || mine) return;
    setBusy(true);
    try {
      await castVote(poll.id, optionId);
      const next = { ...votes, [poll.id]: optionId };
      setVotes(next);
      store.set(KEY, next);
      setExtra({ ...extra, [poll.id]: optionId });
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section class="panel poll" aria-labelledby="poll-h">
      <header class="poll-head">
        <Icon name="chart" size={18} />
        <h2 id="poll-h">Falcon Pulse Poll</h2>
        {polls.length > 1 && (
          <div class="tabs tabs-mini" role="tablist" aria-label="Choose poll">
            {polls.map((p, i) => (
              <button key={p.id} role="tab" aria-selected={i === index} class={`tab ${i === index ? 'on' : ''}`} onClick={() => setIndex(i)}>#{i + 1}</button>
            ))}
          </div>
        )}
      </header>
      <div class="poll-body">
        <div class="row small muted spread"><span class="badge">{poll.category}</span><span>{total} {total === 1 ? 'vote' : 'votes'}</span></div>
        <h3 class="poll-q">{poll.question}</h3>
        <div class="poll-options" role="group" aria-label={poll.question}>
          {poll.options.map((o) => {
            const pct = total ? Math.round(((counts[o.id] ?? 0) / total) * 100) : 0;
            return mine ? (
              <div key={o.id} class={`poll-result ${mine === o.id ? 'mine' : ''}`}>
                <span class="poll-bar" style={{ width: `${pct}%` }} />
                <span class="poll-label">{mine === o.id && <Icon name="circle-check" size={15} />} {o.label}</span>
                <span class="poll-pct">{pct}%</span>
              </div>
            ) : (
              <button key={o.id} class="poll-option" disabled={busy} onClick={() => vote(o.id)}>
                <span>{o.label}</span><span class="radio" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <p class="small muted poll-note" aria-live="polite">{mine ? 'Thanks for voting!' : 'Tap an option to vote — results appear instantly.'}</p>
      </div>
    </section>
  );
}
