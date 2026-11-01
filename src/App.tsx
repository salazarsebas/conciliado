/**
 * App.tsx: routing by window.location.pathname.
 *
 * "/" → LandingPage (wallet-free)
 * "/run" → RunPage (wallet required, lazy-loaded so the landing
 *           bundle does not pull wagmi/connectkit)
 * "/metrics" → MetricsPage (wallet-free, lazy-loaded, viem only)
 *
 * WagmiProvider and QueryClientProvider wrap only RunPage via RunShell,
 * which is loaded lazily.
 */

import { Suspense, lazy } from 'react';
import { LandingPage } from './landing/LandingPage.js';

// RunShell is lazy so wagmi/connectkit only loads on /run
const RunShell = lazy(() => import('./run/RunShell.js'));
// MetricsPage is lazy so the landing bundle does not carry the log paging and the page
const MetricsPage = lazy(() => import('./metrics/MetricsPage.js'));

const path = window.location.pathname;

export default function App() {
  if (path === '/run' || path === '/run/') {
    return (
      <Suspense fallback={
        <div className="flex-1 bg-paper flex items-center justify-center text-ink-subtle text-sm">
          Loading…
        </div>
      }>
        <RunShell />
      </Suspense>
    );
  }
  if (path === '/metrics' || path === '/metrics/') {
    return (
      <Suspense fallback={
        <div className="min-h-dvh bg-paper flex items-center justify-center text-ink-subtle text-sm">
          Loading…
        </div>
      }>
        <MetricsPage />
      </Suspense>
    );
  }
  return <LandingPage />;
}
