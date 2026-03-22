import type { Message } from './types';

const IDB_NAME = 'pinbo';
const IDB_VERSION = 2;
const ENS_TTL = 24 * 60 * 60 * 1000;
let idbInstance: IDBDatabase | null = null;

/** Opens (or returns the cached) IndexedDB database, creating stores on first run. */
function openIdb(): Promise<IDBDatabase> {
	if (idbInstance) return Promise.resolve(idbInstance);
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(IDB_NAME, IDB_VERSION);
		req.onupgradeneeded = (e) => {
			const db = (e.target as IDBOpenDBRequest).result;
			if (!db.objectStoreNames.contains('messages'))
				db.createObjectStore('messages', { keyPath: 'txHash' });
			if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
			if (!db.objectStoreNames.contains('ens')) db.createObjectStore('ens', { keyPath: 'key' });
		};
		req.onsuccess = (e) => {
			idbInstance = (e.target as IDBOpenDBRequest).result;
			resolve(idbInstance);
		};
		req.onerror = () => reject(req.error);
	});
}

/**
 * Saves a message to IDB. Fire-and-forget — errors are silently swallowed
 * so cache writes never block or break the UI.
 * IDB cannot store BigInt; coerce blockNumber to Number before writing.
 */
export function idbSaveMessage(msg: Message): void {
	openIdb()
		.then((db) => {
			const tx = db.transaction('messages', 'readwrite');
			tx.objectStore('messages').put({ ...msg, blockNumber: Number(msg.blockNumber) });
		})
		.catch(() => {});
}

/** Retrieves a single message by tx hash, or null if not cached. */
export async function idbGetMessage(txHash: string): Promise<Message | null> {
	const db = await openIdb();
	return new Promise((resolve, reject) => {
		const req = db.transaction('messages', 'readonly').objectStore('messages').get(txHash);
		req.onsuccess = () => {
			const m = req.result;
			// Restore blockNumber back to BigInt after reading (was stored as Number).
			resolve(m ? ({ ...m, blockNumber: BigInt(m.blockNumber) } as Message) : null);
		};
		req.onerror = () => reject(req.error);
	});
}

/** Returns all cached messages sorted newest-first. */
export async function idbGetAllMessages(): Promise<Message[]> {
	const db = await openIdb();
	return new Promise((resolve, reject) => {
		const req = db.transaction('messages', 'readonly').objectStore('messages').getAll();
		req.onsuccess = () =>
			resolve(
				(req.result as any[])
					// Restore blockNumber back to BigInt after reading (was stored as Number).
					.map((m) => ({ ...m, blockNumber: BigInt(m.blockNumber) }) as Message)
					.sort((a, b) => b.timestamp - a.timestamp)
			);
		req.onerror = () => reject(req.error);
	});
}

/** Reads a numeric metadata value (e.g. 'oldestBlock', 'newestBlock'). Returns null if not set. */
export async function idbGetMeta(key: string): Promise<number | null> {
	const db = await openIdb();
	return new Promise((resolve, reject) => {
		const req = db.transaction('meta', 'readonly').objectStore('meta').get(key);
		req.onsuccess = () => resolve(req.result?.value ?? null);
		req.onerror = () => reject(req.error);
	});
}

/** Writes a numeric metadata value (e.g. block cursors used to track scan progress). */
export async function idbSetMeta(key: string, value: number): Promise<void> {
	const db = await openIdb();
	return new Promise((resolve, reject) => {
		const req = db.transaction('meta', 'readwrite').objectStore('meta').put({ key, value });
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

/**
 * Reads a cached ENS entry.
 * Returns undefined if the entry is missing or expired (older than 24h).
 * Returns null if the entry is cached as "no ENS name found".
 */
export async function idbGetEns(key: string): Promise<string | null | undefined> {
	const db = await openIdb();
	return new Promise((resolve, reject) => {
		const req = db.transaction('ens', 'readonly').objectStore('ens').get(key);
		req.onsuccess = () => {
			const entry = req.result;
			if (!entry) return resolve(undefined); // not cached
			if (Date.now() - entry.ts > ENS_TTL) return resolve(undefined); // expired
			resolve(entry.value);
		};
		req.onerror = () => reject(req.error);
	});
}

/** Writes an ENS entry with the current timestamp for TTL tracking. Pass null to cache a "not found" result. */
export async function idbSetEns(key: string, value: string | null): Promise<void> {
	const db = await openIdb();
	return new Promise((resolve, reject) => {
		const req = db
			.transaction('ens', 'readwrite')
			.objectStore('ens')
			.put({ key, value, ts: Date.now() });
		req.onsuccess = () => resolve();
		req.onerror = () => reject(req.error);
	});
}

/** Clears all three stores (messages, meta, ens) in a single transaction. Called on wallet disconnect. */
export async function idbClear(): Promise<void> {
	const db = await openIdb();
	return new Promise((resolve, reject) => {
		const tx = db.transaction(['messages', 'meta', 'ens'], 'readwrite');
		tx.objectStore('messages').clear();
		tx.objectStore('meta').clear();
		tx.objectStore('ens').clear();
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
	});
}
