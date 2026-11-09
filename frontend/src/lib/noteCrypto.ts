import { SEALED_PREFIX } from "../../../shared/constants";

/**
 * The Notes page's notes encrypted end to end (Settings › Theme and design › Encrypt notes): a note's title and text are
 * sealed on the device with the notes key (AES-GCM, a fresh iv each time) before they are sent, so the server keeps only
 * what it can't read. The notes key is random; the server keeps it too, sealed with a key made from the user's notes
 * passphrase (PBKDF2), which never leaves their devices. Each device opens it once and keeps it (lib/notesKey).
 */

/** The notes key as the server keeps it (User.notesKey): sealed with the passphrase. `id` stays when the passphrase changes. */
export interface SealedKey {
  id: string;
  salt: string;
  iv: string;
  key: string;
  rounds: number;
}

/** PBKDF2 rounds: a guess at the passphrase costs this much; opening the key takes a phone about a second. */
const ROUNDS = 600_000;
const IV_BYTES = 12;

const random = (bytes: number) => crypto.getRandomValues(new Uint8Array(bytes));

// In pieces: a note can be a million characters, too many to spread into one call.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at++) bytes[at] = binary.charCodeAt(at);
  return bytes;
}

/** The key the passphrase makes with this salt: it seals and opens the notes key. */
async function passphraseKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, rounds: number): Promise<CryptoKey> {
  const typed = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase.normalize("NFC")), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds }, typed, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** A new notes key, as its bytes: sealed with sealKey for the server, made usable with usableKey for this device. */
export const newNotesKey = () => random(32);

/** The notes key sealed with the passphrase (a new salt each time), under `id`. */
export async function sealKey(raw: Uint8Array<ArrayBuffer>, id: string, passphrase: string, rounds = ROUNDS): Promise<SealedKey> {
  const salt = random(16);
  const iv = random(IV_BYTES);
  const key = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await passphraseKey(passphrase, salt, rounds), raw);
  return { id, salt: toBase64(salt), iv: toBase64(iv), key: toBase64(new Uint8Array(key)), rounds };
}

/** The notes key's bytes, or null when the passphrase isn't the one it was sealed with. */
export async function openKey(sealed: SealedKey, passphrase: string): Promise<Uint8Array<ArrayBuffer> | null> {
  try {
    const key = await passphraseKey(passphrase, fromBase64(sealed.salt), sealed.rounds);
    return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(sealed.iv) }, key, fromBase64(sealed.key)));
  } catch {
    return null;
  }
}

/** The notes key as this device keeps it: it seals and opens notes, and its bytes can't be read back out of it. */
export const usableKey = (raw: Uint8Array<ArrayBuffer>) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

/** Whether a title or text is sealed. */
export const isSealed = (words: string) => words.startsWith(SEALED_PREFIX);

/** A title or text sealed; empty stays empty. */
export async function sealWords(key: CryptoKey, words: string): Promise<string> {
  if (!words || isSealed(words)) return words;
  const iv = random(IV_BYTES);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(words)));
  const both = new Uint8Array(IV_BYTES + sealed.length);
  both.set(iv);
  both.set(sealed, IV_BYTES);
  return SEALED_PREFIX + toBase64(both);
}

/** A title or text readable again; one not sealed is as it is. Throws when `key` didn't seal it. */
export async function openWords(key: CryptoKey, words: string): Promise<string> {
  if (!isSealed(words)) return words;
  const both = fromBase64(words.slice(SEALED_PREFIX.length));
  const opened = await crypto.subtle.decrypt({ name: "AES-GCM", iv: both.subarray(0, IV_BYTES) }, key, both.subarray(IV_BYTES));
  return new TextDecoder().decode(opened);
}

/** A note's (or a change's) title and text, those it has, sealed. */
export async function sealNote<T extends { title?: string; text?: string }>(key: CryptoKey, note: T): Promise<T> {
  return {
    ...note,
    ...(note.title !== undefined && { title: await sealWords(key, note.title) }),
    ...(note.text !== undefined && { text: await sealWords(key, note.text) }),
  };
}

/** A note's title and text readable again. Throws when `key` didn't seal them. */
export async function openNote<T extends { title: string; text: string }>(key: CryptoKey, note: T): Promise<T> {
  return { ...note, title: await openWords(key, note.title), text: await openWords(key, note.text) };
}

/** Whether a note as the server sent it has words that aren't sealed. */
export const hasPlainWords = (note: { title: string; text: string }) => [note.title, note.text].some((words) => words !== "" && !isSealed(words));
