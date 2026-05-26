import { render } from 'preact';
import { App } from './app';
import './style.css';

const VALID_THEMES = ['night', 'sunset', 'abyss'];
const saved = localStorage.getItem('vamp-theme');
document.documentElement.setAttribute('data-theme', saved && VALID_THEMES.includes(saved) ? saved : 'night');
document.documentElement.setAttribute('data-edit-mode', 'false');

render(<App />, document.getElementById('app')!);
