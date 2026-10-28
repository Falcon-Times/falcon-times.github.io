// Admin-only account management for The Falcon Times.
//
// Creating, disabling and deleting logins needs Supabase's *service-role* key,
// which must never reach a browser. This Edge Function is the only place that
// key is used (Supabase injects it as SUPABASE_SERVICE_ROLE_KEY — it is not
// stored in this repository or in GitHub). Before doing anything it asks the
// database whether the caller is an admin who has passed two-factor (the
// is_admin() function), so a stolen password alone cannot call it.
import { createClient } from '@supabase/supabase-js';
import { PASSWORD_RULES_SUMMARY, isStrongPassword } from '../_shared/passwordPolicy.ts';

// Callers authenticate with a bearer token (not cookies), so a wildcard origin is safe.
const cors: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const ROLES = ['writer', 'editor', 'admin', 'super_admin'];
const ADMIN_LEVEL = ['admin', 'super_admin'];   // only super admins may manage these accounts
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    // Echo whatever headers the browser says it will send (supabase-js adds a few of its own).
    const asked = req.headers.get('Access-Control-Request-Headers');
    return new Response('ok', { headers: { ...cors, ...(asked ? { 'Access-Control-Allow-Headers': asked } : {}) } });
  }
  if (req.method !== 'POST') return json(405, { error: 'POST only.' });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'Please sign in.');

    // 1. Who is calling, and are they a (two-factor) admin?
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: isAdmin, error: adminErr } = await caller.rpc('is_admin');
    if (adminErr || isAdmin !== true) {
      throw new HttpError(403, 'Only admins who have signed in with two-factor can do this.');
    }
    const { data: isSuper } = await caller.rpc('is_super_admin');
    const callerIsSuper = isSuper === true;
    const { data: who } = await caller.auth.getUser(token);
    const callerId = who.user?.id;
    if (!callerId) throw new HttpError(401, 'Please sign in again.');

    // 2. Privileged client — never leaves this function.
    const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const body = await req.json().catch(() => ({}));
    const audit = async (summary: string, rowId?: string) => {
      const { data: me } = await admin.from('profiles').select('email').eq('id', callerId).maybeSingle();
      await admin.from('audit_log').insert({
        actor: callerId, actor_email: me?.email ?? null, table_name: 'profiles', op: 'ACCOUNT', row_id: rowId ?? null, summary,
      });
    };
    const needUser = (): string => {
      if (typeof body.user_id !== 'string' || !UUID.test(body.user_id)) throw new HttpError(400, 'Missing user.');
      return body.user_id;
    };
    const activeWithRole = async (roles: string[], excluding: string) => {
      const { count } = await admin.from('profiles').select('id', { count: 'exact', head: true })
        .in('role', roles).eq('active', true).neq('id', excluding);
      return count ?? 0;
    };
    /** Load the account being acted on, and refuse unless the caller may manage it. */
    const manageable = async (id: string) => {
      const { data: target } = await admin.from('profiles').select('role,email').eq('id', id).maybeSingle();
      if (target && ADMIN_LEVEL.includes(target.role) && !callerIsSuper) {
        throw new HttpError(403, 'Only super admins can manage admin accounts.');
      }
      return target;
    };
    /** Don't let the last admin-level account, or the last super admin, disappear. */
    const keepAdmins = async (id: string, target: { role: string } | null) => {
      if (!target) return;
      if (ADMIN_LEVEL.includes(target.role) && (await activeWithRole(ADMIN_LEVEL, id)) === 0) {
        throw new HttpError(400, 'At least one active admin must remain.');
      }
      if (target.role === 'super_admin' && (await activeWithRole(['super_admin'], id)) === 0) {
        throw new HttpError(400, 'At least one active super admin must remain.');
      }
    };

    switch (body.action) {
      case 'list': {
        const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (error) throw new HttpError(500, error.message);
        // The list endpoint doesn't include each user's second factors, so ask per user
        // (a newsroom has tens of accounts, not thousands). Failures just read as "off".
        const hasFactor = async (userId: string): Promise<boolean> => {
          const { data: f } = await admin.auth.admin.mfa.listFactors({ userId });
          return (f?.factors ?? []).some((x) => x.status === 'verified');
        };
        const mfa = new Map<string, boolean>();
        for (let i = 0; i < data.users.length; i += 10) {
          const chunk = data.users.slice(i, i + 10);
          const results = await Promise.all(chunk.map((u) => hasFactor(u.id).catch(() => false)));
          chunk.forEach((u, j) => mfa.set(u.id, results[j]));
        }
        const users = data.users.map((u) => ({
          id: u.id,
          last_sign_in_at: u.last_sign_in_at ?? null,
          banned: Boolean(u.banned_until && new Date(u.banned_until) > new Date()),
          mfa: mfa.get(u.id) ?? false,
        }));
        return json(200, { users });
      }

      case 'create': {
        const email = String(body.email ?? '').trim().toLowerCase();
        const password = String(body.password ?? '');
        const role = String(body.role ?? 'writer');
        const name = String(body.display_name ?? '').trim().slice(0, 120);
        const sections = Array.isArray(body.sections) ? body.sections.filter((s: unknown) => typeof s === 'string') : [];
        const staffId = typeof body.staff_member_id === 'string' && UUID.test(body.staff_member_id) ? body.staff_member_id : null;
        if (!EMAIL.test(email)) throw new HttpError(400, 'Enter a valid email address.');
        if (!isStrongPassword(password)) throw new HttpError(400, `That temporary password breaks the password rules. ${PASSWORD_RULES_SUMMARY}`);
        if (!ROLES.includes(role)) throw new HttpError(400, 'Unknown role.');
        if (ADMIN_LEVEL.includes(role) && !callerIsSuper) throw new HttpError(403, 'Only super admins can create admin accounts.');
        if (!name) throw new HttpError(400, 'Enter a display name.');

        const { data, error } = await admin.auth.admin.createUser({
          email, password, email_confirm: true,
          user_metadata: { must_change_password: true, full_name: name },
        });
        if (error || !data.user) {
          throw new HttpError(400, /already|registered|exists/i.test(error?.message ?? '') ? 'An account with that email already exists.' : (error?.message ?? 'Could not create the account.'));
        }
        const { error: pErr } = await admin.from('profiles').insert({
          id: data.user.id, email, display_name: name, role, sections: ADMIN_LEVEL.includes(role) ? [] : sections,
          staff_member_id: staffId, active: true,
        });
        if (pErr) {
          await admin.auth.admin.deleteUser(data.user.id); // roll back the half-made account
          throw new HttpError(400, pErr.message);
        }
        await audit(`created ${role} account ${email}`, data.user.id);
        return json(200, { user_id: data.user.id });
      }

      case 'reset_password': {
        const id = needUser();
        await manageable(id);
        const password = String(body.password ?? '');
        if (!isStrongPassword(password)) throw new HttpError(400, `That temporary password breaks the password rules. ${PASSWORD_RULES_SUMMARY}`);
        const { data: existing, error: gErr } = await admin.auth.admin.getUserById(id);
        if (gErr || !existing.user) throw new HttpError(404, 'No such account.');
        const { error } = await admin.auth.admin.updateUserById(id, {
          password, user_metadata: { ...existing.user.user_metadata, must_change_password: true },
        });
        if (error) throw new HttpError(400, error.message);
        await audit(`reset password for ${existing.user.email}`, id);
        return json(200, { ok: true });
      }

      case 'reset_mfa': {
        const id = needUser();
        await manageable(id);
        const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: id });
        if (error) throw new HttpError(400, error.message);
        for (const f of data?.factors ?? []) {
          const { error: dErr } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: id });
          if (dErr) throw new HttpError(400, dErr.message);
        }
        await audit('reset two-factor devices', id);
        return json(200, { ok: true });
      }

      case 'set_active': {
        const id = needUser();
        const active = body.active === true;
        if (!active && id === callerId) throw new HttpError(400, 'You can’t disable your own account.');
        const target = await manageable(id);
        if (!active) await keepAdmins(id, target);
        const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: active ? 'none' : '876000h' });
        if (error) throw new HttpError(400, error.message);
        const { error: pErr } = await admin.from('profiles').update({ active }).eq('id', id);
        if (pErr) throw new HttpError(400, pErr.message);
        await audit(active ? 'enabled account' : 'disabled account', id);
        return json(200, { ok: true });
      }

      case 'delete': {
        const id = needUser();
        if (id === callerId) throw new HttpError(400, 'You can’t delete your own account.');
        const target = await manageable(id);
        await keepAdmins(id, target);
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw new HttpError(400, error.message);
        await audit(`deleted account ${target?.email ?? ''}`, id);
        return json(200, { ok: true });
      }

      default:
        throw new HttpError(400, 'Unknown action.');
    }
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Something went wrong on the server.' });
  }
});
