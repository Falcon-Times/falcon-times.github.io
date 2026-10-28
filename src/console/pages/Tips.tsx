import { useEffect, useMemo, useState } from 'preact/hooks';
import { formatDateTime, timeAgo } from '@/lib/format';
import { TIP_CATEGORIES, type Tip, type TipStatus } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { Empty, ErrorNote, Loading } from '@/ui/States';
import { toast, toastError } from '@/ui/Toast';
import { deleteTip, listTips, updateTip } from '../api';
import { useMe } from '../auth';
import { SelectField, TextArea } from '../fields';
import { useRefs } from '../refs';

const STATUS: { id: TipStatus; label: string; badge: string }[] = [
  { id: 'new', label: 'New', badge: 'badge-gold' },
  { id: 'in_review', label: 'In review', badge: 'badge-info' },
  { id: 'resolved', label: 'Resolved', badge: 'badge-ok' },
  { id: 'dismissed', label: 'Dismissed', badge: '' },
];
const catLabel = (id: string) => TIP_CATEGORIES.find((c) => c.id === id)?.label ?? id;

export function Tips() {
  const { sectionName } = useRefs();
  const [rows, setRows] = useState<Tip[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<'open' | TipStatus | 'all'>('open');
  const [open, setOpen] = useState<Tip | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { listTips().then(setRows).catch(setError); }, [tick]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of rows ?? []) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [rows]);
  const shown = (rows ?? []).filter((t) => filter === 'all' ? true : filter === 'open' ? t.status === 'new' || t.status === 'in_review' : t.status === filter);

  return (
    <div class="stack" style={{ '--stack': '18px' }}>
      <div>
        <h1 class="page-title">Tip line</h1>
        <p class="muted">Anonymous tips, corrections, letters and feedback from readers. Only section leaders and admins can see these — please treat them as confidential.</p>
      </div>
      <div class="tabs-pill" role="tablist">
        <button role="tab" aria-selected={filter === 'open'} class={`pill ${filter === 'open' ? 'on' : ''}`} onClick={() => setFilter('open')}>Open <span class="count">{(counts.new ?? 0) + (counts.in_review ?? 0)}</span></button>
        {STATUS.map((s) => <button key={s.id} role="tab" aria-selected={filter === s.id} class={`pill ${filter === s.id ? 'on' : ''}`} onClick={() => setFilter(s.id)}>{s.label} <span class="count">{counts[s.id] ?? 0}</span></button>)}
        <button role="tab" aria-selected={filter === 'all'} class={`pill ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>All</button>
      </div>
      {error ? <ErrorNote error={error} /> : !rows ? <Loading /> : shown.length === 0 ? (
        <Empty icon="inbox" title="Inbox zero 🎉">No tips match this view.</Empty>
      ) : (
        <ul class="tips">
          {shown.map((t) => {
            const st = STATUS.find((s) => s.id === t.status)!;
            return (
              <li key={t.id}>
                <button class="tip-row" onClick={() => setOpen(t)}>
                  <div class="row" style={{ '--gap': '8px' }}>
                    <span class={`badge ${st.badge}`}>{st.label}</span>
                    <span class="badge">{catLabel(t.category)}</span>
                    {t.section_id && <span class="badge badge-navy">{sectionName(t.section_id)}</span>}
                    {t.contact && <span class="badge badge-ok"><Icon name="mail" size={11} /> left contact</span>}
                    <span class="grow" />
                    <span class="small muted" title={formatDateTime(t.created_at)}>{timeAgo(t.created_at)}</span>
                  </div>
                  <p class="clamp-2">{t.message}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open && <TipModal tip={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); setTick((n) => n + 1); }} />}
    </div>
  );
}

function TipModal({ tip, onClose, onSaved }: { tip: Tip; onClose: () => void; onSaved: () => void }) {
  const me = useMe();
  const { directory, sectionName } = useRefs();
  const [status, setStatus] = useState<TipStatus>(tip.status);
  const [assigned, setAssigned] = useState(tip.assigned_to ?? '');
  const [notes, setNotes] = useState(tip.internal_notes);
  const [busy, setBusy] = useState(false);
  const editors = directory.filter((d) => d.active && (d.role === 'editor' || d.role === 'admin' || d.role === 'super_admin'));

  async function save() {
    setBusy(true);
    try { await updateTip(tip.id, { status, assigned_to: assigned || null, internal_notes: notes }); toast('Tip updated', 'ok'); onSaved(); }
    catch (e) { toastError(e); setBusy(false); }
  }
  async function del() {
    if (!confirm('Permanently delete this tip?')) return;
    try { await deleteTip(tip.id); toast('Tip deleted', 'ok'); onSaved(); } catch (e) { toastError(e); }
  }

  return (
    <Modal title="Tip details" onClose={onClose} width={640}
      footer={<>
        {me.isAdmin && <button class="btn btn-danger" style={{ marginRight: 'auto' }} onClick={del}><Icon name="trash" size={14} /> Delete</button>}
        <button class="btn" onClick={onClose}>Cancel</button>
        <button class="btn btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
      </>}>
      <div class="stack" style={{ '--stack': '14px' }}>
        <div class="row">
          <span class="badge">{catLabel(tip.category)}</span>
          <span class="badge badge-navy">{tip.section_id ? sectionName(tip.section_id) : 'General'}</span>
          <span class="small muted">Received {formatDateTime(tip.created_at)}</span>
        </div>
        <blockquote class="tip-message">{tip.message}</blockquote>
        <div class="notice">
          <Icon name="user" />
          <div>{tip.contact ? <>Contact left by the sender: <strong>{tip.contact}</strong></> : 'The sender stayed anonymous — there is no way to reply.'}</div>
        </div>
        <div class="form-grid">
          <SelectField label="Status" value={status} onChange={(v) => setStatus(v as TipStatus)} options={STATUS.map((s) => ({ value: s.id, label: s.label }))} />
          <SelectField label="Assigned to" value={assigned} onChange={setAssigned} options={[{ value: '', label: 'Nobody yet' }, ...editors.map((e) => ({ value: e.id, label: e.display_name }))]} />
          <TextArea class="full" label="Private notes" value={notes} onChange={setNotes} rows={3} max={4000} hint="Visible only to section leaders and admins." />
        </div>
      </div>
    </Modal>
  );
}
