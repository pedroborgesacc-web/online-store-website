import type { AppData } from '../types';

/* Cópias de segurança opcionalmente cifradas com palavra-passe (AES-GCM + PBKDF2). */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function key(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export interface BackupFile {
  app: 'florin';
  format: 1;
  encrypted: boolean;
  createdAt: string;
  data?: AppData;
  salt?: string;
  iv?: string;
  payload?: string;
}

export async function makeBackup(data: AppData, password?: string): Promise<string> {
  const createdAt = new Date().toISOString();
  if (!password) return JSON.stringify({ app: 'florin', format: 1, encrypted: false, createdAt, data } satisfies BackupFile);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await key(password, salt);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(data))));
  return JSON.stringify({ app: 'florin', format: 1, encrypted: true, createdAt, salt: b64(salt), iv: b64(iv), payload: b64(cipher) } satisfies BackupFile);
}

export function isEncryptedBackup(text: string): boolean {
  try {
    const j = JSON.parse(text) as BackupFile;
    return j.app === 'florin' && j.encrypted === true;
  } catch {
    return false;
  }
}

/** Lê uma cópia de segurança. Lança 'password' se a palavra-passe estiver errada. */
export async function readBackup(text: string, password?: string): Promise<unknown> {
  const j = JSON.parse(text) as BackupFile | AppData;
  if ((j as BackupFile).app !== 'florin') return j; // ficheiro de dados simples
  const b = j as BackupFile;
  if (!b.encrypted) return b.data;
  if (!password) throw new Error('password');
  try {
    const k = await key(password, unb64(b.salt!));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(b.iv!) as BufferSource }, k, unb64(b.payload!) as BufferSource);
    return JSON.parse(dec.decode(plain));
  } catch {
    throw new Error('password');
  }
}
