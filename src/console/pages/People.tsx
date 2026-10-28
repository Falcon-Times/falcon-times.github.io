import { useEffect, useMemo, useState } from 'preact/hooks';
import { timeAgo } from '@/lib/format';
import { isStrongPassword } from '@/lib/passwordPolicy';
import { sessionClient } from '@/lib/supabase';
import { isAdminRole, type Profile, type Role } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { Modal } from '@/ui/Modal';
import { Empty, ErrorNote, Loading } from '@/ui/States';
import { toast, toastError } from '@/ui/Toast';
import { adminUsers, createBypassCode, listBypass, listProfiles, revokeBypass, type AdminUserInfo, type BypassInfo } from '../api';
import { useMe } from '../auth';
import { formatBypassCode } from '../bypassCode';
import { Checkbox, SectionPicker, SelectField, TextField } from '../fields';
import { useRefs } from '../refs';

const ROLE_LABEL: Record<Role, string> = { writer: 'Writer', editor: 'Section leader', admin: 'Admin', super_admin: 'Super admin' };
const ROLE_BADGE: Record<Role, string> = { writer: '', editor: 'badge-navy', admin: 'badge-gold', super_admin: 'badge-gold' };
const ROLE_ORDER: Role[] = ['writer', 'editor', 'admin', 'super_admin'];
/** Roles this person may hand out: only super admins can create or promote admin-level accounts. */
const rolesFor = (isSuper: boolean) => ROLE_ORDER.filter((r) => isSuper || !isAdminRole(r));

/** Random temporary password (23 chars, no look-alikes) that always meets the password rules. */
function tempPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
    const pw = `${chars.slice(0, 5).join('')}-${chars.slice(5, 10).join('')}-${chars.slice(10, 15).join('')}-${chars.slice(15, 20).join('')}`;
    if (isStrongPassword(pw)) return pw; // a random draw can miss a digit or a capital; just draw again
  }
}

export function People() {
  const me = useMe();
  const { sectionName, reload } = useRefs();
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [info, setInfo] = useState<Record<string, AdminUserInfo>>({});
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [credential, setCredential] = useState<{ email: string; password: string } | null>(null);
  const [bypassCode, setBypassCode] = useState<{ name: string; code: string; expiresAt: string } | null>(null);
  const [bypass, setBypass] = useState<Record<string, BypassInfo>>({});
  const [tick, setTick] = useState(0);
  const refresh = () => { setTick((t) => t + 1); reload(); };

  useEffect(() => {
    listProfiles().then(setRows).catch(setError);
    adminUsers<{ users: AdminUserInfo[] }>({ action: 'list' })
      .then((r) => setInfo(Object.fromEntries(r.users.map((u) => [u.id, u]))))
      .catch(() => undefined); // function not deployed yet → just hide the extra columns
    listBypass().then((r) => setBypass(Object.fromEntries(r.map((b) => [b.user_id, b])))).catch(() => undefined);
  }, [tick]);

  const adminLevel = useMemo(() => (rows ?? []).filter((r) => isAdminRole(r.role) && r.active).length, [rows]);
  const supers = useMemo(() => (rows ?? []).filter((r) => r.role === 'super_admin' && r.active).length, [rows]);

  return (
    <div class="stack" style={{ '--stack': '18px' }}>
      <div class="spread">
        <div>
          <h1 class="page-title">People &amp; access</h1>
          <p class="muted">Everyone who can sign in to the newsroom. Each person gets their own account — never share a login.</p>
        </div>
        <button class="btn btn-primary" onClick={() => setEditing('new')}><Icon name="plus" size={16} /> Add account</button>
      </div>
      <div class="notice"><Icon name="info" /><div>
        <strong>Roles.</strong> <em>Writers</em> draft and submit stories in their sections. <em>Section leaders</em> also review and publish stories, triage the tip line, and run polls and the scoreboard for their sections. <em>Admins</em> run the whole site — content, settings, writers and section leaders — and must use two-factor sign-in. <em>Super admins</em> can do all that and are the only ones who can create, change, disable or reset admin accounts (including other super admins).
      </div></div>
      {error ? <ErrorNote error={error} /> : !rows ? <Loading /> : rows.length === 0 ? <Empty icon="users" title="No accounts yet" /> : (
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Person</th><th>Role</th><th>Sections</th><th>2FA</th><th>Last sign-in</th><th class="col-actions"><span class="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {rows.map((p) => {
                const i = info[p.id];
                return (
                  <tr key={p.id} class={p.active ? '' : 'inactive'}>
                    <td><strong>{p.display_name || '—'}</strong>{p.id === me.userId && <span class="badge" style={{ marginLeft: '6px' }}>You</span>}<div class="small muted">{p.email}</div></td>
                    <td><span class={`badge ${ROLE_BADGE[p.role]}`}>{ROLE_LABEL[p.role]}</span>{!p.active && <span class="badge badge-bad" style={{ marginLeft: '6px' }}>Disabled</span>}</td>
                    <td class="small">{isAdminRole(p.role) ? <span class="muted">All</span> : p.sections.map(sectionName).join(', ') || <span class="muted">None assigned</span>}</td>
                    <td>{i ? <span class={`badge ${i.mfa ? 'badge-ok' : ''}`}>{i.mfa ? 'On' : 'Off'}</span> : '—'}{bypass[p.id] && <span class="badge badge-warn" style={{ marginLeft: '6px' }} title={`Expires ${new Date(bypass[p.id].expires_at).toLocaleString()}`}>Bypass code</span>}</td>
                    <td class="small nowrap">{i?.last_sign_in_at ? timeAgo(i.last_sign_in_at) : <span class="muted">Never</span>}</td>
                    <td class="col-actions"><button class="btn btn-sm" disabled={isAdminRole(p.role) && !me.isSuperAdmin && p.id !== me.userId} title={isAdminRole(p.role) && !me.isSuperAdmin && p.id !== me.userId ? 'Only super admins can manage admin accounts' : undefined} onClick={() => setEditing(p)}><Icon name="pencil" size={13} /> Manage</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {editing === 'new' && <CreateModal onClose={() => setEditing(null)} onCreated={(c) => { setEditing(null); setCredential(c); refresh(); }} />}
      {editing && editing !== 'new' && (
        <EditModal person={editing} isSelf={editing.id === me.userId} lastAdmin={editing.active && ((isAdminRole(editing.role) && adminLevel <= 1) || (editing.role === 'super_admin' && supers <= 1))}
          bypass={bypass[editing.id]} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }}
          onCredential={setCredential} onBypass={(b) => { setEditing(null); setBypassCode(b); refresh(); }} />
      )}
      {credential && <CredentialModal {...credential} onClose={() => setCredential(null)} />}
      {bypassCode && <BypassModal {...bypassCode} onClose={() => setBypassCode(null)} />}
    </div>
  );
}

function CredentialModal({ email, password, onClose }: { email: string; password: string; onClose: () => void }) {
  return (
    <Modal title="Temporary password" onClose={onClose} footer={<button class="btn btn-primary" onClick={onClose}>I’ve shared it</button>}>
      <div class="stack" style={{ '--stack': '12px' }}>
        <div class="notice notice-warn"><Icon name="warning" /><div>This is the only time the password is shown. Share it with <strong>{email}</strong> in person or over a private message — not in a group chat. It is a one-time sign-in password that replaces whatever they had before: they use it once, then choose their own straight away. Their two-factor setup is not affected.</div></div>
        <div class="secret-box"><code>{password}</code><button class="btn btn-sm" onClick={() => { navigator.clipboard.writeText(password); toast('Copied', 'ok'); }}><Icon name="copy" size={14} /> Copy</button></div>
        <p class="small muted">Sign-in address: <code>{location.origin}/newsroom/</code></p>
      </div>
    </Modal>
  );
}

function BypassModal({ name, code, expiresAt, onClose }: { name: string; code: string; expiresAt: string; onClose: () => void }) {
  const shown = formatBypassCode(code);
  return (
    <Modal title="Two-factor bypass code" onClose={onClose} footer={<button class="btn btn-primary" onClick={onClose}>I’ve shared it</button>}>
      <div class="stack" style={{ '--stack': '12px' }}>
        <div class="notice notice-warn"><Icon name="warning" /><div>
          This is the only time the code is shown. Give it to <strong>{name}</strong> in person or over the phone. It works <strong>once</strong>, only for them, and only after they sign in with their own password.
        </div></div>
        <div class="secret-box"><code class="bypass-code" data-testid="bypass-code">{shown}</code><button class="btn btn-sm" onClick={() => { navigator.clipboard.writeText(shown); toast('Copied', 'ok'); }}><Icon name="copy" size={14} /> Copy</button></div>
        <p class="small muted">Expires at <strong>{new Date(expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</strong> ({new Date(expiresAt).toLocaleDateString()}), or after 5 wrong tries.
          On the two-factor screen they choose “Can’t use your authenticator?” and type the digits (dashes optional). Their authenticator stays set up.</p>
      </div>
    </Modal>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (c: { email: string; password: string }) => void }) {
  const me = useMe();
  const { sections, staff } = useRefs();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('writer');
  const [secs, setSecs] = useState<string[]>([]);
  const [staffId, setStaffId] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: Event) {
    e.preventDefault();
    const password = tempPassword();
    setBusy(true);
    try {
      await adminUsers({ action: 'create', email: email.trim(), password, display_name: name.trim(), role, sections: secs, staff_member_id: staffId || null });
      toast('Account created', 'ok');
      onCreated({ email: email.trim(), password });
    } catch (err) { toastError(err); setBusy(false); }
  }
  return (
    <Modal title="Add an account" onClose={onClose} width={640}
      footer={<><button class="btn" onClick={onClose}>Cancel</button><button form="create-user" class="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button></>}>
      <form id="create-user" class="form-grid" onSubmit={submit}>
        <TextField label="Email" type="email" required value={email} onChange={setEmail} hint="Use the address they’ll actually check." />
        <TextField label="Display name" required value={name} onChange={setName} max={120} />
        <SelectField label="Role" value={role} onChange={(v) => setRole(v as Role)} options={rolesFor(me.isSuperAdmin).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          hint={me.isSuperAdmin ? undefined : 'Only super admins can create admin accounts.'} />
        <SelectField label="Linked staff profile" value={staffId} onChange={setStaffId} hint="Lets them edit their own public bio."
          options={[{ value: '', label: '— none —' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
        {!isAdminRole(role) && <SectionPicker class="full" label="Sections they can write for" value={secs} onChange={setSecs} sections={sections.filter((s) => s.active)} hint="Writers can only draft stories in these sections. Section leaders can also publish in them." />}
        <p class="small muted full">A one-time temporary password is generated for you to hand over. {isAdminRole(role) ? 'Admin-level accounts will be asked to set up an authenticator app at first sign-in.' : ''}</p>
      </form>
    </Modal>
  );
}

const BYPASS_WINDOWS = [
  { value: '15', label: '15 minutes' }, { value: '60', label: '1 hour' },
  { value: '240', label: '4 hours' }, { value: '1440', label: '24 hours' },
];

function EditModal({ person, isSelf, lastAdmin, bypass, onClose, onSaved, onCredential, onBypass }: {
  person: Profile; isSelf: boolean; lastAdmin: boolean; bypass?: BypassInfo; onClose: () => void; onSaved: () => void;
  onCredential: (c: { email: string; password: string }) => void;
  onBypass: (b: { name: string; code: string; expiresAt: string }) => void;
}) {
  const me = useMe();
  const { sections, staff } = useRefs();
  const roleOptions = ROLE_ORDER.filter((r) => rolesFor(me.isSuperAdmin).includes(r) || r === person.role);
  const [name, setName] = useState(person.display_name);
  const [role, setRole] = useState<Role>(person.role);
  const [secs, setSecs] = useState<string[]>(person.sections);
  const [staffId, setStaffId] = useState(person.staff_member_id ?? '');
  const [active, setActive] = useState(person.active);
  const [lifespan, setLifespan] = useState('60');
  const [busy, setBusy] = useState(false);

  async function run<T>(fn: () => Promise<T>, ok: string, done = true) {
    setBusy(true);
    try { await fn(); toast(ok, 'ok'); if (done) onSaved(); } catch (e) { toastError(e); } finally { setBusy(false); }
  }
  const save = (e: Event) => { e.preventDefault(); return run(async () => {
    const res = await sessionClient().from('profiles').update({ display_name: name.trim(), role, sections: isAdminRole(role) ? [] : secs, staff_member_id: staffId || null }).eq('id', person.id).select('id');
    if (res.error) throw new Error(res.error.message);
    if (!res.data?.length) throw new Error('Nothing was saved.');
    if (active !== person.active) await adminUsers({ action: 'set_active', user_id: person.id, active });
  }, 'Saved'); };
  const resetPw = () => {
    if (!confirm(`Reset the password for ${person.email}? Their current password stops working immediately; they’ll sign in with a temporary one and then choose their own. Their two-factor setup is not affected.`)) return;
    const password = tempPassword();
    return run(async () => { await adminUsers({ action: 'reset_password', user_id: person.id, password }); onCredential({ email: person.email, password }); }, 'Password reset');
  };
  const resetMfa = () => confirm(`Remove ${person.email}’s two-factor device? Their password is unchanged, and they’ll set up a new authenticator at next sign-in. (For a one-off lockout, a bypass code is gentler.)`) &&
    run(() => adminUsers({ action: 'reset_mfa', user_id: person.id }), 'Two-factor reset');
  const makeBypass = () => run(async () => {
    const minutes = Number(lifespan);
    const code = await createBypassCode(person.id, minutes);
    onBypass({ name: person.display_name || person.email, code, expiresAt: new Date(Date.now() + minutes * 60_000).toISOString() });
  }, 'Bypass code created', false);
  const cancelBypass = () => run(() => revokeBypass(person.id), 'Bypass code revoked');
  const remove = () => confirm(`Permanently delete ${person.email}? Their stories stay on the site but lose the account link. Consider disabling instead.`) &&
    run(() => adminUsers({ action: 'delete', user_id: person.id }), 'Account deleted');

  return (
    <Modal title={`Manage ${person.display_name || person.email}`} onClose={onClose} width={680}
      footer={<><button class="btn" onClick={onClose}>Cancel</button><button form="edit-user" class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></>}>
      <form id="edit-user" class="form-grid" onSubmit={save}>
        <TextField label="Display name" required value={name} onChange={setName} max={120} />
        <TextField label="Email" value={person.email} onChange={() => undefined} disabled hint="To change an email, create a new account." />
        <SelectField label="Role" value={role} onChange={(v) => setRole(v as Role)} disabled={lastAdmin || isSelf}
          hint={isSelf ? 'You can’t change your own role.' : lastAdmin ? (person.role === 'super_admin' ? 'This is the only active super admin.' : 'This is the only active admin.') : undefined}
          options={roleOptions.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
        <SelectField label="Linked staff profile" value={staffId} onChange={setStaffId}
          options={[{ value: '', label: '— none —' }, ...staff.map((s) => ({ value: s.id, label: s.name }))]} />
        {!isAdminRole(role) && <SectionPicker class="full" label="Sections" value={secs} onChange={setSecs} sections={sections.filter((s) => s.active)} />}
        <div class="full"><Checkbox label="Account enabled" checked={active} onChange={setActive} disabled={isSelf || lastAdmin} hint={isSelf || lastAdmin ? 'You can’t disable your own account or the last admin (or super admin).' : 'Disabled accounts can’t sign in. Their stories remain.'} /></div>
      </form>
      <hr class="rule" />
      <div class="stack" style={{ '--stack': '10px' }}>
        <h3 class="h3">Account actions</h3>
        <div class="action-row">
          <button class="btn" disabled={busy || isSelf} onClick={resetPw}><Icon name="key" size={15} /> Reset password</button>
          <p class="small muted">Forgot their password? Replaces it with a one-time temporary password for you to hand over; they choose their own at next sign-in. Doesn’t touch two-factor.</p>
        </div>
        <div class="action-row">
          <button class="btn" disabled={busy || isSelf} onClick={resetMfa}><Icon name="shield" size={15} /> Reset two-factor</button>
          <p class="small muted">Lost their authenticator for good? Removes it so they can set up a new one. Keeps their password. For a one-off lockout, use a bypass code below instead.</p>
        </div>
        <div class="action-row">
          <button class="btn btn-danger" disabled={busy || isSelf || lastAdmin} onClick={remove}><Icon name="trash" size={15} /> Delete account</button>
          <p class="small muted">Removes the login permanently. Their stories stay on the site. Disabling the account (above) is usually better.</p>
        </div>
        {isSelf && <p class="small muted">Manage your own password and two-factor under “Account security”.</p>}
      </div>
      <hr class="rule" />
      <div class="stack" style={{ '--stack': '10px' }}>
        <h3 class="h3">Two-factor bypass code</h3>
        <p class="small muted">Forgot their phone today? Give them a one-time code that gets them past the authenticator step for one sign-in. Their password and authenticator both stay as they are. It works once, only for {person.display_name || 'this person'}, and they still need their password.</p>
        {isSelf && <p class="small muted">You can’t make one for yourself — ask another admin.</p>}
        {bypass && (
          <div class={`notice ${bypass.failed_attempts >= 5 ? 'notice-bad' : ''}`}><Icon name="key" /><div class="spread grow">
            <span>{bypass.failed_attempts >= 5 ? 'The outstanding code was locked after 5 wrong tries.' : `A code is outstanding until ${new Date(bypass.expires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`} Making a new one replaces it.</span>
            <button class="btn btn-sm" disabled={busy} onClick={cancelBypass}>Revoke</button>
          </div></div>
        )}
        <div class="row" style={{ 'align-items': 'flex-end' }}>
          <SelectField label="Valid for" value={lifespan} onChange={setLifespan} options={BYPASS_WINDOWS} disabled={isSelf} />
          <button class="btn" disabled={busy || isSelf || !person.active} onClick={makeBypass}><Icon name="key" size={15} /> Create bypass code</button>
        </div>
      </div>
    </Modal>
  );
}
