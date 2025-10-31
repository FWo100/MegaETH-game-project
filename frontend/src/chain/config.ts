export const CHAIN_ID = Number(import.meta.env.VITE_CHAIN_ID ?? 6342)
export const RPC_URL = String(import.meta.env.VITE_RPC_URL ?? 'https://carrot.megaeth.com/rpc')
export const WS_URL = String(import.meta.env.VITE_WS_URL ?? 'wss://carrot.megaeth.com/ws')
export const EXPLORER_BASE = String(import.meta.env.VITE_EXPLORER_BASE ?? 'https://www.megaexplorer.xyz')
export const FEE_MULTIPLIER_BPS = Number(import.meta.env.VITE_FEE_MULTIPLIER_BPS ?? 10000)

export const GAME_ADDRESS = (import.meta.env.VITE_GAME_ADDRESS || '').trim()
export const SESSION_MANAGER_ADDRESS = (import.meta.env.VITE_SESSION_MANAGER_ADDRESS || '').trim()

export const BATCH_ENABLED = String(import.meta.env.VITE_BATCH_ENABLED ?? 'false').toLowerCase() === 'true'
export const ROUTER_ADDRESS = (import.meta.env.VITE_ROUTER_ADDRESS || '').trim()
export const BATCH_MAX_TIMES = Number(import.meta.env.VITE_BATCH_MAX_TIMES ?? 64)
export const BATCH_RATE_PER_SEC = Number(import.meta.env.VITE_BATCH_RATE_PER_SEC ?? 2)
export const BATCH_WINDOW_MS = Number(import.meta.env.VITE_BATCH_WINDOW_MS ?? 200)

if (!RPC_URL || !WS_URL) {
  throw new Error('RPC/WS URLs must be set via env')
}
