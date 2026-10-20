/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 *
 * Chains: Arc mainnet (5042) + Arc testnet (5042002)
 * Connectors: injected only (no WalletConnect project id required)
 */

import { http, createConfig } from 'wagmi'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { arcMainnet } from './landing/chain.js'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcMainnet.id, arcMainnet.rpcUrls.default.http[0])
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig({
  chains: [arcMainnet, arcTestnet],
  connectors: [injected()],
  transports: {
    [arcMainnet.id]: http(arcMainnet.rpcUrls.default.http[0]),
    [arcTestnet.id]: http(arcTestnet.rpcUrls.default.http[0]),
  },
})
