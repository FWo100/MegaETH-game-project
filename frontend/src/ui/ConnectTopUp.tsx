import React, { useEffect, useMemo, useState } from 'react'
import { createOrUnlockBurner } from '../chain/session'
import { estimateFlapCostWei, setupAndFund } from '../chain/api'
import { formatEther, parseEther } from 'viem'
import { getPublicClient } from '../chain/client'

import { GAME_ADDRESS, SESSION_MANAGER_ADDRESS, EXPLORER_BASE } from '../chain/config'

export function ConnectTopUp({ onReady, addToast }: { onReady: () => void; addToast: (msg: string) => void }) {
  const [pass, setPass] = useState('')
  const [remember, setRemember] = useState(true)
  const [eth, setEth] = useState('0.05')
  const [flaps, setFlaps] = useState<number>(0)
  const [burnerAddr, setBurnerAddr] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [ownerProvider, setOwnerProvider] = useState<any>(null)
  const [status, setStatus] = useState<string>('')

  useEffect(() => {
    const p = (window as any).ethereum
    if (p) setOwnerProvider(p)
  }, [])

  useEffect(() => {
    (async () => {
      try {
        const depositWei = (()=>{ try { return parseEther(eth as `${string}`)} catch { return 0n } })()
        if (!burnerAddr || depositWei === 0n) { setFlaps(0); return }
        const est = await estimateFlapCostWei(burnerAddr as `0x${string}`)
        const per = est.due
        const reserve = 21000n * (est.price) * 115n / 100n
        const fl = Number((depositWei - reserve) / (per > 0n ? per : 1n))
        setFlaps(fl > 0 ? fl : 0)
      } catch {
        setFlaps(0)
      }
    })()
  }, [eth, burnerAddr])

  return (
    <div className="panel">
      <div className="row">
        <input type="password" placeholder="Passphrase (≥ 6 chars)"
          value={pass} onChange={(e)=>setPass(e.target.value)} />
        <label><input type="checkbox" checked={remember} onChange={(e)=>setRemember(e.target.checked)} /> remember {24}h</label>
        <input type="text" placeholder="Deposit ETH" value={eth} onChange={(e)=>setEth(e.target.value)} />
        <div className="small">≈ flaps: {flaps}</div>
        <button disabled={busy} onClick={async ()=>{
          try {
            console.log('🔗 Connecting wallet and creating burner...')
            if (!ownerProvider) { alert('No wallet provider (EIP-1193)'); return }
            setBusy(true); setStatus('Preparing burner...')
            const { address } = await createOrUnlockBurner(pass, remember)
            console.log('🔑 Burner created/unlocked:', address)
            setBurnerAddr(address)
            if (!SESSION_MANAGER_ADDRESS || !GAME_ADDRESS) { alert('Set VITE_* addresses in frontend/.env'); setBusy(false); return }
            console.log('💰 Sending top-up transaction for', eth, 'ETH to session', address)
            setStatus('Sending top-up... one wallet popup')
            const hash = await setupAndFund(
              ownerProvider,
              address as `0x${string}`,
              parseEther(eth as `${string}`),
              (sentHash) => addToast(`Tx sent: ${sentHash.slice(0, 10)}...`),
              (confirmedHash, ms) => addToast(`Tx confirmed: ${confirmedHash.slice(0, 10)}... in ${ms}ms`)
            )
            setStatus(`Top-up sent: ${hash}`)
            onReady()
          } catch (e:any) {
            console.error('❌ Connect & Top Up error:', e.message || e)
            setStatus(e?.message || 'error')
          } finally {
            setBusy(false)
          }
        }}>Connect & Top Up</button>
      </div>
      <div className="small">{status}</div>
    </div>
  )
}
