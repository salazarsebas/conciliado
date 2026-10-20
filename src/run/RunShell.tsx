/**
 * RunShell: wraps RunPage with wagmi + QueryClient providers.
 * Lazy-loaded so the landing bundle stays wallet-free.
 */

import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConnectKitProvider } from 'connectkit';
import { Toaster } from 'sonner';
import { config } from '../config.js';
import { RunPage } from './RunPage.js';

const queryClient = new QueryClient();

export default function RunShell() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ConnectKitProvider>
          <RunPage />
          <Toaster position="top-center" richColors />
        </ConnectKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
