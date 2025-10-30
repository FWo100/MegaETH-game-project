import { createPublicClient, createWalletClient, http, webSocket, custom, parseAbi, fallback, Hex } from 'viem'
import { mainnet } from 'viem/chains'
import { CHAIN_ID, RPC_URL, WS_URL } from './config'

let wsConnected = false
let wsUnsub: (()=>void) | null = null

export function getPublicClient() {
  return createPublicClient({
    chain: { ...mainnet, id: CHAIN_ID, name: 'megaeth-testnet', nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } },
    transport: http(RPC_URL)
  })
}

export function getWsClient() {
  try {
    const client = createPublicClient({
      chain: { ...mainnet, id: CHAIN_ID },
      transport: webSocket(WS_URL, { reconnect: true })
    })
    return client
  } catch {
    return null as any
  }
}

export function getWsStatus(cb: (ok:boolean)=>void) {
  const ws = getWsClient()
  if (!ws) { cb(false); return null }
  wsConnected = true
  cb(true)
  const unwatch = ws.watchBlocks({
    onBlock: () => { if (!wsConnected) { wsConnected = true; cb(true) } },
    onError: () => { wsConnected = false; cb(false) },
    pollingInterval: 5_000
  })
  wsUnsub = () => { unwatch() }
  return () => { try { wsUnsub?.(); } catch {} }
}

export async function waitForPreconfirmOrDeadline(hash: Hex, deadlineMs: number) {
  const pc = getPublicClient()
  const start = performance.now()
  // try quick poll for receipt for mini-block like latency
  while (performance.now() - start < deadlineMs) {
    const r = await pc.getTransactionReceipt({ hash }).catch(()=>null)
    if (r) return { preconfirmed: true, ms: Math.round(performance.now() - start) }
    await new Promise(r => setTimeout(r, 80))
  }
  return { preconfirmed: false, ms: Math.round(performance.now() - start) }
}
