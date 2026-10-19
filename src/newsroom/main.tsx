import { render } from 'preact';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/ui.css';
import '@/styles/console.css';
import { ConsoleApp, type NavItem, type RouteDef } from '@/console/App';
import { ArticleEditor } from '@/console/pages/ArticleEditor';
import { Articles } from '@/console/pages/Articles';
import { Profile, Security } from '@/console/pages/Account';
import { Notices, Polls, Quotes, Scoreboard } from '@/console/pages/Content';
import { Dashboard } from '@/console/pages/Dashboard';
import { Tips } from '@/console/pages/Tips';

const nav: NavItem[] = [
  { path: '/', label: 'Dashboard', icon: 'home' },
  { path: '/articles', label: 'Stories', icon: 'file' },
  { path: '/tips', label: 'Tip line', icon: 'megaphone', show: (me) => me.isEditor, group: 'Section leaders' },
  { path: '/scoreboard', label: 'Scoreboard', icon: 'trophy', show: (me) => me.isEditor, group: 'Section leaders' },
  { path: '/polls', label: 'Polls', icon: 'chart', show: (me) => me.isEditor, group: 'Section leaders' },
  { path: '/notices', label: 'Announcement bar', icon: 'bell', show: (me) => me.isEditor, group: 'Section leaders' },
  { path: '/quotes', label: 'Daily Spark quotes', icon: 'sparkles', show: (me) => me.isEditor, group: 'Section leaders' },
  { path: '/profile', label: 'My profile', icon: 'user', group: 'Account' },
  { path: '/security', label: 'Account security', icon: 'shield', group: 'Account' },
];

const editorsOnly = (me: { isEditor: boolean }) => me.isEditor;
const routes: RouteDef[] = [
  { pattern: '/', render: () => <Dashboard /> },
  { pattern: '/articles', render: () => <Articles /> },
  { pattern: '/articles/new', render: () => <ArticleEditor id={null} /> },
  { pattern: '/articles/:id', render: (p) => <ArticleEditor key={p.id} id={p.id} /> },
  { pattern: '/tips', render: () => <Tips />, show: editorsOnly },
  { pattern: '/scoreboard', render: () => <Scoreboard />, show: editorsOnly },
  { pattern: '/polls', render: () => <Polls />, show: editorsOnly },
  { pattern: '/notices', render: () => <Notices />, show: editorsOnly },
  { pattern: '/quotes', render: () => <Quotes />, show: editorsOnly },
  { pattern: '/profile', render: () => <Profile /> },
  { pattern: '/security', render: () => <Security /> },
];

render(
  <ConsoleApp title="Newsroom" require="staff" nav={nav} routes={routes}
    other={{ label: 'Admin panel', url: '/admin/', show: (me) => me.isAdmin }} />,
  document.getElementById('app')!,
);
