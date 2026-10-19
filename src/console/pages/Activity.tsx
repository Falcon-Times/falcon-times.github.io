import { useEffect, useState } from 'preact/hooks';
import { formatDateTime } from '@/lib/format';
import type { AuditEntry } from '@/lib/types';
import { Empty, ErrorNote, Loading } from '@/ui/States';
import { listAudit } from '../api';
import { useRefs } from '../refs';

const OP: Record<string, string> = { INSERT: 'created', UPDATE: 'changed', DELETE: 'deleted' };
const TABLE: Record<string, string> = {
  articles: 'story', profiles: 'account', staff_members: 'staff member', sections: 'section', site_settings: 'setting',
  polls: 'poll', games: 'game', quotes: 'quote', announcements: 'announcement', tips: 'tip',
};

export function Activity() {
  const { directory } = useRefs();
  // Show people's names; fall back to the logged email for accounts that no longer exist.
  const who = (r: AuditEntry) => directory.find((d) => d.id === r.actor)?.display_name || r.actor_email;
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => { listAudit().then(setRows).catch(setError); }, []);
  return (
    <div class="stack" style={{ '--stack': '18px' }}>
      <div><h1 class="page-title">Activity log</h1><p class="muted">Who changed what, most recent first. Tip contents are never recorded here.</p></div>
      {error ? <ErrorNote error={error} /> : !rows ? <Loading /> : rows.length === 0 ? <Empty icon="history" title="Nothing logged yet" /> : (
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td class="nowrap small">{formatDateTime(r.at)}</td>
                  <td class="small" title={r.actor_email ?? undefined}>{who(r) ?? <span class="muted">system</span>}</td>
                  <td><span class="badge">{OP[r.op] ?? r.op} {TABLE[r.table_name] ?? r.table_name}</span></td>
                  <td class="small muted">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
