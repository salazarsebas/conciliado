/**
 * Functional tests for src/run/flow.ts
 *
 * The FlowController is a plain TypeScript state machine.
 * These tests inject mock publicClient and walletClient, so no browser is needed.
 */

import { expect, test, describe } from 'bun:test';
import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import { encodeErrorResult, parseAbi } from 'viem';
import { FlowController, makeInitialState } from './flow.js';
import { parseRunCsv } from './csv-parse.js';
import type { RunNetwork } from './networks.js';
import { MAINNET_NETWORK, TESTNET_NETWORK } from './networks.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAYEE1 = '0xFe2b873C97CE177A0AF5e3BEad37EFE336e6a571' as Address;
const PAYEE2 = '0x5eb1f8E7b85938E2eB71a1a0A0c71c9155B79F07' as Address;
const PAYER = '0x429Fd794Ed2166c0F6fFef39fA6A1F580Ba64364' as Address;
const FAKE_TX_HASH = ('0x' + 'ff'.repeat(32)) as Hex;

const SIMPLE_CSV = [
  'invoiceId,payee,amount',
  `INV-001,${PAYEE1},1.0`,
  `INV-002,${PAYEE2},2.0`,
].join('\n');

const CSV_WITH_ERRORS = [
  'invoiceId,payee,amount',
  ',0xBAD,0',   // row 1: bad id, bad addr, zero amount
].join('\n');

// ─── Mock client builders ──────────────────────────────────────────────────────

interface MockClientOpts {
  refUsed?: boolean;
  payeeAllowed?: boolean;
  callReverts?: boolean;
  callRevertData?: Hex;
  gasEstimate?: bigint;
  baseFeePerGas?: bigint;
  sendReturns?: Hex;
  receiptStatus?: 'success' | 'reverted';
  receiptBlock?: bigint;
  codeDeployed?: boolean;
}

function makePublicClient(opts: MockClientOpts = {}): PublicClient {
  const {
    refUsed = false,
    payeeAllowed = true,
    callReverts = false,
    callRevertData,
    gasEstimate = 500_000n,
    baseFeePerGas = 20_000_000_000n,
    receiptStatus = 'success',
    receiptBlock = 100n,
    codeDeployed = true,
  } = opts;

  return {
    getCode: () => Promise.resolve(codeDeployed ? '0x6080' : '0x'),
    readContract: ({ functionName }: { functionName: string }) => {
      if (functionName === 'isInvoiceRefUsed') return Promise.resolve(refUsed);
      if (functionName === 'isPayeeAllowed') return Promise.resolve(payeeAllowed);
      return Promise.resolve(null);
    },
    call: () => {
      if (callReverts) {
        const err = new Error('execution reverted');
        if (callRevertData) (err as unknown as { data: Hex }).data = callRevertData;
        return Promise.reject(err);
      }
      return Promise.resolve({ data: '0x' });
    },
    estimateGas: () => Promise.resolve(gasEstimate),
    getBlock: () => Promise.resolve({ baseFeePerGas }),
    waitForTransactionReceipt: () => Promise.resolve({
      status: receiptStatus,
      blockNumber: receiptBlock,
      transactionHash: FAKE_TX_HASH,
      gasUsed: 100n,
      effectiveGasPrice: 20_000_000_000n,
    }),
    getLogs: () => Promise.resolve([]),
    getTransactionReceipt: () => Promise.resolve(null),
    getBalance: () => Promise.resolve(0n),
    getBlockNumber: () => Promise.resolve(receiptBlock),
    getTransaction: () => Promise.resolve({ from: PAYER }),
  } as unknown as PublicClient;
}

function makeWalletClient(opts: { rejects?: boolean; sendReturns?: Hex } = {}): WalletClient {
  const { rejects = false, sendReturns = FAKE_TX_HASH } = opts;
  return {
    sendTransaction: () => {
      if (rejects) return Promise.reject(new Error('User rejected the request.'));
      return Promise.resolve(sendReturns);
    },
  } as unknown as WalletClient;
}

function makeController(
  network: RunNetwork = MAINNET_NETWORK,
  clientOpts: MockClientOpts = {},
  walletOpts: { rejects?: boolean } = {},
) {
  const states: ReturnType<FlowController['getState']>[] = [];
  const ctrl = new FlowController(network, {
    publicClient: makePublicClient(clientOpts),
    walletClient: makeWalletClient(walletOpts),
    onStateChange: (s) => states.push(s),
  });
  ctrl.setPayer(PAYER);
  return { ctrl, states };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('FlowController: initial state', () => {
  test('starts at idle', () => {
    const state = makeInitialState(MAINNET_NETWORK);
    expect(state.status).toBe('idle');
    expect(state.rows).toHaveLength(0);
  });
});

describe('FlowController: empty file', () => {
  test('empty CSV → parsed with errors, no rows', async () => {
    const { ctrl } = makeController();
    await ctrl.uploadFile('', parseRunCsv);
    const s = ctrl.getState();
    expect(s.status).toBe('parsed');
    expect(s.rows).toHaveLength(0);
  });
});

describe('FlowController: CSV with errors', () => {
  test('errors from parseRunCsv surface in state', async () => {
    const { ctrl } = makeController();
    await ctrl.uploadFile(CSV_WITH_ERRORS, parseRunCsv);
    const s = ctrl.getState();
    expect(s.parseResult?.errors.length).toBeGreaterThan(0);
  });
});

describe('FlowController: unallowed payees', () => {
  test('unallowed payees triggers allow step', async () => {
    const { ctrl } = makeController(MAINNET_NETWORK, { payeeAllowed: false });
    await ctrl.uploadFile(SIMPLE_CSV, parseRunCsv);
    const s = ctrl.getState();
    expect(s.status).toBe('checked');
    expect(s.unallowedPayees.length).toBeGreaterThan(0);
  });
});

describe('FlowController: allow payees', () => {
  test('sendAddPayees transitions to checked after success', async () => {
    let allowCheckCount = 0;
    // First call: not allowed; subsequent: allowed
    const publicClient = {
      ...makePublicClient({ payeeAllowed: false }),
      readContract: ({ functionName }: { functionName: string }) => {
        if (functionName === 'isPayeeAllowed') {
          allowCheckCount++;
          return Promise.resolve(allowCheckCount > 2); // first round false, second true
        }
        return Promise.resolve(false);
      },
    } as unknown as PublicClient;

    const states: ReturnType<FlowController['getState']>[] = [];
    const ctrl = new FlowController(MAINNET_NETWORK, {
      publicClient,
      walletClient: makeWalletClient(),
      onStateChange: (s) => states.push(s),
    });
    ctrl.setPayer(PAYER);
    await ctrl.uploadFile(SIMPLE_CSV, parseRunCsv);
    await ctrl.sendAddPayees();
    const s = ctrl.getState();
    // After re-check with all payees allowed, unallowedPayees should be empty
    expect(s.unallowedPayees).toHaveLength(0);
  });

  test('wallet rejection on addPayees surfaces error', async () => {
    const { ctrl } = makeController(MAINNET_NETWORK, { payeeAllowed: false }, { rejects: true });
    await ctrl.uploadFile(SIMPLE_CSV, parseRunCsv);
    await ctrl.sendAddPayees();
    const s = ctrl.getState();
    expect(s.allowError).toContain('rejected');
  });
});

describe('FlowController: simulation revert', () => {
  test('simulation revert → simFail, Pay disabled', async () => {
    const revertData = encodeErrorResult({
      abi: parseAbi(['error PayeeNotAllowed(address payer, address payee)']),
      errorName: 'PayeeNotAllowed',
      args: [PAYER, PAYEE1],
    });
    const { ctrl } = makeController(MAINNET_NETWORK, { callReverts: true, callRevertData: revertData });
    await ctrl.uploadFile(SIMPLE_CSV, parseRunCsv);
    await ctrl.simulate();
    const s = ctrl.getState();
    expect(s.status).toBe('simFail');
    expect(s.simResult?.ok).toBe(false);
    if (s.simResult && !s.simResult.ok) {
      expect(s.simResult.reason).toContain('allow-list');
    }
  });
});

describe('FlowController: simulation ok → salt gate → pay', () => {
  test('simOk → clearSaltGate → saltGate status', async () => {
    const { ctrl } = makeController();
    await ctrl.uploadFile(SIMPLE_CSV, parseRunCsv);
    await ctrl.simulate();
    ctrl.clearSaltGate();
    expect(ctrl.getState().status).toBe('saltGate');
    expect(ctrl.getState().saltGateCleared).toBe(true);
  });

  test('pay: pending then final', async () => {
    const { ctrl, states } = makeController(MAINNET_NETWORK, { receiptStatus: 'success' });
    await ctrl.uploadFile(SIMPLE_CSV, parseRunCsv);
    await ctrl.simulate();
    ctrl.clearSaltGate();
    await ctrl.sendPay();
    const s = ctrl.getState();
    expect(s.status).toBe('paid');
    expect(s.payTxHash).toBe(FAKE_TX_HASH);
    // paying status must have appeared at some point
    const hadPaying = states.some((st) => st.status === 'paying');
    expect(hadPaying).toBe(true);
  });

  test('pay: reverted receipt', async () => {
    const { ctrl } = makeController(MAINNET_NETWORK, { receiptStatus: 'reverted' });
    await ctrl.uploadFile(SIMPLE_CSV, parseRunCsv);
    await ctrl.simulate();
    ctrl.clearSaltGate();
    await ctrl.sendPay();
    expect(ctrl.getState().status).toBe('reverted');
  });
});

describe('FlowController: wallet rejection on pay', () => {
  test('wallet rejection → rejected status, no tx hash', async () => {
    const { ctrl } = makeController(MAINNET_NETWORK, {}, { rejects: true });
    await ctrl.uploadFile(SIMPLE_CSV, parseRunCsv);
    await ctrl.simulate();
    ctrl.clearSaltGate();
    await ctrl.sendPay();
    const s = ctrl.getState();
    expect(s.status).toBe('rejected');
    expect(s.payError).toContain('rejected');
  });
});

describe('FlowController: wrong chain (contractError)', () => {
  test('contract not deployed → contractError state', async () => {
    const { ctrl } = makeController(MAINNET_NETWORK, { codeDeployed: false });
    await ctrl.uploadFile(SIMPLE_CSV, parseRunCsv);
    const s = ctrl.getState();
    expect(s.status).toBe('contractError');
    expect(s.contractError).toContain('not deployed');
  });
});

describe('FlowController: network switching', () => {
  test('switchNetwork resets to idle', async () => {
    const { ctrl } = makeController();
    await ctrl.uploadFile(SIMPLE_CSV, parseRunCsv);
    ctrl.switchNetwork(TESTNET_NETWORK);
    const s = ctrl.getState();
    expect(s.status).toBe('idle');
    expect(s.rows).toHaveLength(0);
    expect(s.network.key).toBe('testnet');
  });
});

describe('FlowController: testnet happy path', () => {
  test('testnet: sim passes and mainnet badge shows mainnet network', async () => {
    const { ctrl } = makeController(TESTNET_NETWORK);
    await ctrl.uploadFile(SIMPLE_CSV, parseRunCsv);
    await ctrl.simulate();
    const s = ctrl.getState();
    expect(s.network.key).toBe('testnet');
    expect(s.status).toBe('simOk');
  });
});

describe('FlowController: mainnet badge', () => {
  test('mainnet: network.key is mainnet', () => {
    const { ctrl } = makeController(MAINNET_NETWORK);
    expect(ctrl.getState().network.key).toBe('mainnet');
    expect(ctrl.getState().network.name).toBe('Arc mainnet');
  });
});
