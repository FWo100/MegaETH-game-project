import React, { useEffect, useState, useRef } from 'react'
import { flap, sweep, estimateFlapCostWei, batchFlap } from '../chain/api'
import { getBurner } from '../chain/session'
import { getPublicClient } from '../chain/client'
import { formatEther } from 'viem'
import { rbfQueue } from '../chain/rbf'
import { makeCoalescer } from '../batching/coalescer'
import { BATCH_ENABLED, BATCH_WINDOW_MS, BATCH_MAX_TIMES } from '../chain/config'

export function Controls({ setLastTx, setLatencyMs, addToast }:{ setLastTx: (h:string)=>void, setLatencyMs: (n:number)=>void, addToast: (msg: string) => void }) {
  const [pass, setPass] = useState('')
  const [, setForceUpdate] = useState(0)
  const [busySweep, setBusySweep] = useState(false)
  const [status, setStatus] = useState('')
  const [balance, setBalance] = useState<string>('—')
  const [estimatedFlaps, setEstimatedFlaps] = useState<number>(0)
  const [pendingFlaps, setPendingFlaps] = useState<number>(0)
  const currentBurner = useRef<{priv: `0x${string}`, address: `0x${string}`} | null>(null)
  const coalesceRef = useRef<ReturnType<typeof makeCoalescer> | null>(null)

  // Setup coalescer when burner changes
  useEffect(() => {
    if (!pass) return // Wait for passphrase
    const setup = async () => {
      try {
        const b = await getBurner(pass)
        if (!b) return
        if (JSON.stringify(b) !== JSON.stringify(currentBurner.current)) {
          currentBurner.current = { priv: b.priv as `0x${string}`, address: b.address as `0x${string}` }
          if (BATCH_ENABLED) {
            coalesceRef.current = makeCoalescer({
              windowMs: BATCH_WINDOW_MS,
              maxTimes: BATCH_MAX_TIMES,
              submitBatch: async (times: number) => {
                if (!currentBurner.current) return
                try {
                  setPendingFlaps(p => p + times)
                  console.log('🏆 Submitting batch flap', times)
                  await batchFlap(currentBurner.current.priv, currentBurner.current.address, times,
                    (h) => {
                      console.log('📤 Batch flap transaction sent, hash:', h)
                      setLastTx(h)
                      addToast(`Batch tx sent: ${h.slice(0, 10)}...`)
                    },
                    (h, ms) => {
                      if (ms === -2) {
                        // Timeout case
                        console.warn('Batch flap transaction timed out:', h)
                        setStatus('Batch tx sent (confirmation timeout)')
                        addToast(`Batch tx sent (timeout): ${h.slice(0, 10)}...`)
                      } else {
                        console.log(`🎉 Batch flap confirmed in ${ms} ms`)
                        setLatencyMs(ms)
                        setStatus(`Batch flapped in ~${ms} ms`)
                        addToast(`Batch tx confirmed: ${h.slice(0, 10)}... in ${ms}ms`)
                      }
                      setPendingFlaps(p => Math.max(0, p - times))
                    }
                  )
                } catch (e: any) {
                  console.error('❌ Batch flap error:', e.message || e)
                  setStatus(e?.message || 'batch error')
                  setPendingFlaps(p => Math.max(0, p - times))
                }
              }
            })
          } else {
            coalesceRef.current = null
          }
        }
      } catch (e: any) {
        console.error('Coalescer setup failed:', e)
      }
    }
    setup()
  }, [pass]) // when pass changes, burner might change

  // Balance and estimate polling
  useEffect(() => {
    const t = setInterval(async () => {
      try {
        const b = await getBurner()
        if (!b) return
        const pc = getPublicClient()
        const bal = await pc.getBalance({ address: b.address as `0x${string}` })
        setBalance(`${formatEther(bal)} ETH`)
        // Update estimate every 5 seconds (interval 200ms, 5s = 25 cycles, but can optimize)
        const currentTime = Date.now()
        if (currentTime % 5000 < 200) {  // approximate every 5 seconds
          const est = await estimateFlapCostWei(b.address)
          const flaps = Number(bal / est.due)
          setEstimatedFlaps(Math.floor(Math.max(0, flaps)))
        }
        const coalescerPending = coalesceRef.current?.getPending() || 0
        setPendingFlaps(coalescerPending + (rbfQueue.getInFlight() + (rbfQueue.getQueueSize() * 1e6))) // heuristic, since batch queue size not accessible
        setForceUpdate(Date.now()) // force button re-render to check queue status
      } catch {}
    }, 200)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="panel">
      <div className="row">
        <input type="password" placeholder="Passphrase to unlock burner" value={pass} onChange={(e)=>setPass(e.target.value)} />
        <button disabled={pendingFlaps >= 4 || rbfQueue.getInFlight() >= rbfQueue.getMaxInFlight()} onClick={async ()=>{
          console.log('🙋 User initiated flap')
          if (coalesceRef.current) {
            coalesceRef.current.recordClick()
            setStatus('Queued...')
          } else {
            if (pendingFlaps >= 4) return
            setPendingFlaps(p => p + 1)
            try {
              setStatus('Flapping...')
              const b = await getBurner(pass)
              console.log('🐔 Flapping from address:', b.address)
              await flap(b.priv as `0x${string}`, b.address as `0x${string}`,
                (h) => {
                  console.log('📤 Flap transaction sent, hash:', h)
                  setPendingFlaps(p => Math.max(0, p - 1))
                  setLastTx(h)
                  addToast(`Tx sent: ${h.slice(0, 10)}...`)
                },
                (h, ms) => {
                  console.log(`🎉 Flap transaction confirmed in ${ms} ms`)
                  setLatencyMs(ms)
                  setStatus(`Flapped in ~${ms} ms`)
                  addToast(`Tx confirmed: ${h.slice(0, 10)}... in ${ms}ms`)
                }
              )
            } catch (e:any) {
              setPendingFlaps(p => Math.max(0, p - 1))
              console.error('❌ Flap error:', e.message || e)
              setStatus(e?.message || 'error')
            }
          }
        }}>Flap</button>
        <button disabled={busySweep} onClick={async ()=>{
          try {
            console.log('💸 User initiated withdraw (sweep) transaction')
            setBusySweep(true); setStatus('Sweeping...')
            const b = await getBurner(pass)
            const pc = getPublicClient()
            const [owner] = await (window as any).ethereum.request({ method:'eth_requestAccounts' }) as string[]
            console.log('🏦 Sweeping leftovers from', b.address, 'to', owner)
            await sweep(b.priv as `0x${string}`, b.address as `0x${string}`, owner as `0x${string}`,
              (h) => {
                console.log('📤 Sweep transaction sent, hash:', h)
                setLastTx(h)
                addToast(`Tx sent: ${h.slice(0, 10)}...`)
              },
              (h, ms) => {
                console.log(`🎉 Sweep transaction confirmed in ${ms} ms`)
                setStatus(`Sweep confirmed in ~${ms} ms`)
                addToast(`Tx confirmed: ${h.slice(0, 10)}... in ${ms}ms`)
              }
            )
            setStatus('Sweep sent')
          } catch (e:any) {
            console.error('❌ Sweep error:', e.message || e)
            setStatus(e?.message || 'error')
          } finally {
            setBusySweep(false)
          }
        }}>Withdraw Leftovers</button>
        <div className="small">
          Burner balance: {balance}<br/>
          ≈ flaps: {estimatedFlaps}
        </div>
      </div>
      <div className="small">{status}</div>
    </div>
  )
}
