import { useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { match, useRoute, href, type Route } from '@/lib/router';
import { Icon } from '@/ui/Icon';
import { Logo } from '@/ui/Logo';
import { Toasts } from '@/ui/Toast';
import { Empty } from '@/ui/States';
import { AuthGate, useMe, type Me } from './auth';
import { RefsProvider } from './refs';

export interface NavItem { path: string; label: string; icon: string; show?: (me: Me) => boolean; group?: string }
export interface RouteDef { pattern: string; render: (params: Record<string, string>, route: Route) => ComponentChildren; show?: (me: Me) => boolean }

interface Props {
  title: string;
  require: 'staff' | 'admin';
  nav: NavItem[];
  routes: RouteDef[];
  other?: { label: string; url: string; show: (me: Me) => boolean };
}

function Frame({ title, nav, routes, other }: Omit<Props, 'require'>) {
  const me = useMe();
  const route = useRoute();
  const [open, setOpen] = useState(false);
  const items = nav.filter((n) => !n.show || n.show(me));

  let page: ComponentChildren = null;
  for (const r of routes) {
    const m = match(r.pattern, route.path);
    if (m) { page = !r.show || r.show(me) ? r.render(m, route) : <Empty icon="lock" title="You don’t have access to this page" />; break; }
  }
  page ??= <Empty icon="help" title="Page not found" />;

  const groups = [...new Set(items.map((i) => i.group ?? ''))];
  return (
    <div class="console">
      <a class="skip-link" href="#console-main" onClick={(e) => { e.preventDefault(); document.getElementById('console-main')?.focus(); }}>Skip to content</a>
      <header class="console-bar">
        <button class="btn btn-icon btn-ghost bar-burger" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name={open ? 'x' : 'menu'} /></button>
        <a class="bar-brand" href={href('/')}><Logo size={30} /><span><strong>The Falcon Times</strong> <em>{title}</em></span></a>
        <div class="grow" />
        <a class="btn btn-sm btn-ghost hide-sm" href="/" target="_blank" rel="noopener"><Icon name="external" size={14} /> View site</a>
        {other && other.show(me) && <a class="btn btn-sm btn-ghost hide-sm" href={other.url}>{other.label}</a>}
        <div class="who">
          <span class="who-name">{me.profile.display_name || me.profile.email}</span>
          <span class={`badge ${me.isAdmin ? 'badge-gold' : me.isEditor ? 'badge-navy' : ''}`}>{me.isAdmin ? 'Admin' : me.isEditor ? 'Section leader' : 'Writer'}</span>
        </div>
        <button class="btn btn-sm" onClick={me.signOut}><Icon name="logout" size={14} /> <span class="hide-sm">Sign out</span></button>
      </header>
      <div class="console-body">
        <nav class={`side-nav ${open ? 'open' : ''}`} aria-label="Console">
          {groups.map((g) => (
            <div key={g} class="nav-group">
              {g && <div class="nav-group-label">{g}</div>}
              {items.filter((i) => (i.group ?? '') === g).map((i) => {
                const active = i.path === '/' ? route.path === '/' : route.path === i.path || route.path.startsWith(`${i.path}/`);
                return <a key={i.path} href={href(i.path)} class={`side-link ${active ? 'on' : ''}`} onClick={() => setOpen(false)}><Icon name={i.icon} size={17} /> {i.label}</a>;
              })}
            </div>
          ))}
          <div class="nav-group show-sm">
            <a class="side-link" href="/" target="_blank" rel="noopener"><Icon name="external" size={17} /> View site</a>
            {other && other.show(me) && <a class="side-link" href={other.url}><Icon name="layers" size={17} /> {other.label}</a>}
          </div>
        </nav>
        <main id="console-main" tabIndex={-1} class="console-main">{page}</main>
      </div>
      <Toasts />
    </div>
  );
}

export function ConsoleApp(props: Props) {
  return (
    <AuthGate require={props.require} title={props.title}>
      <RefsProvider><Frame {...props} /></RefsProvider>
    </AuthGate>
  );
}
