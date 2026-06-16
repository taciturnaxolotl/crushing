import './styles.css';
import { renderConnect } from './connect';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

renderConnect();
