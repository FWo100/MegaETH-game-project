import { createWalletClient, http, custom, parseAbi, encodeFunctionData, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { getPublicClient, waitForPreconfirmOrDeadline } from './client'
import { DEADLINE_MS_DEFAULT, DEADLINE_MS_MAX, FEE_MULTIPLIER_BPS, CHAIN_ID } from './config'

type Job = () => Promise<void>

class RbfQueue {
  private inFlight = 0
  private maxInFlight = 1
  private q: Job[] = []
  enqueue(j: Job) {
    this.q.push(j)
    this.pump()
  }
  private pump() {
    while (this.inFlight < this.maxInFlight && this.q.length) {
      const job = this.q.shift()!
      this.inFlight++
      job().finally(() => {
        this.inFlight--
        this.pump()
      })
    }
  }
  getInFlight(): number { return this.inFlight }
  getMaxInFlight(): number { return this.maxInFlight }
  getQueueSize(): number { return this.q.length }
}

export const rbfQueue = new RbfQueue()

export async function sendWithRbf(opts: {
  priv: Hex
  to: Hex
  value: bigint
  data?: Hex
  onHash?: (hash: Hex)=>void
  onDone?: (hash: Hex, ms: number)=>void
}) {
  const { priv, to, value, data, onHash, onDone } = opts
  const pc = getPublicClient()
  const account = privateKeyToAccount(priv)
  const wc = createWalletClient({ account, chain: pc.chain!, transport: http((pc.transport as any).url) })

  const pendingNonce = await pc.getTransactionCount({ address: account.address, blockTag: 'pending' })
  let maxFee = (await pc.estimateFeesPerGas()).maxFeePerGas ?? await pc.getGasPrice()
  let maxPrio = (await pc.estimateFeesPerGas()).maxPriorityFeePerGas ?? 1n

  const deadline = Math.min(DEADLINE_MS_MAX, Math.max(DEADLINE_MS_DEFAULT, DEADLINE_MS_DEFAULT))
  const start = performance.now()
  let sentHash: Hex | null = null

  for (;;) {
    try {
      const hash = await wc.sendTransaction({
        to, value, data,
        nonce: pendingNonce,
        maxFeePerGas: maxFee,
        maxPriorityFeePerGas: maxPrio,
        chain: wc.chain
      })
      if (!sentHash) { sentHash = hash; onHash?.(hash) }
    } catch (e) {
      // nonce too low or underpriced -> bump and retry quickly
    }
    const pre = await waitForPreconfirmOrDeadline(sentHash as Hex, deadline)
    if (pre.preconfirmed) {
      onDone?.(sentHash as Hex, pre.ms)
      break
    }
    // bump and try again same nonce
    maxPrio = (maxPrio * 120n) / 100n + 1n
    maxFee = (maxFee * 120n) / 100n + 1n
    if (performance.now() - start > deadline) {
      // Give one last bump try
      continue
    }
  }
}
