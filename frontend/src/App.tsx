import React, { useEffect, useMemo, useState } from 'react'
import { ConnectTopUp } from './ui/ConnectTopUp'
import { Controls } from './ui/Controls'
import { getPublicClient, getWsStatus } from './chain/client'
import { getBurner, loadEncryptedKey } from './chain/session'
import { formatEther } from 'viem'
import { CHAIN_ID, EXPLORER_BASE } from './chain/config'

interface Toast {
  id: string
  msg: string
  timestamp: number
}

export default function App() {
  const [burnerAddr, setBurnerAddr] = useState<string>('')
  const [burnerBalance, setBurnerBalance] = useState<bigint>(0n)
  const [lastTx, setLastTx] = useState<string>('')
  const [latencyMs, setLatencyMs] = useState<number>(0)
  const [wsOk, setWsOk] = useState<boolean>(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  const pc = useMemo(() => getPublicClient(), [])

  const addToast = (msg: string) => {
    const toastId = `${Date.now()}-${Math.random()}`
    const newToast: Toast = { id: toastId, msg, timestamp: Date.now() }
    setToasts(prev => [...prev, newToast])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toastId))
    }, 2000)
  }

  useEffect(() => {
    let t: any
    const tick = async () => {
      try {
        const key = await loadEncryptedKey()
        if (key?.address) setBurnerAddr(key.address)
        if (key?.address) {
          const bal = await pc.getBalance({ address: key.address as `0x${string}` })
          setBurnerBalance(bal)
        }
      } catch {}
      t = setTimeout(tick, 2000)
    }
    tick()
    return () => clearTimeout(t)
  }, [pc])

  useEffect(() => {
    const unsub = getWsStatus((ok) => setWsOk(ok))
    return () => { unsub?.() }
  }, [])

  return (
    <div className="container">
      <h1>Fluffle Tx Tester (MegaETH)</h1>
      <div className="status">
        <div>Chain ID: {CHAIN_ID}</div>
        <div>WS: {wsOk ? 'connected' : 'offline'}</div>
        <div>Burner: {burnerAddr || '—'}</div>
        <div>Balance: {burnerAddr ? `${formatEther(burnerBalance)} ETH` : '—'}</div>
        <div>Last Tx: {lastTx ? <a href={`${EXPLORER_BASE}/tx/${lastTx}`} target="_blank" rel="noreferrer">{lastTx}</a> : '—'}</div>
        <div>Latency: {latencyMs ? `${latencyMs} ms` : '—'}</div>
      </div>
      <ConnectTopUp onReady={() => {}} addToast={addToast} />
      <Controls setLastTx={setLastTx} setLatencyMs={setLatencyMs} addToast={addToast} />
      <div id="toasts">
        {toasts.slice().reverse().map(toast => (
          <div key={toast.id} className="toast">{toast.msg}</div>
        ))}
      </div>
    </div>
  )
}
