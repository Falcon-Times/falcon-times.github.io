import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Session } from '@supabase/supabase-js';
import { isConfigured } from '@/lib/config';
import { checkPassword, PASSWORD_RULES_SUMMARY } from '@/lib/passwordPolicy';
import { sessionClient } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { Logo } from '@/ui/Logo';
import { Loading } from '@/ui/States';
import { formatBypassCode } from './bypassCode';
import { DEFAULT_LABEL, setLabel } from './mfaLabels';
import { toastError } from '@/ui/Toast';

export interface Me {
  session: Session;
  userId: string;
  profile: Profile;
  isEditor: boolean;     // section leader or admin
  isAdmin: boolean;
  viaBypass: boolean;    // signed in with a 2FA bypass code instead of an authenticator code
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const MeCtx = createContext<Me | null>(null);
export const useMe = () => {
  const v = useContext(MeCtx);
  if (!v) throw new Error('useMe outside <AuthGate>');
  return v;
};

type Phase =
  | { name: 'loading' }
  | { name: 'signed-out' }
  | { name: 'mfa-verify'; factorId: string }
  | { name: 'mfa-enroll'; forced: boolean }
  | { name: 'password' }
  | { name: 'no-access'; reason: string }
  | { name: 'ready'; session: Session; profile: Profile; viaBypass: boolean };

export function AuthGate({ require: needs, title, children }: {
  require: 'staff' | 'admin'; title: string; children: ComponentChildren;
}) {
  const [phase, setPhase] = useState<Phase>({ name: 'loading' });

  const evaluate = useCallback(async () => {
    if (!isConfigured) return;
    const db = sessionClient();
    const { data: { session } } = await db.auth.getSession();
    if (!session) return setPhase({ name: 'signed-out' });

    const { data: aal } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
    // An admin's one-time bypass code stands in for the authenticator step for this login only.
    const viaBypass = aal?.currentLevel !== 'aal2' && (await db.rpc('mfa_bypass_active')).data === true;
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2' && !viaBypass) {
      const { data: factors } = await db.auth.mfa.listFactors();
      const factor = factors?.totp?.[0];
      if (factor) return setPhase({ name: 'mfa-verify', factorId: factor.id });
    }

    const { data: profile } = await db.from('profiles').select('*').eq('id', session.user.id).maybeSingle();
    if (!profile || !profile.active) {
      return setPhase({ name: 'no-access', reason: 'Your account has not been given access to the newsroom yet. Ask an admin to set up your profile.' });
    }
    if (needs === 'admin' && profile.role !== 'admin') {
      return setPhase({ name: 'no-access', reason: 'This area is for site admins only.' });
    }
    if (session.user.user_metadata?.must_change_password) return setPhase({ name: 'password' });
    if (profile.role === 'admin' && aal?.currentLevel !== 'aal2' && !viaBypass) return setPhase({ name: 'mfa-enroll', forced: true });
    setPhase({ name: 'ready', session, profile: profile as Profile, viaBypass });
  }, [needs]);

  useEffect(() => {
    if (!isConfigured) return;
    evaluate().catch((e) => { toastError(e); setPhase({ name: 'signed-out' }); });
    const { data: sub } = sessionClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setPhase({ name: 'signed-out' });
    });
    return () => sub.subscription.unsubscribe();
  }, [evaluate]);

  if (!isConfigured) {
    return (
      <Shell title={title}>
        <div class="notice notice-warn"><Icon name="warning" /><div>
          <strong>The backend isn’t connected.</strong>
          <p>This site was built without its Supabase settings. Follow <code>docs/SETUP.md</code> to add the <code>SUPABASE_URL</code> and <code>SUPABASE_ANON_KEY</code> GitHub secrets, then redeploy.</p>
        </div></div>
      </Shell>
    );
  }

  const signOut = async () => { await sessionClient().auth.signOut(); setPhase({ name: 'signed-out' }); };

  switch (phase.name) {
    case 'loading': return <Shell title={title}><Loading /></Shell>;
    case 'signed-out': return <Shell title={title}><LoginForm onDone={evaluate} /></Shell>;
    case 'mfa-verify': return <Shell title={title}><MfaVerify factorId={phase.factorId} onDone={evaluate} onCancel={signOut} /></Shell>;
    case 'password': return <Shell title={title}><ChangePassword forced onDone={async () => { await sessionClient().auth.refreshSession(); await evaluate(); }} /></Shell>;
    case 'mfa-enroll': return <Shell title={title}><MfaEnroll forced onDone={evaluate} onCancel={signOut} /></Shell>;
    case 'no-access': return (
      <Shell title={title}>
        <div class="notice notice-bad"><Icon name="lock" /><div>{phase.reason}</div></div>
        <button class="btn" onClick={signOut}><Icon name="logout" size={16} /> Sign out</button>
      </Shell>
    );
    case 'ready': {
      const me: Me = {
        session: phase.session, userId: phase.session.user.id, profile: phase.profile,
        isEditor: phase.profile.role === 'editor' || phase.profile.role === 'admin',
        isAdmin: phase.profile.role === 'admin', viaBypass: phase.viaBypass, signOut, refresh: evaluate,
      };
      return <MeCtx.Provider value={me}>{children}</MeCtx.Provider>;
    }
  }
}

/** Centered card used for every pre-login screen. */
export function Shell({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-brand"><Logo size={52} /><div><strong>The Falcon Times</strong><span>{title}</span></div></div>
        <div class="stack" style={{ '--stack': '16px' }}>{children}</div>
      </div>
      <p class="auth-foot small muted">Authorized students only. Activity in this area is logged.</p>
    </div>
  );
}

function LoginForm({ onDone }: { onDone: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error: err } = await sessionClient().auth.signInWithPassword({ email: email.trim(), password });
    if (err) { setBusy(false); setError('That email and password didn’t match. Check them and try again.'); return; }
    await onDone();
    setBusy(false);
  }
  return (
    <form class="stack" style={{ '--stack': '14px' }} onSubmit={submit}>
      <h1 class="auth-h">Sign in</h1>
      <label class="field"><span class="label">Email</span>
        <input class="input" type="email" autocomplete="username" required value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} /></label>
      <label class="field"><span class="label">Password</span>
        <input class="input" type="password" autocomplete="current-password" required value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} /></label>
      {error && <div class="notice notice-bad" role="alert"><Icon name="warning" />{error}</div>}
      <button class="btn btn-primary btn-block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      <p class="small muted">Accounts are created by an admin. Forgot your password? Ask them for a new temporary one.</p>
    </form>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input class="input code-input" inputMode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxLength={6}
      placeholder="123456" required value={value} onInput={(e) => onChange((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
  );
}

function MfaVerify({ factorId, onDone, onCancel }: { factorId: string; onDone: () => Promise<void>; onCancel: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [useBypass, setUseBypass] = useState(false);
  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error: err } = await sessionClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (err) { setBusy(false); setError('That code didn’t work. Codes change every 30 seconds — try the current one.'); return; }
    await onDone();
    setBusy(false);
  }
  if (useBypass) return <BypassForm onDone={onDone} onBack={() => setUseBypass(false)} />;
  return (
    <form class="stack" style={{ '--stack': '14px' }} onSubmit={submit}>
      <h1 class="auth-h">Two-factor code</h1>
      <p class="muted">Open your authenticator app and enter the 6-digit code for The Falcon Times.</p>
      <label class="field"><span class="label">6-digit code</span><CodeInput value={code} onChange={setCode} /></label>
      {error && <div class="notice notice-bad" role="alert"><Icon name="warning" />{error}</div>}
      <button class="btn btn-primary btn-block" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify'}</button>
      <button type="button" class="btn btn-ghost btn-block" onClick={() => setUseBypass(true)}>Can’t use your authenticator? Enter a bypass code</button>
      <button type="button" class="btn btn-ghost btn-block" onClick={onCancel}>Use a different account</button>
    </form>
  );
}

function BypassForm({ onDone, onBack }: { onDone: () => Promise<void>; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true); setError('');
    const { data, error: err } = await sessionClient().rpc('redeem_mfa_bypass', { p_code: code });
    if (err || data !== true) {
      setBusy(false);
      setError('That code didn’t work. It may be mistyped, already used or expired — and it stops working after 5 wrong tries. Ask an admin for a new one.');
      return;
    }
    await onDone();
    setBusy(false);
  }
  return (
    <form class="stack" style={{ '--stack': '14px' }} onSubmit={submit}>
      <h1 class="auth-h">Bypass code</h1>
      <p class="muted">An admin can give you a one-time code that skips the authenticator step for this sign-in. Your authenticator keeps working afterwards.</p>
      <label class="field"><span class="label">10-digit bypass code</span>
        <input class="input code-input code-input-wide" inputMode="numeric" autocomplete="off" placeholder="123-456-7890" maxLength={12} required
          value={code} onInput={(e) => setCode(formatBypassCode((e.target as HTMLInputElement).value))} /></label>
      {error && <div class="notice notice-bad" role="alert"><Icon name="warning" />{error}</div>}
      <button class="btn btn-primary btn-block" disabled={busy || code.replace(/\D/g, '').length !== 10}>{busy ? 'Checking…' : 'Sign in'}</button>
      <button type="button" class="btn btn-ghost btn-block" onClick={onBack}>Back to the authenticator code</button>
    </form>
  );
}

export function MfaEnroll({ forced = false, onDone, onCancel }: { forced?: boolean; onDone: () => void | Promise<void>; onCancel?: () => void }) {
  const [info, setInfo] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState(DEFAULT_LABEL);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const db = sessionClient();
      // Clear half-finished enrolments so re-tries don't collide.
      const { data: factors } = await db.auth.mfa.listFactors();
      for (const f of factors?.all ?? []) if (f.status === 'unverified') await db.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: err } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: `device-${Math.random().toString(36).slice(2, 8)}` });
      if (err || !data) { setError(err?.message ?? 'Could not start two-factor setup.'); return; }
      setInfo({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
  }, []);

  async function submit(e: Event) {
    e.preventDefault();
    if (!info) return;
    setBusy(true); setError('');
    const { error: err } = await sessionClient().auth.mfa.challengeAndVerify({ factorId: info.id, code });
    if (err) { setBusy(false); setError('That code didn’t match. Make sure your phone’s clock is automatic and try the newest code.'); return; }
    await setLabel(info.id, name).catch(() => undefined); // cosmetic; never block sign-in on it
    await onDone();
    setBusy(false);
  }

  return (
    <form class="stack" style={{ '--stack': '14px' }} onSubmit={submit}>
      <h1 class="auth-h">Set up two-factor sign-in</h1>
      <p class="muted">
        {forced ? 'Admin accounts are protected with a second step. ' : ''}
        Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password, Microsoft Authenticator…), then enter the 6-digit code it shows.
      </p>
      {info ? (
        <>
          <div class="qr"><img src={info.qr} alt="QR code for your authenticator app" width={180} height={180} /></div>
          <details class="small"><summary>Can’t scan? Enter this key manually</summary><code class="secret">{info.secret}</code></details>
          <label class="field"><span class="label">Name this device <span class="muted">(optional)</span></span>
            <input class="input" value={name} maxLength={40} placeholder={DEFAULT_LABEL} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            <span class="hint">So you can tell them apart later, e.g. “Bitwarden” or “Phone”.</span></label>
          <label class="field"><span class="label">6-digit code</span><CodeInput value={code} onChange={setCode} /></label>
        </>
      ) : !error && <Loading label="Preparing…" />}
      {error && <div class="notice notice-bad" role="alert"><Icon name="warning" />{error}</div>}
      <button class="btn btn-primary btn-block" disabled={busy || !info || code.length !== 6}>{busy ? 'Checking…' : 'Turn on two-factor'}</button>
      {onCancel && <button type="button" class="btn btn-ghost btn-block" onClick={onCancel}>{forced ? 'Sign out' : 'Cancel'}</button>}
    </form>
  );
}

/** Friendlier wording for Supabase's own weak-password rejection (it knows about breached passwords too). */
function weakPasswordMessage(err: { code?: string; message: string; reasons?: string[] }): string {
  if (err.code !== 'weak_password' && !err.reasons) return err.message;
  const reasons = err.reasons ?? [];
  if (reasons.includes('pwned')) return 'That password has appeared in a known data breach, so it isn’t safe to use. Choose a different one.';
  return `That password doesn’t meet the rules. ${PASSWORD_RULES_SUMMARY}`;
}

export function ChangePassword({ forced = false, onDone }: { forced?: boolean; onDone?: () => void | Promise<void> }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  const checks = checkPassword(pw);
  const strong = checks.every((c) => c.ok);
  async function submit(e: Event) {
    e.preventDefault();
    setError(''); setOk(false);
    if (!strong) return setError(`That password doesn’t meet the rules. ${PASSWORD_RULES_SUMMARY}`);
    if (pw !== pw2) return setError('The two passwords don’t match.');
    setBusy(true);
    const { error: err } = await sessionClient().auth.updateUser({ password: pw, data: { must_change_password: false } });
    setBusy(false);
    if (err) return setError(weakPasswordMessage(err as never));
    setPw(''); setPw2(''); setOk(true);
    await onDone?.();
  }
  return (
    <form class="stack" style={{ '--stack': '14px' }} onSubmit={submit}>
      <h1 class={forced ? 'auth-h' : 'h3'}>{forced ? 'Choose your own password' : 'Change password'}</h1>
      {forced && <p class="muted">You signed in with a temporary password. Pick a new one that only you know.</p>}
      <label class="field"><span class="label">New password</span>
        <input class="input" type="password" autocomplete="new-password" required value={pw} aria-describedby="pw-rules" onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
        <span class="hint">A few random words with a capital and a number make a great passphrase.</span></label>
      <ul class="checklist" id="pw-rules" aria-label="Password rules">
        {checks.map((c) => (
          <li key={c.id} class={c.ok ? 'ok' : ''}>
            <Icon name={c.ok ? 'circle-check' : 'clock'} size={15} /> {c.label}
            <span class="sr-only">{c.ok ? ' — met' : ' — not met yet'}</span>
          </li>
        ))}
      </ul>
      <label class="field"><span class="label">Confirm new password</span>
        <input class="input" type="password" autocomplete="new-password" required value={pw2} onInput={(e) => setPw2((e.target as HTMLInputElement).value)} />
        {pw2 && pw !== pw2 && <span class="hint">The two passwords don’t match yet.</span>}</label>
      {error && <div class="notice notice-bad" role="alert"><Icon name="warning" />{error}</div>}
      {ok && !forced && <div class="notice notice-ok" role="status"><Icon name="circle-check" />Password updated.</div>}
      <button class="btn btn-primary" disabled={busy || !strong || pw !== pw2}>{busy ? 'Saving…' : 'Save new password'}</button>
    </form>
  );
}
