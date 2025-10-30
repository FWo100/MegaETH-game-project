import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts'
import { REMEMBER_HOURS } from './config'

const DB_NAME = 'fluffle-db'
const STORE = 'keys'
const KEY_ID = 'burner-1'

type EncRecord = {
  address: `0x${string}`,
  salt: string,
  iv: string,
  data: string,
  ts: number
}

let decryptedCache: { priv: string, address: `0x${string}`, until: number } | null = null

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function idbGet(key: string): Promise<any> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const store = tx.objectStore(STORE)
    const r = store.get(key)
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}
async function idbSet(key: string, val: any): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const r = store.put(val, key)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
}

async function deriveKey(passphrase: string, salt: Uint8Array) {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(passphrase), {name:'PBKDF2'}, false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 120_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
  return key
}

export async function createOrUnlockBurner(passphrase: string, remember: boolean) {
  if (passphrase.length < 6) throw new Error('Passphrase must be at least 6 characters')
  // If exists, decrypt
  const existing: EncRecord | undefined = await idbGet(KEY_ID)
  if (existing) {
    const priv = await decryptPriv(passphrase, existing)
    if (remember) decryptedCache = { priv, address: existing.address, until: Date.now() + REMEMBER_HOURS*3600_000 }
    return { priv, address: existing.address }
  }
  // Create new
  const priv = generatePrivateKey()
  const acct = privateKeyToAccount(priv)
  const rec = await encryptPriv(passphrase, priv, acct.address)
  await idbSet(KEY_ID, rec)
  if (remember) decryptedCache = { priv, address: acct.address, until: Date.now() + REMEMBER_HOURS*3600_000 }
  return { priv, address: acct.address }
}

export async function loadEncryptedKey() {
  const existing: EncRecord | undefined = await idbGet(KEY_ID)
  if (!existing) return null
  if (decryptedCache && decryptedCache.until > Date.now()) {
    return { priv: decryptedCache.priv, address: decryptedCache.address }
  }
  return { address: existing.address }
}

async function encryptPriv(passphrase: string, hexPriv: string, address: `0x${string}`): Promise<EncRecord> {
  const enc = new TextEncoder()
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(passphrase, salt)
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(hexPriv))
  return {
    address,
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    data: btoa(String.fromCharCode(...new Uint8Array(data))),
    ts: Date.now()
  }
}

async function decryptPriv(passphrase: string, rec: EncRecord): Promise<string> {
  const dec = new TextDecoder()
  const salt = Uint8Array.from(atob(rec.salt), c=>c.charCodeAt(0))
  const iv = Uint8Array.from(atob(rec.iv), c=>c.charCodeAt(0))
  const data = Uint8Array.from(atob(rec.data), c=>c.charCodeAt(0))
  const key = await deriveKey(passphrase, salt)
  const plain = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, data)
  return dec.decode(plain)
}

export function forgetDecrypted() {
  decryptedCache = null
}

export async function getBurner(passphrase?: string) {
  if (decryptedCache && decryptedCache.until > Date.now()) return decryptedCache
  if (!passphrase) throw new Error('Passphrase required')
  const existing: EncRecord | undefined = await idbGet(KEY_ID)
  if (!existing) throw new Error('No burner yet')
  const priv = await decryptPriv(passphrase, existing)
  decryptedCache = { priv, address: existing.address, until: Date.now() + 5*60_000 } // short cache if manual unlock
  return decryptedCache
}
