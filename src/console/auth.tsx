import { createContext } from 'preact';
import { useCallback, useContext, useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { Session } from '@supabase/supabase-js';
import { isConfigured } from '@/lib/config';
import { sessionClient } from '@/lib/supabase';
import type { Profile } from '@/lib/types';
import { Icon } from '@/ui/Icon';
import { Logo } from '@/ui/Logo';
import { Loading } from '@/ui/States';
import { toastError } from '@/ui/Toast';

export interface Me {
  session: Session;
  userId: string;
  profile: Profile;
  isEditor: boolean;     // section leader or admin
  isAdmin: boolean;
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
  | { name: 'ready'; session: Session; profile: Profile };

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
    if (aal && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
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
    if (profile.role === 'admin' && aal?.currentLevel !== 'aal2') return setPhase({ name: 'mfa-enroll', forced: true });
    setPhase({ name: 'ready', session, profile: profile as Profile });
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
        isAdmin: phase.profile.role === 'admin', signOut, refresh: evaluate,
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
  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error: err } = await sessionClient().auth.mfa.challengeAndVerify({ factorId, code });
    if (err) { setBusy(false); setError('That code didn’t work. Codes change every 30 seconds — try the current one.'); return; }
    await onDone();
    setBusy(false);
  }
  return (
    <form class="stack" style={{ '--stack': '14px' }} onSubmit={submit}>
      <h1 class="auth-h">Two-factor code</h1>
      <p class="muted">Open your authenticator app and enter the 6-digit code for The Falcon Times.</p>
      <label class="field"><span class="label">6-digit code</span><CodeInput value={code} onChange={setCode} /></label>
      {error && <div class="notice notice-bad" role="alert"><Icon name="warning" />{error}</div>}
      <button class="btn btn-primary btn-block" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify'}</button>
      <button type="button" class="btn btn-ghost btn-block" onClick={onCancel}>Use a different account</button>
    </form>
  );
}

export function MfaEnroll({ forced = false, onDone, onCancel }: { forced?: boolean; onDone: () => void | Promise<void>; onCancel?: () => void }) {
  const [info, setInfo] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const db = sessionClient();
      // Clear half-finished enrolments so re-tries don't collide.
      const { data: factors } = await db.auth.mfa.listFactors();
      for (const f of factors?.all ?? []) if (f.status === 'unverified') await db.auth.mfa.unenroll({ factorId: f.id });
      const { data, error: err } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}` });
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
          <label class="field"><span class="label">6-digit code</span><CodeInput value={code} onChange={setCode} /></label>
        </>
      ) : !error && <Loading label="Preparing…" />}
      {error && <div class="notice notice-bad" role="alert"><Icon name="warning" />{error}</div>}
      <button class="btn btn-primary btn-block" disabled={busy || !info || code.length !== 6}>{busy ? 'Checking…' : 'Turn on two-factor'}</button>
      {onCancel && <button type="button" class="btn btn-ghost btn-block" onClick={onCancel}>{forced ? 'Sign out' : 'Cancel'}</button>}
    </form>
  );
}

export function ChangePassword({ forced = false, onDone }: { forced?: boolean; onDone?: () => void | Promise<void> }) {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  async function submit(e: Event) {
    e.preventDefault();
    setError(''); setOk(false);
    if (pw.length < 12) return setError('Use at least 12 characters — a few random words make a great passphrase.');
    if (pw !== pw2) return setError('The two passwords don’t match.');
    setBusy(true);
    const { error: err } = await sessionClient().auth.updateUser({ password: pw, data: { must_change_password: false } });
    setBusy(false);
    if (err) return setError(err.message);
    setPw(''); setPw2(''); setOk(true);
    await onDone?.();
  }
  return (
    <form class="stack" style={{ '--stack': '14px' }} onSubmit={submit}>
      <h1 class={forced ? 'auth-h' : 'h3'}>{forced ? 'Choose your own password' : 'Change password'}</h1>
      {forced && <p class="muted">You signed in with a temporary password. Pick a new one that only you know.</p>}
      <label class="field"><span class="label">New password</span>
        <input class="input" type="password" autocomplete="new-password" minLength={12} required value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
        <span class="hint">At least 12 characters.</span></label>
      <label class="field"><span class="label">Confirm new password</span>
        <input class="input" type="password" autocomplete="new-password" required value={pw2} onInput={(e) => setPw2((e.target as HTMLInputElement).value)} /></label>
      {error && <div class="notice notice-bad" role="alert"><Icon name="warning" />{error}</div>}
      {ok && !forced && <div class="notice notice-ok" role="status"><Icon name="circle-check" />Password updated.</div>}
      <button class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button>
    </form>
  );
}
