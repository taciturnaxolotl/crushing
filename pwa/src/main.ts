import './styles.css';
import { renderConnect } from './connect';

// Load Lucide icons
const script = document.createElement('script');
script.src = 'https://cdn.jsdelivr.net/npm/lucide@0.468.0/dist/umd/lucide.min.js';
script.onload = () => { (window as any).lucide?.createIcons(); };
document.head.appendChild(script);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

renderConnect();
