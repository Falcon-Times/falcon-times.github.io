import { render } from 'preact';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/ui.css';
import '@/styles/site.css';
import { App } from './App';

render(<App />, document.getElementById('app')!);
