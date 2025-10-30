/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_CHAIN_ID: string
  readonly VITE_RPC_URL: string
  readonly VITE_WS_URL: string
  readonly VITE_EXPLORER_BASE: string
  readonly VITE_FEE_MULTIPLIER_BPS: string
  readonly VITE_FEE_TOLERANCE_BPS: string
  readonly VITE_DEADLINE_MS_DEFAULT: string
  readonly VITE_DEADLINE_MS_MAX: string
  readonly VITE_REMEMBER_HOURS: string
  readonly VITE_GAME_ADDRESS: string
  readonly VITE_SESSION_MANAGER_ADDRESS: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
