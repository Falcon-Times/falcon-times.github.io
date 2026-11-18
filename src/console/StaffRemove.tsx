import { useEffect, useState } from 'preact/hooks';
import type { StaffMember } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { ErrorNote, Loading } from '@/ui/States';
import { toast, toastError } from '@/ui/Toast';
import { deleteStaffMember, staffRemovalImpact, unlistStaffMember, type StaffImpact } from './api';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Confirm dialog for deleting someone from the staff roster: says exactly what will change first. */
export function StaffRemoveModal({ person, onClose, onDone }: { person: StaffMember; onClose: () => void; onDone: () => void }) {
  const [impact, setImpact] = useState<StaffImpact | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { staffRemovalImpact(person.id).then(setImpact).catch(setError); }, [person.id]);

  async function unlist() {
    setBusy(true);
    try {
      await unlistStaffMember(person.id);
      toast(`${person.name} is no longer listed`, 'ok');
      onDone();
    } catch (e) { toastError(e); setBusy(false); }
  }

  async function remove() {
    setBusy(true);
    try {
      await deleteStaffMember(person.id);
      toast(`${person.name} was deleted from the roster`, 'ok');
      onDone();
    } catch (e) { toastError(e); setBusy(false); }
  }

  return (
    <Modal title={`Delete ${person.name}?`} onClose={onClose} width={560}
      footer={<>
        <button class="btn" onClick={onClose} disabled={busy}>Cancel</button>
        {person.active && <button class="btn" onClick={unlist} disabled={busy || !impact}>Unlist instead</button>}
        <button class="btn btn-danger" onClick={remove} disabled={busy || !impact}><Icon name="trash" size={15} /> {busy ? 'Deleting…' : 'Delete permanently'}</button>
      </>}>
      {error ? <ErrorNote error={error} /> : !impact ? <Loading /> : (
        <div class="stack" style={{ '--stack': '12px' }}>
          <p>This removes <strong>{person.name}</strong> from the staff roster and “Meet the newsroom”, and deletes their profile page and bio. It can’t be undone.</p>
          <ul class="small stack" style={{ '--stack': '6px', 'padding-left': '1.2em' }}>
            <li>
              {impact.stories === 0
                ? 'They aren’t credited on any stories.'
                : <>They’re credited on <strong>{plural(impact.stories, 'story', 'stories')}</strong>{impact.published > 0 && <> ({impact.published} published)</>}. They’ll be taken off those bylines; a story left with no byline shows “The Falcon Times Staff”. The stories’ text isn’t changed.</>}
            </li>
            <li>
              {impact.accounts.length === 0
                ? 'No login account is linked to them.'
                : <>A login account is linked to them ({impact.accounts.map((a) => a.name || a.email).join(', ')}). <strong>It isn’t deleted</strong> — it just loses the link, so their stories will no longer show their name by default. Manage accounts under People &amp; access.</>}
            </li>
            {person.photo_url && <li>Their portrait file is removed too, unless a story or the gallery still uses it.</li>}
          </ul>
          {person.active && <p class="small muted">Just want them off the site for now? “Unlist instead” hides them from the site (including on bylines) but keeps their record, so you can bring them back later by ticking “Listed on the site”.</p>}
        </div>
      )}
    </Modal>
  );
}
