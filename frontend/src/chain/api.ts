import { getPublicClient } from './client'
import { createWalletClient, encodeFunctionData, http, custom, parseAbi, formatEther } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { FEE_MULTIPLIER_BPS, GAME_ADDRESS, SESSION_MANAGER_ADDRESS, EXPLORER_BASE, BATCH_ENABLED, ROUTER_ADDRESS, RPC_URL, BATCH_RATE_PER_SEC } from './config'
import { sendWithRbf } from './rbf'
import { makeSender } from '../batching/sender'

const batchSenders = new Map<string, ReturnType<typeof makeSender>>();

function getBatchSender(priv: `0x${string}`, session: `0x${string}`) {
  const existing = batchSenders.get(session);
  if (existing) return existing;
  const pc = getPublicClient();
  const sender = makeSender({
    rpcUrl: RPC_URL,
    privateKey: priv,
    routerAddress: ROUTER_ADDRESS as `0x${string}`,
    unitPriceFetcher: async () => {
      try {
        // Call the game contract's unitPrice() function directly
        // This is what the router uses, so we must match it exactly
        const price = await pc.readContract({
          address: GAME_ADDRESS as `0x${string}`,
          abi: gameAbi,
          functionName: 'unitPrice'
        }) as bigint;
        return price;
      } catch (e) {
        console.warn('Unit price fetch failed, using fallback calculation', e);
        // Fallback: calculate unitPrice the same way the contract does
        // unitPrice = 21000 * basefee * (10000 + feeMultiplierBps) / 10000
        const basefee = (await pc.getBlock()).baseFeePerGas ?? 10000000000n;
        const multiplier = BigInt(FEE_MULTIPLIER_BPS);
        return (21000n * basefee * (10000n + multiplier)) / 10000n;
      }
    },
    ratePerSecond: BATCH_RATE_PER_SEC
  });
  batchSenders.set(session, sender);
  return sender;
}

const gameAbi = parseAbi([
  'function flap(uint256 reportedGasWei) payable',
  'function feeMultiplierBps() view returns (uint16)',
  'function feeToleranceBps() view returns (uint16)',
  'function unitPrice() view returns (uint256)'
])
const mgrAbi = parseAbi([
  'function setupAndFund(address sessionEOA) payable'
])

export async function estimateFlapCostWei(from: `0x${string}`, reportedGasWeiGuess?: bigint) {
  const pc = getPublicClient()
  const fees = await pc.estimateFeesPerGas()
  const p = (fees.maxFeePerGas ?? await pc.getGasPrice())
  const reported = (reportedGasWeiGuess && reportedGasWeiGuess > 0n) ? reportedGasWeiGuess : 21000n * p
  // approximate due: reported * (1 + feeMultiplier)
  const due = reported * BigInt(10000 + FEE_MULTIPLIER_BPS) / 10000n
  // try to refine gas estimate with this value
  const gas = await pc.estimateGas({
    to: GAME_ADDRESS as `0x${string}`,
    account: from,
    value: due,
    data: encodeFunctionData({ abi: gameAbi, functionName: 'flap', args: [reported] })
  }).catch(()=>21000n)
  const reported2 = gas * p
  const due2 = reported2 * BigInt(10000 + FEE_MULTIPLIER_BPS) / 10000n
  return { gas, price: p, reported: reported2, due: due2 }
}

export async function setupAndFund(ownerProvider: any, session: `0x${string}`, depositWei: bigint, onSent?: (hash: string) => void, onConfirmed?: (hash: string, ms: number) => void) {
  if (!SESSION_MANAGER_ADDRESS) throw new Error('Set VITE_SESSION_MANAGER_ADDRESS')
  console.log('🔄 Preparing setup and fund transaction for session', session, 'with deposit', formatEther(depositWei) + ' ETH')
  const pc = getPublicClient()
  const ownerClient = createWalletClient({ chain: pc.chain!, transport: http((pc.transport as any).url) }).extend(() => ({ transport: ownerProvider } as any))
  // Using viem custom transport for EIP-1193:
  const wc = createWalletClient({ chain: pc.chain!, transport: custom(ownerProvider) })
  const [ownerAddr] = await (ownerProvider.request({ method: 'eth_requestAccounts' }) as Promise<string[]>)
  console.log('📤 Sending setup and fund transaction from', ownerAddr)
  const hash = await wc.sendTransaction({
    to: SESSION_MANAGER_ADDRESS as `0x${string}`,
    value: depositWei,
    data: encodeFunctionData({ abi: mgrAbi, functionName: 'setupAndFund', args: [session] }),
    account: ownerAddr as `0x${string}`
  })
  console.log('✅ Setup and fund transaction sent with hash:', hash)
  onSent?.(hash)
  console.log('⏳ Waiting for confirmation...')
  const start = performance.now()
  const { preconfirmed } = await pc.waitForTransactionReceipt({ hash, confirmations: 1 }).then(() => ({ preconfirmed: true })).catch(() => ({ preconfirmed: false }))
  const ms = preconfirmed ? Math.round(performance.now() - start) : 0
  console.log(preconfirmed ? `🎉 Setup and fund confirmed in ${ms} ms` : '❌ Setup and fund confirmation failed')
  if (preconfirmed) {
    onConfirmed?.(hash, ms)
  }
  return hash
}

export async function flap(priv: `0x${string}`, session: `0x${string}`, onHash: (h:string)=>void, onDone: (h:string,ms:number)=>void) {
  if (!GAME_ADDRESS) throw new Error('Set VITE_GAME_ADDRESS')
  console.log('🕊️ Preparing flap transaction from session', session)
  const pc = getPublicClient()
  const fees = await pc.estimateFeesPerGas()
  const p = (fees.maxFeePerGas ?? await pc.getGasPrice())
  const gas = await pc.estimateGas({
    to: GAME_ADDRESS as `0x${string}`,
    account: session,
    value: 0n,
    data: encodeFunctionData({ abi: gameAbi, functionName: 'flap', args: [21000n * p] })
  }).catch(()=>21000n)
  const reported = gas * p
  const value = reported * BigInt(10000 + 10000) / 10000n // include 1.00x multiplier
  const data = encodeFunctionData({ abi: gameAbi, functionName: 'flap', args: [reported] })
  console.log('💸 Flap cost:', formatEther(value) + ' ETH', 'reported gas:', reported.toString())
  await sendWithRbf({ priv, to: GAME_ADDRESS as `0x${string}`, value, data, onHash: (h)=> {
    console.log('📤 Flap transaction sent with hash:', h)
    onHash(h)
  }, onDone: (h,ms)=>{
    console.log(`🎉 Flap confirmed in ${ms} ms`)
    onDone(h,ms)
  } })
}

export async function sweep(priv: `0x${string}`, from: `0x${string}`, to: `0x${string}`, onHash?: (h: string) => void, onDone?: (h: string, ms: number) => void) {
  console.log('🧹 Preparing sweep transaction from', from, 'to', to)
  const pc = getPublicClient()
  const balance = await pc.getBalance({ address: from })
  const fees = await pc.estimateFeesPerGas()
  const maxFee = fees.maxFeePerGas ?? await pc.getGasPrice()
  const reserve = (21000n * maxFee * 115n) / 100n
  if (balance <= reserve + 10n) {
    console.log('💰 Balance too low to sweep:', formatEther(balance) + ' ETH, reserve:', formatEther(reserve) + ' ETH')
    throw new Error('Balance too low to sweep; retry later')
  }
  const value = balance - reserve
  console.log('💸 Sweep amount:', formatEther(value) + ' ETH')
  await sendWithRbf({ priv, to, value, onHash: (h) => {
    console.log('📤 Sweep transaction sent with hash:', h)
    onHash?.(h)
  }, onDone: (h, ms) => {
    console.log(`🎉 Sweep confirmed in ${ms} ms`)
    onDone?.(h, ms)
  } })
}

export async function batchFlap(priv: `0x${string}`, session: `0x${string}`, times: number, onHash?: (h:string)=>void, onDone?: (h:string,ms:number)=>void) {
  if (!BATCH_ENABLED || !ROUTER_ADDRESS) {
    // fallback to single flap
    const safeOnHash = onHash || (() => {});
    const safeOnDone = onDone || (() => {});
    for (let i = 0; i < times; i++) {
      await flap(priv, session, safeOnHash, safeOnDone);
    }
    return;
  }
  console.log('🏆 Batch flap', times, 'from session', session)
  const sender = getBatchSender(priv, session);
  const receipt = await sender.enqueue(times) as any; // viem TransactionReceipt
  onHash?.(receipt.transactionHash);

  let confirmMs = -1;
  if (receipt.timeout) {
    // Transaction timed out - use a timeout indicator instead of -1
    confirmMs = -2; // Special value indicating timeout
    console.warn('Batch flap transaction timed out:', receipt.transactionHash);
  } else {
    // Calculate confirmation time if we can get block time difference
    const pc = getPublicClient();
    try {
      const tx = await pc.getTransaction({ hash: receipt.transactionHash });
      if (tx && tx.blockNumber && receipt.blockNumber) {
        const txBlock = await pc.getBlock({ blockNumber: tx.blockNumber });
        const receiptBlock = await pc.getBlock({ blockNumber: receipt.blockNumber });
        if (txBlock.timestamp && receiptBlock.timestamp) {
          confirmMs = Number((receiptBlock.timestamp - txBlock.timestamp) * 1000n);
        }
      }
    } catch (e) {
      console.warn('Could not calculate confirmation time', e);
    }
  }
  onDone?.(receipt.transactionHash, confirmMs);
}
