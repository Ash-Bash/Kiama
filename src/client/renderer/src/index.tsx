import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { getPortalContainer } from './utils/portalRoot';

// Ensure portal containers exist before React mounts to avoid portal
// mount/unmount races that can cause DOM "removeChild" errors.
if (typeof document !== 'undefined') {
	['kiama-context-menu-root', 'kiama-popover-root', 'kiama-profile-popover-root'].forEach(id => {
		try {
			getPortalContainer(id);
		} catch (e) {
			// ignore — defensive in case document not ready
		}
	});
}

// Bootstrap the React renderer inside the Electron preload root element.
const mountApp = () => {
	try {
		const rootEl = document.getElementById('root');
		if (!rootEl) return;
		const root = ReactDOM.createRoot(rootEl);
		root.render(<App />);
	} catch (e) {
		// Defensive: log and swallow — ErrorBoundary will surface render errors.
		// Some environments may have competing bundles; delaying/mounting once
		// avoids an immediate removeChild race on startup.
		// eslint-disable-next-line no-console
		console.warn('[Kiama] Failed to mount root immediately', e);
		setTimeout(() => {
			try {
				const rootEl = document.getElementById('root');
				if (!rootEl) return;
				const root = ReactDOM.createRoot(rootEl);
				root.render(<App />);
			} catch (err) {
				// final fallback
				// eslint-disable-next-line no-console
				console.error('[Kiama] Mount failed', err);
			}
		}, 100);
	}
};

if (typeof document !== 'undefined') {
	if (document.readyState === 'complete' || document.readyState === 'interactive') {
		// Mount on next tick to reduce initial render races
		setTimeout(mountApp, 0);
	} else {
		window.addEventListener('DOMContentLoaded', () => setTimeout(mountApp, 0));
	}
} else {
	// Server-side or unknown env — attempt mount anyway
	setTimeout(mountApp, 0);
}