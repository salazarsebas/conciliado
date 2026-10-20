/**
 * RunPage: the /run batch payment flow.
 *
 * Routing is handled by App.tsx via window.location.pathname.
 * Wagmi providers wrap this component; the landing is wallet-free.
 *
 * Steps:
 *   1. Network selector
 *   2. CSV upload + offline validation
 *   3. Connect wallet (required for on-chain checks)
 *   4. On-chain checks (refs used, payees allowed)
 *   5. Allow payees (if needed)
 *   6. Simulate
 *   7. Salt gate (download files or tick checkbox)
 *   8. Pay
 *   9. Final / rebuild
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAccount, usePublicClient, useWalletClient, useSwitchChain } from 'wagmi';
import { ConnectKitButton } from 'connectkit';
import { defineChain } from 'viem';
import logoMark from '../../docs/brand/logo-mark.svg';
import logoMarkInverse from '../../docs/brand/logo-mark-inverse.svg';
import { NETWORKS, type NetworkKey, type RunNetwork } from './networks.js';
import { parseRunCsv } from './csv-parse.js';
import { buildPayerCsv, buildSaltFile } from './csv-parse.js';
import { FlowController, makeInitialState, type FlowState } from './flow.js';
import { LedgerTable } from '../landing/components/LedgerTable.js';
import { TieOutBar } from '../landing/components/TieOutBar.js';
import { StatusPill } from '../landing/components/StatusPill.js';
import { formatDuration, truncateHash } from '../landing/format.js';

// ─── Viem chain definitions matching the run networks ────────────────────────

function makeViemChain(net: RunNetwork) {
  return defineChain({
    id: net.chainId,
    name: net.name,
    nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [net.rpcUrl] } },
    blockExplorers: { default: { name: 'Arc Explorer', url: net.explorerBase } },
  });
}

// ─── Network badge ────────────────────────────────────────────────────────────

function NetworkBadge({ network }: { network: RunNetwork }) {
  if (network.key === 'mainnet') {
    return (
      <span className="inline-flex w-fit items-center rounded-full px-3 py-0.5 text-xs font-medium bg-mainnet text-mainnet-ink whitespace-nowrap">
        Arc mainnet
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit items-center rounded-full px-3 py-0.5 text-xs font-medium bg-pending-wash text-pending whitespace-nowrap">
      Arc testnet (test funds)
    </span>
  );
}

// ─── Network selector ─────────────────────────────────────────────────────────

function NetworkSelector({
  selected,
  onChange,
}: {
  selected: NetworkKey;
  onChange: (k: NetworkKey) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">Select network</legend>
      <div className="flex gap-2" role="radiogroup" aria-label="Network">
        {(['mainnet', 'testnet'] as NetworkKey[]).map((key) => {
          const net = NETWORKS[key];
          const checked = selected === key;
          return (
            <label
              key={key}
              className={[
                'flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer min-h-touch select-none transition-colors duration-fast',
                'focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus',
                checked
                  ? 'border-accent bg-accent/10'
                  : 'border-line bg-surface hover:bg-sunken',
              ].join(' ')}
            >
              <input
                type="radio"
                name="network"
                value={key}
                checked={checked}
                onChange={() => onChange(key)}
                className="sr-only"
              />
              <NetworkBadge network={net} />
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

// ─── CSV upload panel ─────────────────────────────────────────────────────────

function CsvUpload({ onFile }: { onFile: (text: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === 'string') onFile(text);
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-uploaded
    e.target.value = '';
  }

  return (
    <div>
      <label
        htmlFor="csv-upload"
        className="block text-sm font-medium text-ink mb-1"
      >
        Invoice CSV
      </label>
      <input
        id="csv-upload"
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={handleChange}
        className="block w-full text-sm text-ink file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-accent file:text-accent-ink hover:file:bg-accent-hover cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        aria-label="Upload invoice CSV"
      />
      <p className="mt-1 text-xs text-ink-subtle">
        Columns: invoiceId, payee, amount (decimal USDC), costCenter (optional)
      </p>
    </div>
  );
}

// ─── Review table ─────────────────────────────────────────────────────────────

function ReviewTable({ state }: { state: FlowState }) {
  const { rows, refs, unallowedPayees, usedRefs } = state;
  if (rows.length === 0) return null;
  const unallowedSet = new Set(unallowedPayees.map((a) => a.toLowerCase()));
  const usedRefSet = new Set((usedRefs ?? []).map((r) => r.toLowerCase()));
  const total = rows.reduce((s, r) => s + r.amountMicro, 0n);
  const totalDisplay = (Number(total) / 1e6).toFixed(6);

  return (
    <div>
      {/* Privacy notice — always visible on the review screen */}
      <div className="mb-4 p-3 rounded-md bg-pending-wash border border-pending/30 text-xs text-pending">
        Payee addresses, amounts, and timing are public on Arc. Only a salted reference is written
        for each invoice; invoice IDs and cost centers stay in this browser.
      </div>

      <div className="overflow-x-auto rounded-md border border-line bg-surface shadow-raised">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-sunken text-ink-muted">
              <th scope="col" className="px-3 py-2 text-left font-medium">#</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Invoice ID</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Payee</th>
              <th scope="col" className="px-3 py-2 text-right font-medium tabular">Amount (USDC)</th>
              <th scope="col" className="px-3 py-2 text-right font-medium tabular">Raw units</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Invoice ref</th>
              <th scope="col" className="px-3 py-2 text-left font-medium">Allow-list</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const ref = refs?.[i];
              const isUnallowed = unallowedSet.has(row.payee.toLowerCase());
              const isUsedRef = ref && usedRefSet.has(ref.toLowerCase());
              return (
                <tr key={row.rowNum} className="border-t border-line hover:bg-sunken/50 transition-colors">
                  <td className="px-3 py-2 tabular text-ink-muted">{row.rowNum}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink">{row.invoiceId}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink">{row.payee.slice(0, 6)}&hellip;{row.payee.slice(-4)}</td>
                  <td className="px-3 py-2 text-right tabular">{row.amountDisplay}</td>
                  <td className="px-3 py-2 text-right tabular font-mono text-xs text-ink-subtle">{row.amountMicro.toString()}</td>
                  <td className="px-3 py-2 font-mono text-xs text-ink-subtle">
                    {ref ? <span title={ref}>{truncateHash(ref)}</span> : <span className="text-ink-subtle italic">pending</span>}
                  </td>
                  <td className="px-3 py-2">
                    {isUsedRef ? (
                      <span className="text-xs text-danger">Already paid</span>
                    ) : isUnallowed ? (
                      <span className="text-xs text-pending">Not allowed</span>
                    ) : (
                      <span className="text-xs text-final">Allowed</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line-strong font-semibold">
              <td className="px-3 py-2" />
              <td className="px-3 py-2" colSpan={2}>
                {rows.length} line{rows.length !== 1 ? 's' : ''}
              </td>
              <td className="px-3 py-2 text-right tabular">{totalDisplay} USDC</td>
              <td className="px-3 py-2 text-right tabular font-mono text-xs">{total.toString()}</td>
              <td className="px-3 py-2" colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Salt gate panel ──────────────────────────────────────────────────────────

function SaltGatePanel({
  state,
  onDownloadPayerCsv,
  onDownloadSaltFile,
  onGateCleared,
  gateCleared,
}: {
  state: FlowState;
  onDownloadPayerCsv: () => void;
  onDownloadSaltFile: () => void;
  onGateCleared: () => void;
  gateCleared: boolean;
}) {
  return (
    <div className="p-4 rounded-lg border border-line bg-surface shadow-raised">
      <h3 className="text-base font-semibold text-ink mb-2">Save your files before paying</h3>
      <div className="bg-pending-wash border border-pending/30 rounded-md p-3 mb-4 text-xs text-pending">
        Keep this file. The salt is the only way to reproduce the invoice references from your
        invoice IDs. Anyone who has it can test guessed invoice IDs against the references on chain.
        Conciliado does not store it.
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        <button
          type="button"
          onClick={onDownloadPayerCsv}
          className="min-h-touch px-4 rounded-md text-sm font-semibold bg-surface border border-line-strong hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast"
        >
          Download payer CSV
        </button>
        <button
          type="button"
          onClick={onDownloadSaltFile}
          className="min-h-touch px-4 rounded-md text-sm font-semibold bg-surface border border-line-strong hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast"
        >
          Download salt file
        </button>
      </div>
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={gateCleared}
          onChange={(e) => { if (e.target.checked) onGateCleared(); }}
          className="mt-0.5 h-4 w-4 rounded border-line text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          aria-label="I saved the salt and the payer CSV"
        />
        <span className="text-sm text-ink">I saved the salt and the payer CSV</span>
      </label>
      {state.feeEstimate && (
        <p className="mt-3 text-xs text-ink-subtle">
          Estimated network fee: {state.feeEstimate}
        </p>
      )}
    </div>
  );
}

// ─── Main RunPage component ───────────────────────────────────────────────────

export function RunPage() {
  const [networkKey, setNetworkKey] = useState<NetworkKey>('mainnet');
  const network = NETWORKS[networkKey];

  const { address, chainId, isConnected } = useAccount();
  const publicClientRaw = usePublicClient({ chainId: network.chainId });
  const { data: walletClientRaw } = useWalletClient({ chainId: network.chainId });
  const { switchChain } = useSwitchChain();

  const [flowState, setFlowState] = useState<FlowState>(() => makeInitialState(network));
  const [saltGateCleared, setSaltGateCleared] = useState(false);

  // Controller ref — stable across renders
  const controllerRef = useRef<FlowController | null>(null);

  // Rebuild controller when network or clients change
  useEffect(() => {
    if (!publicClientRaw) return;
    const ctrl = new FlowController(network, {
      publicClient: publicClientRaw,
      walletClient: walletClientRaw ?? null,
      onStateChange: setFlowState,
    });
    controllerRef.current = ctrl;
    setFlowState(makeInitialState(network));
    setSaltGateCleared(false);
  }, [network, publicClientRaw, walletClientRaw]);

  // Update payer in controller when wallet connects/disconnects
  useEffect(() => {
    controllerRef.current?.setPayer(address ?? null);
  }, [address]);

  const handleNetworkChange = useCallback((key: NetworkKey) => {
    setNetworkKey(key);
    setSaltGateCleared(false);
  }, []);

  const handleFile = useCallback((text: string) => {
    void controllerRef.current?.uploadFile(text, parseRunCsv);
    setSaltGateCleared(false);
  }, []);

  const handleAllowPayees = useCallback(() => {
    void controllerRef.current?.sendAddPayees();
  }, []);

  const handleSimulate = useCallback(() => {
    void controllerRef.current?.simulate();
  }, []);

  const handleSaltGateCleared = useCallback(() => {
    setSaltGateCleared(true);
    controllerRef.current?.clearSaltGate();
  }, []);

  const handleDownloadPayerCsv = useCallback(() => {
    const { rows, refs } = flowState;
    if (!rows.length || !refs) return;
    const content = buildPayerCsv(rows, refs);
    downloadBlob(content, 'payer-batch.csv', 'text/csv');
  }, [flowState]);

  const handleDownloadSaltFile = useCallback(() => {
    const { salt, network: net } = flowState;
    if (!salt) return;
    const content = buildSaltFile(salt, net.payoutBatch, net.chainId);
    downloadBlob(content, 'batch-salt.txt', 'text/plain');
  }, [flowState]);

  const handlePay = useCallback(() => {
    void controllerRef.current?.sendPay();
  }, []);

  // Wrong chain check
  const isWrongChain = isConnected && chainId !== undefined && chainId !== network.chainId;

  const handleSwitchChain = useCallback(() => {
    switchChain({ chainId: network.chainId, addEthereumChainParameter: makeViemChain(network) as never });
  }, [switchChain, network]);

  // Derive Pay button enabled state
  const canPay = useMemo(() => {
    const { status } = flowState;
    return (
      isConnected &&
      !isWrongChain &&
      (status === 'saltGate') &&
      saltGateCleared &&
      flowState.simResult?.ok === true
    );
  }, [flowState, isConnected, isWrongChain, saltGateCleared]);

  return (
    <div className="min-h-dvh bg-paper text-ink font-sans">
      {/* Header */}
      <header className="border-b border-line bg-surface">
        <div className="max-w-content mx-auto px-4 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <picture className="shrink-0">
              <source srcSet={logoMarkInverse} media="(prefers-color-scheme: dark)" />
              <img src={logoMark} alt="" aria-hidden="true" width={28} height={28} />
            </picture>
            <span className="text-xl font-semibold tracking-tight text-ink">Conciliado</span>
          </div>
          <NetworkBadge network={network} />
          <a
            href="/"
            className="text-sm text-accent hover:text-accent-hover underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded whitespace-nowrap"
          >
            Back to ledger
          </a>
        </div>
      </header>

      <main className="max-w-content mx-auto px-4 lg:px-8 py-8 pb-16">
        <h1 className="text-2xl md:text-3xl font-bold text-ink tracking-tight mb-2">Run a batch</h1>
        <p className="text-sm text-ink-muted mb-8 max-w-reading">
          Upload an invoice CSV, review the lines, and pay in one transaction. The ledger is rebuilt from the chain immediately after.
        </p>

        {/* Step 1: Network selector */}
        <section className="mb-8">
          <h2 className="text-base font-semibold text-ink mb-3">1. Network</h2>
          <NetworkSelector selected={networkKey} onChange={handleNetworkChange} />
        </section>

        {/* Step 2: CSV upload */}
        <section className="mb-8">
          <h2 className="text-base font-semibold text-ink mb-3">2. Upload CSV</h2>
          <CsvUpload onFile={handleFile} />
        </section>

        {/* Parse errors */}
        {(flowState.status === 'parsed' || flowState.status === 'checking' || flowState.status === 'checked') &&
          flowState.parseResult &&
          flowState.parseResult.errors.length > 0 && (
          <div className="mb-6 p-4 rounded-md bg-danger-wash border border-danger/30">
            <p className="text-sm font-semibold text-danger mb-2">
              {flowState.parseResult.tooManyRows
                ? 'File rejected: too many rows'
                : `${flowState.parseResult.errors.length} validation error${flowState.parseResult.errors.length !== 1 ? 's' : ''}`}
            </p>
            <ul className="space-y-1">
              {flowState.parseResult.errors.map((e, i) => (
                <li key={i} className="text-xs text-danger">{e.reason}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Contract error */}
        {flowState.status === 'contractError' && flowState.contractError && (
          <div className="mb-6 p-4 rounded-md bg-danger-wash border border-danger/30">
            <p className="text-sm font-semibold text-danger mb-1">Contract not available</p>
            <p className="text-xs text-danger">{flowState.contractError}</p>
          </div>
        )}

        {/* Step 3: Wallet */}
        <section className="mb-8">
          <h2 className="text-base font-semibold text-ink mb-3">3. Connect wallet</h2>
          <div className="flex flex-wrap items-center gap-3">
            <ConnectKitButton />
            {isConnected && address && (
              <span className="font-mono text-xs text-ink-subtle">{truncateHash(address)}</span>
            )}
          </div>
          {isWrongChain && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="text-sm text-pending">
                Wallet is on a different chain. Switch to {network.name}.
              </p>
              <button
                type="button"
                onClick={handleSwitchChain}
                className="min-h-touch px-4 rounded-md text-sm font-semibold bg-pending-wash text-pending border border-pending/30 hover:bg-pending/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast"
              >
                Switch to {network.name}
              </button>
            </div>
          )}
        </section>

        {/* Review table (shown once parsed) */}
        {flowState.rows.length > 0 && flowState.parseResult && flowState.parseResult.errors.length === 0 && (
          <section className="mb-8">
            <h2 className="text-base font-semibold text-ink mb-3">Review</h2>
            <ReviewTable state={flowState} />
          </section>
        )}

        {/* Step 4: Allow payees */}
        {(flowState.status === 'checked' || flowState.status === 'allowPending' || flowState.status === 'allowFinal') &&
          flowState.unallowedPayees.length > 0 && (
          <section className="mb-8">
            <h2 className="text-base font-semibold text-ink mb-3">4. Allow payees</h2>
            <div className="p-4 rounded-lg border border-line bg-surface shadow-raised">
              <p className="text-sm text-ink mb-3">
                {flowState.unallowedPayees.length} payee{flowState.unallowedPayees.length !== 1 ? 's' : ''} need to be added to your allow-list:
              </p>
              <ul className="mb-4 space-y-1">
                {flowState.unallowedPayees.map((p) => (
                  <li key={p} className="font-mono text-xs text-ink">{p}</li>
                ))}
              </ul>
              {flowState.allowError && (
                <p className="text-sm text-danger mb-3">{flowState.allowError}</p>
              )}
              {flowState.allowTxHash && flowState.status === 'allowPending' && (
                <p className="text-xs text-ink-subtle mb-2">
                  Pending:{' '}
                  <a href={flowState.allowTxUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                    className="font-mono text-accent underline">{truncateHash(flowState.allowTxHash)}</a>
                </p>
              )}
              <button
                type="button"
                onClick={handleAllowPayees}
                disabled={flowState.status === 'allowPending' || isWrongChain}
                className="min-h-touch px-5 rounded-md text-base font-semibold bg-accent text-accent-ink hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast disabled:bg-sunken disabled:text-ink-subtle"
              >
                {flowState.status === 'allowPending' ? 'Sending...' : 'Add payees to allow-list'}
              </button>
            </div>
          </section>
        )}

        {/* Step 5: Simulate */}
        {(flowState.status === 'checked' || flowState.status === 'simulating' || flowState.status === 'simOk' || flowState.status === 'simFail' || flowState.status === 'saltGate') &&
          flowState.unallowedPayees.length === 0 && isConnected && !isWrongChain && (
          <section className="mb-8">
            <h2 className="text-base font-semibold text-ink mb-3">5. Simulate</h2>
            <div className="p-4 rounded-lg border border-line bg-surface shadow-raised">
              {flowState.status === 'simulating' && (
                <p className="text-sm text-ink-subtle">Simulating batch...</p>
              )}
              {flowState.simResult?.ok && (
                <div className="flex items-center gap-2 text-sm text-final mb-2">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                  Simulation passed
                  {flowState.feeEstimate && (
                    <span className="text-xs text-ink-subtle ml-1">
                      (estimated fee: {flowState.feeEstimate})
                    </span>
                  )}
                </div>
              )}
              {flowState.simResult && !flowState.simResult.ok && (
                <div className="p-3 rounded-md bg-danger-wash border border-danger/30 mb-3">
                  <p className="text-sm text-danger">{flowState.simResult.reason}</p>
                </div>
              )}
              <button
                type="button"
                onClick={handleSimulate}
                disabled={flowState.status === 'simulating'}
                className="min-h-touch px-4 rounded-md text-sm font-semibold bg-surface border border-line-strong hover:bg-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast disabled:text-ink-subtle"
              >
                {flowState.status === 'simulating' ? 'Simulating...' : 'Run simulation'}
              </button>
            </div>
          </section>
        )}

        {/* Step 6: Salt gate */}
        {(flowState.simResult?.ok || flowState.status === 'saltGate') && (
          <section className="mb-8">
            <h2 className="text-base font-semibold text-ink mb-3">6. Save files</h2>
            <SaltGatePanel
              state={flowState}
              onDownloadPayerCsv={handleDownloadPayerCsv}
              onDownloadSaltFile={handleDownloadSaltFile}
              onGateCleared={handleSaltGateCleared}
              gateCleared={saltGateCleared}
            />
          </section>
        )}

        {/* Step 7: Pay */}
        {flowState.status !== 'idle' && flowState.rows.length > 0 && isConnected && (
          <section className="mb-8">
            <h2 className="text-base font-semibold text-ink mb-3">7. Pay</h2>
            <div className="p-4 rounded-lg border border-line bg-surface shadow-raised">
              {/* Status while paying */}
              {flowState.status === 'paying' && (
                <div role="status" aria-live="polite" className="mb-3">
                  <p className="text-sm text-ink-subtle">
                    Pending{flowState.payElapsedMs > 0 ? ` (${formatDuration(flowState.payElapsedMs)})` : ''}
                    {flowState.payTxHash && (
                      <>
                        {' '}&mdash;{' '}
                        <a href={flowState.payTxUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                          className="font-mono text-xs text-accent underline">{truncateHash(flowState.payTxHash)}</a>
                      </>
                    )}
                  </p>
                </div>
              )}

              {/* Final success */}
              {flowState.status === 'paid' && flowState.payTxHash && (
                <div role="status" aria-live="polite" className="mb-4">
                  <div className="flex flex-wrap items-center gap-2 mb-2">
                    <StatusPill status="final" />
                    {flowState.payDurationMs !== null && (
                      <span className="text-xs text-ink-subtle">
                        in {formatDuration(flowState.payDurationMs)}
                      </span>
                    )}
                    {flowState.payBlockNumber && (
                      <span className="text-xs text-ink-subtle">Block {flowState.payBlockNumber}</span>
                    )}
                  </div>
                  <a
                    href={flowState.payTxUrl ?? '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-xs text-accent hover:text-accent-hover underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
                  >
                    {truncateHash(flowState.payTxHash)}
                  </a>
                  {flowState.payTxHash && (
                    <p className="mt-2 text-xs text-ink-subtle">
                      <a
                        href={`/?tx=${flowState.payTxHash}&network=${networkKey}`}
                        className="text-accent hover:text-accent-hover underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus rounded"
                      >
                        Rebuild this batch from the chain
                      </a>
                    </p>
                  )}
                </div>
              )}

              {/* Reverted */}
              {flowState.status === 'reverted' && (
                <div role="status" aria-live="assertive" className="mb-4 p-3 rounded-md bg-danger-wash border border-danger/30">
                  <p className="text-sm text-danger font-medium">
                    The transaction reverted. The batch was not paid; only the network fee was spent.
                  </p>
                  {flowState.payTxHash && (
                    <a href={flowState.payTxUrl ?? '#'} target="_blank" rel="noopener noreferrer"
                      className="font-mono text-xs text-accent underline mt-1 block">{truncateHash(flowState.payTxHash)}</a>
                  )}
                </div>
              )}

              {/* Rejected */}
              {flowState.status === 'rejected' && (
                <div role="status" aria-live="assertive" className="mb-4 p-3 rounded-md bg-danger-wash border border-danger/30">
                  <p className="text-sm text-danger">You rejected the transaction. No USDC moved.</p>
                </div>
              )}

              {/* Pay button */}
              {flowState.status !== 'paid' && flowState.status !== 'reverted' && flowState.status !== 'rejected' && (
                <button
                  type="button"
                  onClick={handlePay}
                  disabled={!canPay || flowState.status === 'paying'}
                  className="min-h-touch px-6 rounded-md text-base font-semibold bg-accent text-accent-ink hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus transition-colors duration-fast disabled:bg-sunken disabled:text-ink-subtle"
                >
                  {flowState.status === 'paying' ? 'Paying...' : 'Pay batch'}
                </button>
              )}
            </div>
          </section>
        )}

        {/* Post-pay rebuild summary */}
        {flowState.status === 'paid' && flowState.rebuildVm && (
          <section className="mb-8">
            <h2 className="text-base font-semibold text-ink mb-3">Ledger</h2>
            <div className="mb-4">
              <span className="font-medium text-ink">{flowState.rebuildVm.matchSummary}</span>
            </div>
            <div className="mb-6">
              <LedgerTable vm={flowState.rebuildVm} />
            </div>
            {flowState.rebuildVm.tieOut && (
              <div className="mb-4">
                <TieOutBar tieOut={flowState.rebuildVm.tieOut} />
              </div>
            )}
          </section>
        )}

        {/* Live region for screen reader */}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {flowState.status === 'paid' && flowState.rebuildVm
            ? `Batch paid. ${flowState.rebuildVm.matchSummary}. ${flowState.rebuildVm.tieOut?.resultWord ?? ''}`
            : flowState.status === 'reverted'
            ? 'Transaction reverted. Batch was not paid.'
            : flowState.status === 'rejected'
            ? 'Transaction rejected. No USDC moved.'
            : ''}
        </div>
      </main>
    </div>
  );
}

// ─── Download helper ──────────────────────────────────────────────────────────

function downloadBlob(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
