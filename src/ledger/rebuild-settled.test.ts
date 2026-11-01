import { expect, test } from 'bun:test';
import { rebuildLedgerSettled } from './rebuild-settled.js';
import type { LedgerClient, RebuildArgs } from './rebuild.js';

const TX = `0x${'ab'.repeat(32)}` as const;
const ADDR = `0x${'11'.repeat(20)}` as const;

function args(getTransactionReceipt: () => Promise<never>): RebuildArgs {
  return {
    client: { getTransactionReceipt } as unknown as LedgerClient,
    contract: ADDR,
    payer: ADDR,
    target: { txHash: TX },
    invoiceList: [],
  };
}

test('retries a pending receipt up to the attempt limit, then stays pending', async () => {
  let calls = 0;
  const result = await rebuildLedgerSettled(
    args(() => {
      calls++;
      return Promise.reject(new Error('TransactionReceiptNotFoundError'));
    }),
    { attempts: 3, delayMs: 0 },
  );
  expect(calls).toBe(3);
  expect(result.status).toBe('pending');
});

test('a retry reaches the node that has the receipt', async () => {
  let calls = 0;
  const run = rebuildLedgerSettled(
    args(() => {
      calls++;
      return Promise.reject(new Error(calls === 1 ? 'TransactionReceiptNotFoundError' : 'second node answered'));
    }),
    { attempts: 3, delayMs: 0 },
  );
  const error = await run.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(Error);
  expect((error as Error).message).toBe('second node answered');
  expect(calls).toBe(2);
});

test('rotates to a fallback client when the first keeps answering pending', async () => {
  const used: string[] = [];
  const client = (name: string) =>
    ({
      getTransactionReceipt: () => {
        used.push(name);
        return Promise.reject(new Error(name === 'stuck' ? 'TransactionReceiptNotFoundError' : 'reached fallback'));
      },
    }) as unknown as LedgerClient;

  const result = await rebuildLedgerSettled(
    { ...args(() => Promise.reject(new Error('unused'))), client: client('stuck') },
    { attempts: 2, delayMs: 0, fallbackClients: [client('healthy')] },
  );

  expect(used).toEqual(['stuck', 'healthy']);
  expect(result.status).toBe('pending');
});
