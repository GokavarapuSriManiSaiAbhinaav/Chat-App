
const DB_NAME = 'ChatAppSecureKeys';
const STORE_NAME = 'keys';
const KEY_PAIR_ID = 'userKeyPair';

/**
 * Service to handle Client-Side Encryption using Web Crypto API.
 * Uses RSA-OAEP for Key Exchange and AES-GCM for content encryption.
 */
class CryptoService {
    constructor() {
        this.dbPromise = this.openDatabase();
    }

    openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onerror = (event) => reject('Database error: ' + event.target.errorCode);
            request.onsuccess = (event) => resolve(event.target.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }

    async savePrivateKey(privateKey, uid) {
        if (!uid) throw new Error("UID required for saving private key");
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.put(privateKey, `${KEY_PAIR_ID}_${uid}`);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }

    async getPrivateKey(uid) {
        if (!uid) throw new Error("UID required for retrieving private key");
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(`${KEY_PAIR_ID}_${uid}`);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e);
        });
    }

    async savePublicKey(publicKeyJwk, uid) {
        if (!uid) throw new Error("UID required for saving public key");
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            // Storing as 'userPublicKey_UID'
            const request = store.put(publicKeyJwk, `userPublicKey_${uid}`);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e);
        });
    }

    async getPublicKey(uid) {
        if (!uid) throw new Error("UID required for retrieving public key");
        const db = await this.dbPromise;
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(`userPublicKey_${uid}`);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (e) => reject(e);
        });
    }

    /**
     * Generate RSA-OAEP Key Pair (2048 bit).
     * Returns {{ publicKey: CryptoKey, privateKey: CryptoKey }}
     */
    async generateKeyPair() {
        return await window.crypto.subtle.generateKey(
            {
                name: "RSA-OAEP",
                modulusLength: 2048,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: "SHA-256"
            },
            true, // Extractable
            ["encrypt", "decrypt"]
        );
    }

    /**
     * Export Public Key to JWK format for storage in Firestore.
     */
    async exportPublicKey(key) {
        return await window.crypto.subtle.exportKey("jwk", key);
    }

    /**
     * Import Public Key from JWK format.
     */
    async importPublicKey(jwk) {
        return await window.crypto.subtle.importKey(
            "jwk",
            jwk,
            {
                name: "RSA-OAEP",
                hash: "SHA-256"
            },
            true,
            ["encrypt"]
        );
    }

    /**
     * Generate a random AES-GCM key for message encryption.
     */
    async generateAESKey() {
        return await window.crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true,
            ["encrypt", "decrypt"]
        );
    }

    /**
     * Encrypt text using AES-GCM.
     * Returns { ciphertext, iv } (base64 encoded strings)
     */
    async encryptData(text, aesKey) {
        const encoder = new TextEncoder();
        const data = encoder.encode(text);
        const iv = window.crypto.getRandomValues(new Uint8Array(12));

        const encryptedBuffer = await window.crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            aesKey,
            data
        );

        return {
            ciphertext: this.arrayBufferToBase64(encryptedBuffer),
            iv: this.arrayBufferToBase64(iv)
        };
    }

    /**
     * Decrypt text using AES-GCM.
     */
    async decryptData(ciphertextB64, ivB64, aesKey) {
        const ciphertext = this.base64ToArrayBuffer(ciphertextB64);
        const iv = this.base64ToArrayBuffer(ivB64);

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv
            },
            aesKey,
            ciphertext
        );

        const decoder = new TextDecoder();
        return decoder.decode(decryptedBuffer);
    }

    /**
     * Encrypt the AES key with a user's RSA Public Key.
     */
    async encryptAESKey(aesKey, publicKey) {
        const rawKey = await window.crypto.subtle.exportKey("raw", aesKey);
        const encryptedBuffer = await window.crypto.subtle.encrypt(
            {
                name: "RSA-OAEP"
            },
            publicKey,
            rawKey
        );
        return this.arrayBufferToBase64(encryptedBuffer);
    }

    /**
     * Decrypt the AES key using the user's RSA Private Key.
     */
    async decryptAESKey(encryptedKeyB64, privateKey) {
        const encryptedBuffer = this.base64ToArrayBuffer(encryptedKeyB64);
        const decryptedBuffer = await window.crypto.subtle.decrypt(
            {
                name: "RSA-OAEP"
            },
            privateKey,
            encryptedBuffer
        );

        return await window.crypto.subtle.importKey(
            "raw",
            decryptedBuffer,
            {
                name: "AES-GCM"
            },
            true,
            ["encrypt", "decrypt"]
        );
    }

    /**
     * Validates if the Private Key matches the Public Key (JWK).
     */
    async validateKeyPair(privateKey, publicKeyJwk) {
        try {
            const publicKey = await this.importPublicKey(publicKeyJwk);
            const testAESKey = await this.generateAESKey();
            const encryptedKey = await this.encryptAESKey(testAESKey, publicKey);
            await this.decryptAESKey(encryptedKey, privateKey);
            return true;
        } catch (e) {
            console.warn("Key Pair Validation Failed:", e);
            return false;
        }
    }

    /* Utils */
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    base64ToArrayBuffer(base64) {
        const binary_string = window.atob(base64);
        const len = binary_string.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binary_string.charCodeAt(i);
        }
        return bytes.buffer;
    }
}

export const cryptoService = new CryptoService();
