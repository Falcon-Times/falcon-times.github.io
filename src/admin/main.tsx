import { render } from 'preact';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/ui.css';
import '@/styles/console.css';
import { ConsoleApp, type NavItem, type RouteDef } from '@/console/App';
import { Security } from '@/console/pages/Account';
import { Activity } from '@/console/pages/Activity';
import { ArticleEditor } from '@/console/pages/ArticleEditor';
import { Articles } from '@/console/pages/Articles';
import { Notices, Polls, Quotes, Scoreboard, Sections, StaffRoster } from '@/console/pages/Content';
import { Dashboard } from '@/console/pages/Dashboard';
import { People } from '@/console/pages/People';
import { Settings } from '@/console/pages/Settings';
import { Tips } from '@/console/pages/Tips';

const nav: NavItem[] = [
  { path: '/', label: 'Overview', icon: 'home' },
  { path: '/people', label: 'People & access', icon: 'key', group: 'Administration' },
  { path: '/settings', label: 'Site settings', icon: 'settings', group: 'Administration' },
  { path: '/activity', label: 'Activity log', icon: 'history', group: 'Administration' },
  { path: '/articles', label: 'All stories', icon: 'file', group: 'Content' },
  { path: '/tips', label: 'Tip line', icon: 'megaphone', group: 'Content' },
  { path: '/sections', label: 'Sections & menu', icon: 'layers', group: 'Content' },
  { path: '/staff', label: 'Staff roster', icon: 'users', group: 'Content' },
  { path: '/scoreboard', label: 'Scoreboard', icon: 'trophy', group: 'Content' },
  { path: '/polls', label: 'Polls', icon: 'chart', group: 'Content' },
  { path: '/notices', label: 'Announcement bar', icon: 'bell', group: 'Content' },
  { path: '/quotes', label: 'Daily Spark quotes', icon: 'sparkles', group: 'Content' },
  { path: '/security', label: 'Account security', icon: 'shield', group: 'Account' },
];

const routes: RouteDef[] = [
  { pattern: '/', render: () => <Dashboard admin /> },
  { pattern: '/people', render: () => <People /> },
  { pattern: '/settings', render: () => <Settings /> },
  { pattern: '/activity', render: () => <Activity /> },
  { pattern: '/articles', render: () => <Articles /> },
  { pattern: '/articles/new', render: () => <ArticleEditor id={null} /> },
  { pattern: '/articles/:id', render: (p) => <ArticleEditor key={p.id} id={p.id} /> },
  { pattern: '/tips', render: () => <Tips /> },
  { pattern: '/sections', render: () => <Sections /> },
  { pattern: '/staff', render: () => <StaffRoster /> },
  { pattern: '/scoreboard', render: () => <Scoreboard /> },
  { pattern: '/polls', render: () => <Polls /> },
  { pattern: '/notices', render: () => <Notices /> },
  { pattern: '/quotes', render: () => <Quotes /> },
  { pattern: '/security', render: () => <Security /> },
];

render(
  <ConsoleApp title="Admin" require="admin" nav={nav} routes={routes}
    other={{ label: 'Newsroom', url: '/newsroom/', show: () => true }} />,
  document.getElementById('app')!,
);
