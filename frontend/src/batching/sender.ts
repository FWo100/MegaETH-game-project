import { createWalletClient, http, Hex, encodeFunctionData, parseAbi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getPublicClient } from '../chain/client'

type Job = { times: number, startTime: number, resolve: (v:any)=>void, reject: (e:any)=>void };

export interface SenderConfig {
  rpcUrl: string;
  privateKey?: Hex;           // present if signing here
  routerAddress: Hex;
  unitPriceFetcher: () => Promise<bigint>;
  ratePerSecond?: number;        // default 2
}

const abi = parseAbi(["function doThingBatch(uint256 times) payable"]);

export function makeSender(cfg: SenderConfig) {
  const pc = getPublicClient();
  const account = cfg.privateKey ? privateKeyToAccount(cfg.privateKey) : null;
  const wc = account ? createWalletClient({ account, chain: pc.chain!, transport: http((pc.transport as any).url) }) : null;
  if (!account || !wc) throw new Error("No signer available");

  // Always use fallback gas limits for batch transactions due to complex interaction with router contract
  // Gas estimation often fails due to precise value matching requirements in ClickBatchRouter.doThingBatch
  async function calculateBatchGasLimit(times: number): Promise<bigint> {
    // Use conservative fallback calculation for all batch transactions
    // 40k covers intrinsic + data + router overhead with buffer
    // 120k per flap covers function call + event + mapping operations + safety buffer
    console.log('Using conservative fallback gas calculation for batch transaction');
    return 40000n + BigInt(times) * 120000n;
  }

  const Q: Job[] = [];
  const interval = Math.max(1, Math.floor(1000 / (cfg.ratePerSecond ?? 2)));
  let coolingOffUntil = 0;
  let nextNonce: number | null = null;
  let backoffMs = 0;

  async function getNonce() {
    if (nextNonce === null) nextNonce = await pc.getTransactionCount({ address: account!.address, blockTag: 'pending' });
    return nextNonce++;
  }

  async function drain() {
    if (Date.now() < coolingOffUntil) return;
    if (Q.length === 0) return;
    const job = Q.shift()!;

    try {
      const price = await cfg.unitPriceFetcher();
      const data = encodeFunctionData({ abi, functionName: 'doThingBatch', args: [BigInt(job.times)] }) as Hex;

      const nonce = await getNonce();
      const fees = await pc.estimateFeesPerGas();
      const gas = await calculateBatchGasLimit(job.times);
      const txRequest = {
        to: cfg.routerAddress,
        data,
        value: price * BigInt(job.times),
        nonce,
        gas,
        maxFeePerGas: fees.maxFeePerGas ?? fees.gasPrice ?? 1n,
        maxPriorityFeePerGas: fees.maxPriorityFeePerGas ?? 1n,
        chain: wc!.chain,
        account: account!
      } as const;

      const signed = await wc!.signTransaction(txRequest);
      const hash = await pc.sendRawTransaction({ serializedTransaction: signed });

      // Simple receipt polling
      let receipt = null;
      for (let attempts = 0; attempts < 60 && !receipt; attempts++) {
        await new Promise(r => setTimeout(r, 500));
        receipt = await pc.getTransactionReceipt({ hash });
      }
      if (!receipt) {
        // Timeout occurred - resolve anyway with a synthetic receipt indicating timeout
        const syntheticReceipt = {
          transactionHash: hash,
          blockNumber: null,
          status: 'timeout' as const,
          confirmations: 0,
          timeout: true
        };
        console.warn('Transaction confirmation timeout:', hash);
        job.resolve(syntheticReceipt);
        return;
      }
      job.resolve(receipt);
      backoffMs = 0;
    } catch (e: any) {
      const msg = String(e?.message || e).toLowerCase();
      if (msg.includes("429") || msg.includes("too many") || msg.includes("rate")) {
        backoffMs = backoffMs ? Math.min(backoffMs * 2, 10_000) : 1000;
        coolingOffUntil = Date.now() + backoffMs;
        Q.unshift(job);
      } else if (msg.includes("nonce too low") || msg.includes("replacement") || msg.includes("underpriced")) {
        nextNonce = null; // resync and retry
        Q.unshift(job);
      } else {
        job.reject(e);
      }
    }
  }

  setInterval(drain, interval);

  return {
    enqueue(times: number) {
      return new Promise((resolve, reject) => Q.push({ times, startTime: Date.now(), resolve, reject }));
    },
    queueSize() { return Q.length; }
  };
}
