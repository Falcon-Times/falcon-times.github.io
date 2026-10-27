import { useEffect, useState } from 'preact/hooks';
import { sessionClient } from '@/lib/supabase';
import { Icon } from '@/ui/Icon';
import { Loading } from '@/ui/States';
import { toast, toastError } from '@/ui/Toast';
import { updateMyName, updateStaffBio } from '../api';
import { ChangePassword, MfaEnroll, useMe } from '../auth';
import { ImageField, TextArea, TextField } from '../fields';
import { DEFAULT_LABEL, getLabels, setLabel } from '../mfaLabels';
import { useRefs } from '../refs';

export function Profile() {
  const me = useMe();
  const { staff, reload } = useRefs();
  const person = staff.find((s) => s.id === me.profile.staff_member_id);
  const [name, setName] = useState(me.profile.display_name);
  const [bio, setBio] = useState(person?.bio ?? '');
  const [photo, setPhoto] = useState<string | null>(person?.photo_url ?? null);
  const [busy, setBusy] = useState(false);

  async function save(e: Event) {
    e.preventDefault();
    setBusy(true);
    try {
      await updateMyName(me.userId, name.trim());
      if (person) await updateStaffBio(person.id, { bio: bio.trim(), photo_url: photo });
      toast('Profile saved', 'ok');
      await me.refresh(); reload();
    } catch (err) { toastError(err); } finally { setBusy(false); }
  }

  return (
    <div class="stack" style={{ '--stack': '18px', maxWidth: '720px' }}>
      <h1 class="page-title">My profile</h1>
      <form class="card-box stack" style={{ '--stack': '16px' }} onSubmit={save}>
        <TextField label="Display name" value={name} onChange={setName} required max={120} hint="Shown inside the newsroom (assignments, notes, the activity log). It isn’t what readers see." />
        <TextField label="Public byline name" value={person?.name ?? ''} onChange={() => undefined} disabled
          placeholder="Not set yet"
          hint={person ? 'This is the name readers see on your stories and on “Meet the newsroom”. It’s set by an admin — ask one if it needs fixing.' : 'Your account isn’t linked to a staff profile yet, so no byline name is set. An admin can link it.'} />
        <div class="muted small">Signed in as <strong>{me.profile.email}</strong></div>
        {person ? (
          <>
            <hr class="rule" />
            <p class="muted small">This is your public profile on the “Meet the newsroom” page.</p>
            <ImageField label="Photo" shape="portrait" value={photo} onChange={setPhoto} hint="Optional. A friendly, well-lit portrait works best. You’ll choose what shows in the circle after picking a file." />
            <TextArea label="Public bio" value={bio} onChange={setBio} max={2000} rows={5} hint="A few sentences about you and what you cover." />
          </>
        ) : (
          <div class="notice"><Icon name="info" />Your account isn’t linked to a public staff profile yet. Ask an admin to link it if you’d like a bio page.</div>
        )}
        <div><button class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
      </form>
    </div>
  );
}

export function Security() {
  const me = useMe();
  const [factors, setFactors] = useState<{ id: string; friendly_name?: string | null; status: string }[] | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [renaming, setRenaming] = useState<{ id: string; text: string } | null>(null);
  const load = () => {
    sessionClient().auth.mfa.listFactors().then(({ data }) => setFactors((data?.totp ?? []) as never)).catch(toastError);
    getLabels().then(setLabels).catch(() => undefined);
  };
  async function saveName() {
    if (!renaming) return;
    try { await setLabel(renaming.id, renaming.text); setRenaming(null); load(); toast('Renamed', 'ok'); } catch (e) { toastError(e); }
  }
  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    if (!confirm('Turn off two-factor sign-in for this account?')) return;
    const { error } = await sessionClient().auth.mfa.unenroll({ factorId: id });
    if (error) return toastError(error);
    toast('Two-factor removed', 'ok');
    if (me.isAdmin) { await me.refresh(); } else load();
  }

  return (
    <div class="stack" style={{ '--stack': '22px', maxWidth: '720px' }}>
      <h1 class="page-title">Account security</h1>
      {me.viaBypass && (
        <div class="notice notice-warn"><Icon name="key" /><div>
          You signed in with a one-time bypass code, so this session skipped the authenticator step. Your authenticator still works for next time. If you’ve lost the device, ask an admin to reset your two-factor so you can set up a new one.
        </div></div>
      )}
      <section class="card-box"><ChangePassword /></section>
      <section class="card-box stack" style={{ '--stack': '12px' }}>
        <h2 class="h3">Two-factor sign-in</h2>
        <p class="muted small">
          A one-time code from an authenticator app makes a stolen password useless.
          {me.isAdmin ? ' It is required for admin accounts.' : ' It is optional, but strongly recommended for section leaders.'}
        </p>
        {!factors ? <Loading /> : enrolling ? (
          <MfaEnroll onDone={() => { setEnrolling(false); load(); toast('Two-factor turned on', 'ok'); me.refresh(); }} onCancel={() => setEnrolling(false)} />
        ) : factors.length ? (
          <ul class="stack" style={{ '--stack': '8px' }}>
            {factors.map((f) => (
              <li key={f.id} class="spread card-row">
                {renaming?.id === f.id ? (
                  <form class="row grow" style={{ '--gap': '8px', 'flex-wrap': 'nowrap' }} onSubmit={(e) => { e.preventDefault(); saveName(); }}>
                    <input class="input" autoFocus maxLength={40} value={renaming.text} aria-label="Device name"
                      onInput={(e) => setRenaming({ id: f.id, text: (e.target as HTMLInputElement).value })} />
                    <button class="btn btn-sm btn-primary">Save</button>
                    <button type="button" class="btn btn-sm btn-ghost" onClick={() => setRenaming(null)}>Cancel</button>
                  </form>
                ) : (
                  <>
                    <span class="row"><Icon name="shield-check" /> {labels[f.id] || DEFAULT_LABEL} <span class={`badge ${f.status === 'verified' ? 'badge-ok' : 'badge-warn'}`}>{f.status}</span></span>
                    <span class="row" style={{ '--gap': '6px' }}>
                      <button class="btn btn-sm" onClick={() => setRenaming({ id: f.id, text: labels[f.id] || DEFAULT_LABEL })}><Icon name="pencil" size={13} /> Rename</button>
                      <button class="btn btn-sm btn-danger" onClick={() => remove(f.id)}>Remove</button>
                    </span>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div><button class="btn btn-primary" onClick={() => setEnrolling(true)}><Icon name="shield" size={16} /> Set up two-factor</button></div>
        )}
      </section>
    </div>
  );
}
