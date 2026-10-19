// A tiny local stand-in for Supabase, used only by the end-to-end tests:
//
//   browser ──► this gateway ──► PostgREST ──► PostgreSQL (real schema + RLS)
//                   │
//                   ├─ fake GoTrue   (/auth/v1)       passwords, sessions, TOTP "2FA" (code 123456)
//                   ├─ fake Storage  (/storage/v1)    in-memory uploads
//                   └─ the REAL admin-users Edge Function code (/functions/v1/admin-users)
//
// Requires: a PostgreSQL server with the migrations applied (scripts/test-db.sh
// style) and a `postgrest` binary. See tests/harness/run.sh.
import http from 'node:http';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import pg from 'pg';

const PORT = Number(process.env.HARNESS_PORT ?? 54330);
const POSTGREST = process.env.POSTGREST_URL ?? 'http://127.0.0.1:54331';
const JWT_SECRET = process.env.JWT_SECRET ?? 'super-secret-jwt-token-for-local-tests-only-0123456789';
const DB = {
  host: process.env.PGHOST ?? '127.0.0.1', port: Number(process.env.PGPORT ?? 5432),
  user: process.env.PGUSER ?? 'postgres', database: process.env.E2E_DB ?? 'falcon_e2e',
};
const BASE = `http://127.0.0.1:${PORT}`;
const TOTP_CODE = '123456';

const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function sign(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const body = b64(payload);
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
const now = () => Math.floor(Date.now() / 1000);
// Fixed timestamps keep the keys stable between runs.
export const ANON_KEY = sign({ role: 'anon', iss: 'falcon-harness', iat: 1700000000, exp: 4102444800 });
export const SERVICE_KEY = sign({ role: 'service_role', iss: 'falcon-harness', iat: 1700000000, exp: 4102444800 });

const pool = new pg.Pool(DB);

// ---- in-memory auth state --------------------------------------------------
/** id -> { id, email, password, meta, factors:[{id,status,friendly_name}], banned } */
const users = new Map();
/** refresh_token -> { userId, aal } */
const refreshTokens = new Map();
const objects = new Map();

function publicUser(u) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: u.meta,
    factors: u.factors.map((f) => ({ id: f.id, friendly_name: f.friendly_name, factor_type: 'totp', status: f.status, created_at: f.created_at, updated_at: f.created_at })),
    created_at: u.created_at, updated_at: new Date().toISOString(), last_sign_in_at: u.last_sign_in_at ?? null,
    banned_until: u.banned ? new Date(Date.now() + 1e12).toISOString() : null,
  };
}
function session(u, aal = 'aal1') {
  const iat = now();
  const access = sign({
    aud: 'authenticated', exp: iat + 3600, iat, iss: `${BASE}/auth/v1`, sub: u.id, email: u.email, role: 'authenticated',
    aal, amr: aal === 'aal2' ? [{ method: 'totp', timestamp: iat }, { method: 'password', timestamp: iat }] : [{ method: 'password', timestamp: iat }],
    session_id: crypto.randomUUID(), user_metadata: u.meta,
  });
  const refresh = crypto.randomBytes(8).toString('hex');
  refreshTokens.set(refresh, { userId: u.id, aal });
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: iat + 3600, refresh_token: refresh, user: publicUser(u) };
}
function claims(req) {
  const h = req.headers.authorization ?? '';
  const t = h.replace(/^Bearer\s+/i, '');
  const [head, body, sig] = t.split('.');
  if (!sig) return null;
  const expect = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  if (expect !== sig) return null;
  const c = JSON.parse(Buffer.from(body, 'base64url').toString());
  return c.exp && c.exp < now() ? null : c;
}

export async function createUser({ email, password, meta = {} }) {
  const id = crypto.randomUUID();
  const u = { id, email: email.toLowerCase(), password, meta, factors: [], created_at: new Date().toISOString(), banned: false };
  users.set(id, u);
  await pool.query('insert into auth.users (id, email) values ($1, $2) on conflict (id) do nothing', [id, u.email]);
  return u;
}
const byEmail = (email) => [...users.values()].find((u) => u.email === String(email).toLowerCase());

// ---- helpers --------------------------------------------------------------
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks);
}
const send = (res, status, body, headers = {}) => {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, { 'content-type': isBuf ? 'application/octet-stream' : 'application/json', 'access-control-allow-origin': '*', ...headers });
  res.end(isBuf ? body : JSON.stringify(body));
};
const err = (res, status, msg, code) => send(res, status, { code: status, error_code: code ?? 'error', msg, message: msg });

// ---- the real Edge Function, loaded into this process ------------------------
let edgeHandler;
async function loadEdge() {
  process.env.SUPABASE_URL = BASE;
  process.env.SUPABASE_ANON_KEY = ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
  globalThis.Deno = { env: { get: (k) => process.env[k] }, serve: (h) => { edgeHandler = h; } };
  await import(pathToFileURL(resolve('supabase/functions/admin-users/index.ts')).href);
}

// ---- gateway ---------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname;
  if (req.method === 'OPTIONS') {
    return send(res, 204, '', {
      'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*',
    });
  }
  try {
    // PostgREST ---------------------------------------------------------------
    if (path.startsWith('/rest/v1/')) {
      const body = await readBody(req);
      const headers = { ...req.headers, host: new URL(POSTGREST).host };
      delete headers['content-length'];
      const upstream = await fetch(POSTGREST + path.replace('/rest/v1', '') + url.search, {
        method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
      });
      const out = Buffer.from(await upstream.arrayBuffer());
      const h = Object.fromEntries(upstream.headers.entries());
      delete h['content-encoding']; delete h['transfer-encoding'];
      res.writeHead(upstream.status, { ...h, 'access-control-allow-origin': '*', 'access-control-expose-headers': '*' });
      return res.end(out);
    }

    // Edge function -----------------------------------------------------------------
    if (path === '/functions/v1/admin-users') {
      const body = await readBody(req);
      const r = await edgeHandler(new Request(`${BASE}${path}`, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body }));
      const text = await r.text();
      res.writeHead(r.status, { ...Object.fromEntries(r.headers.entries()), 'access-control-allow-origin': '*' });
      return res.end(text);
    }

    // Storage ---------------------------------------------------------------------------
    if (path.startsWith('/storage/v1/object/public/')) {
      const o = objects.get(path.replace('/storage/v1/object/public/', ''));
      return o ? send(res, 200, o.data, { 'content-type': o.type }) : err(res, 404, 'not found');
    }
    if (path.startsWith('/storage/v1/object/') && req.method === 'POST') {
      if (!claims(req) || claims(req).role !== 'authenticated') return err(res, 401, 'unauthorized');
      const raw = await readBody(req);
      const type = req.headers['content-type'] ?? 'application/octet-stream';
      let data = raw; let ctype = type;
      if (type.startsWith('multipart/form-data')) {
        const m = raw.toString('latin1').match(/\r\n\r\n([\s\S]*)\r\n--[^\r\n]+--\r\s*$/);
        const fileType = raw.toString('latin1').match(/Content-Type: ([^\r\n]+)/i)?.[1] ?? 'application/octet-stream';
        data = m ? Buffer.from(m[1], 'latin1') : raw; ctype = fileType;
      }
      const key = path.replace('/storage/v1/object/', '');
      objects.set(key, { data, type: ctype });
      return send(res, 200, { Id: crypto.randomUUID(), Key: key });
    }

    // GoTrue --------------------------------------------------------------------------------
    if (path === '/auth/v1/token') {
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const u = byEmail(body.email);
        if (!u || u.password !== body.password || u.banned) return err(res, 400, 'Invalid login credentials', 'invalid_credentials');
        u.last_sign_in_at = new Date().toISOString();
        return send(res, 200, session(u));
      }
      if (grant === 'refresh_token') {
        const r = refreshTokens.get(body.refresh_token);
        if (!r) return err(res, 400, 'Invalid Refresh Token', 'refresh_token_not_found');
        return send(res, 200, session(users.get(r.userId), r.aal));
      }
      return err(res, 400, 'unsupported grant');
    }
    if (path === '/auth/v1/logout') return send(res, 204, '');
    if (path === '/auth/v1/user') {
      const c = claims(req);
      if (!c) return err(res, 401, 'invalid JWT');
      const u = users.get(c.sub);
      if (req.method === 'PUT') {
        const b = JSON.parse((await readBody(req)).toString() || '{}');
        if (b.password) u.password = b.password;
        if (b.data) u.meta = { ...u.meta, ...b.data };
        return send(res, 200, publicUser(u));
      }
      return send(res, 200, publicUser(u));
    }
    if (path === '/auth/v1/factors' && req.method === 'POST') {
      const c = claims(req); if (!c) return err(res, 401, 'invalid JWT');
      const u = users.get(c.sub);
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      const f = { id: crypto.randomUUID(), status: 'unverified', friendly_name: body.friendly_name ?? '', created_at: new Date().toISOString() };
      u.factors.push(f);
      const svg = 'data:image/svg+xml;utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><rect width="180" height="180" fill="#fff"/><text x="90" y="95" text-anchor="middle" font-size="14">QR (test)</text></svg>');
      return send(res, 200, { id: f.id, type: 'totp', friendly_name: f.friendly_name, totp: { qr_code: svg, secret: 'TESTSECRETTESTSECRET', uri: 'otpauth://totp/test' } });
    }
    let m;
    if ((m = path.match(/^\/auth\/v1\/factors\/([^/]+)\/challenge$/))) {
      return send(res, 200, { id: crypto.randomUUID(), type: 'totp', expires_at: now() + 300 });
    }
    if ((m = path.match(/^\/auth\/v1\/factors\/([^/]+)\/verify$/))) {
      const c = claims(req); if (!c) return err(res, 401, 'invalid JWT');
      const u = users.get(c.sub);
      const body = JSON.parse((await readBody(req)).toString() || '{}');
      if (body.code !== TOTP_CODE) return err(res, 422, 'Invalid TOTP code entered', 'mfa_verification_failed');
      const f = u.factors.find((x) => x.id === m[1]);
      if (f) f.status = 'verified';
      return send(res, 200, session(u, 'aal2'));
    }
    if ((m = path.match(/^\/auth\/v1\/factors\/([^/]+)$/)) && req.method === 'DELETE') {
      const c = claims(req); if (!c) return err(res, 401, 'invalid JWT');
      const u = users.get(c.sub);
      u.factors = u.factors.filter((x) => x.id !== m[1]);
      return send(res, 200, { id: m[1] });
    }

    // GoTrue admin (service role only) --------------------------------------------------------
    if (path.startsWith('/auth/v1/admin/')) {
      const c = claims(req);
      if (!c || c.role !== 'service_role') return err(res, 403, 'not admin');
      if (path === '/auth/v1/admin/users' && req.method === 'POST') {
        const b = JSON.parse((await readBody(req)).toString() || '{}');
        if (byEmail(b.email)) return err(res, 422, 'A user with this email address has already been registered', 'email_exists');
        const u = await createUser({ email: b.email, password: b.password, meta: b.user_metadata ?? {} });
        return send(res, 200, publicUser(u));
      }
      if (path === '/auth/v1/admin/users' && req.method === 'GET') {
        return send(res, 200, { users: [...users.values()].map(publicUser), aud: 'authenticated' });
      }
      if ((m = path.match(/^\/auth\/v1\/admin\/users\/([^/]+)$/))) {
        const u = users.get(m[1]);
        if (!u) return err(res, 404, 'User not found', 'user_not_found');
        if (req.method === 'GET') return send(res, 200, publicUser(u));
        if (req.method === 'PUT') {
          const b = JSON.parse((await readBody(req)).toString() || '{}');
          if (b.password) u.password = b.password;
          if (b.user_metadata) u.meta = b.user_metadata;
          if (b.ban_duration) u.banned = b.ban_duration !== 'none';
          return send(res, 200, publicUser(u));
        }
        if (req.method === 'DELETE') {
          try { await pool.query('delete from auth.users where id = $1', [u.id]); } catch (e) { return err(res, 500, `Database error deleting user: ${e.message}`); }
          users.delete(u.id);
          return send(res, 200, {});
        }
      }
      if ((m = path.match(/^\/auth\/v1\/admin\/users\/([^/]+)\/factors$/))) {
        const u = users.get(m[1]);
        return send(res, 200, u.factors.map((f) => ({ id: f.id, friendly_name: f.friendly_name, factor_type: 'totp', status: f.status })));
      }
      if ((m = path.match(/^\/auth\/v1\/admin\/users\/([^/]+)\/factors\/([^/]+)$/)) && req.method === 'DELETE') {
        const u = users.get(m[1]);
        u.factors = u.factors.filter((f) => f.id !== m[2]);
        return send(res, 200, { id: m[2] });
      }
    }

    // test control: POST /__test/users {email,password,meta}
    if (path === '/__test/users' && req.method === 'POST') {
      const b = JSON.parse((await readBody(req)).toString());
      const u = await createUser(b);
      return send(res, 200, { id: u.id });
    }
    if (path === '/__test/health') return send(res, 200, { ok: true });
    return err(res, 404, `no route for ${req.method} ${path}`);
  } catch (e) {
    console.error('[harness]', e);
    return err(res, 500, String(e?.message ?? e));
  }
});

await loadEdge();
server.listen(PORT, '127.0.0.1', () => {
  console.log(`harness listening on ${BASE}`);
  console.log(`ANON_KEY=${ANON_KEY}`);
});
