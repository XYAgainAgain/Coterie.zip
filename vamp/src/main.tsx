import { render } from 'preact';
import { App } from './app';
import './style.css';

document.documentElement.setAttribute('data-theme', 'night');
document.documentElement.setAttribute('data-edit-mode', 'false');

render(<App />, document.getElementById('app')!);
