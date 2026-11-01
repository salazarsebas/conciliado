/*
 *  ███████╗████████╗██╗   ██╗██████╗ ██╗ ██████╗
 *  ██╔════╝╚══██╔══╝██║   ██║██╔══██╗██║██╔═══██╗
 *  ███████╗   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ╚════██║   ██║   ██║   ██║██║  ██║██║██║   ██║
 *  ███████║   ██║   ╚██████╔╝██████╔╝██║╚██████╔╝
 *  ╚══════╝   ╚═╝    ╚═════╝ ╚═════╝ ╚═╝ ╚═════╝
 *
 *  Built with Arc Studio
 *  https://studio.arc.io
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import App from './App'
import './index.css'
import { shouldLoadStudioInstrumentation } from './studio-preview.js'

// Studio logo SVG
const StudioLogo = () => (
  <svg width="14" height="16" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 21.5001C0.167192 16.2366 1.02308 11.3243 2.45378 7.50459C4.26573 2.66517 6.88869 0 9.83904 0C12.7894 0 15.412 2.66517 17.2243 7.50459C18.1669 10.0216 18.8605 13.0121 19.2713 16.2655C19.3081 16.556 19.3393 16.8513 19.3714 17.146C19.3819 17.1642 19.3881 17.1811 19.386 17.1949C19.386 17.1949 19.6275 18.7674 19.6788 21.5001H19.6515C19.2934 21.1937 15.0694 17.7329 8.06739 18.735C8.17304 17.4996 8.31833 16.2974 8.50603 15.1452C8.51562 15.0863 8.52671 15.0294 8.53649 14.9709C11.2828 14.8846 13.6866 15.2171 15.5299 15.6529C15.5231 15.6073 15.5173 15.5603 15.5103 15.5149C15.1314 13.0547 14.5724 10.8024 13.8517 8.87761C12.6732 5.73037 11.1354 3.77496 9.83904 3.77496C8.54269 3.77496 7.00493 5.73037 5.82649 8.87761C5.54123 9.63889 5.28154 10.4508 5.04866 11.3071C4.72126 12.507 4.44621 13.7934 4.22654 15.1451C3.90141 17.1412 3.69827 19.2821 3.62345 21.5001H0Z" fill="currentColor"/>
  </svg>
)

// Studio watermark. Below 640 px it sits in the page footer so it never covers
// content on a phone; from 640 px up it floats bottom-right. Colors come from the
// design tokens, so it follows light and dark.
const StudioWatermark = () => (
  <footer className="flex justify-center px-4 pb-6 pt-2 sm:block sm:p-0">
    <a
      href="https://studio.arc.io/"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 min-h-touch px-4 rounded-full border border-line-strong bg-accent-wash text-accent text-sm font-semibold no-underline shadow-raised hover:text-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:fixed sm:bottom-4 sm:right-4 sm:z-[9999] sm:max-w-[calc(100vw-2rem)]"
    >
      <StudioLogo />
      Built with Arc Studio
    </a>
  </footer>
)

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
      <StudioWatermark />
      <Toaster position="top-center" richColors />
    </StrictMode>,
  )
}

// Load Studio instrumentation modules only when:
//   (a) the build permits it (DEV mode or VITE_ARC_STUDIO_PREVIEW flag), AND
//   (b) the page is running inside a parent frame.
// Vite replaces the condition at build time and dead-code-eliminates the
// dynamic import() branches (and the chunks they would pull in) from a
// production build where neither flag is set.
async function boot() {
  const buildAllows = (import.meta.env.DEV || import.meta.env.VITE_ARC_STUDIO_PREVIEW === 'true')
  if (shouldLoadStudioInstrumentation({ buildAllows, inFrame: window.parent !== window })) {
    try {
      const [tracing] = await Promise.all([
        import('./tracing.js'),
        import('./console-capture.js'),
      ])
      // Register chain RPC URLs so trace events show correct chain names.
      // Imported here (not in config.ts) so tracing never enters the production bundle.
      const { arcMainnet } = await import('./landing/chain.js')
      const { arcTestnet } = await import('viem/chains')
      tracing.registerChain(arcMainnet.id, arcMainnet.rpcUrls.default.http[0])
      tracing.registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])
    } catch {
      // Instrumentation failure must never prevent the app from rendering
    }
  }
  renderApp()
}

void boot()
