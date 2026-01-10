
import React, { useContext, useState, useEffect } from "react";
import { auth, googleProvider, db } from "../firebase"; // Added db
import { signInWithPopup, signOut, onAuthStateChanged, deleteUser } from "firebase/auth";
import { doc, updateDoc, getDoc, setDoc } from "firebase/firestore"; // Firestore imports
import { cryptoService } from "../utils/CryptoService"; // Import CryptoService

const AuthContext = React.createContext();

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    function signInWithGoogle() {
        return signInWithPopup(auth, googleProvider);
    }

    function logout() {
        return signOut(auth);
    }

    function deleteAccount() {
        if (!auth.currentUser) return;
        return deleteUser(auth.currentUser);
    }

    // Helper: Initialize Keys
    const initializeUserKeys = async (user) => {
        try {
            // 1. Check if we have a private key locally
            let privateKey = await cryptoService.getPrivateKey(user.uid);

            if (!privateKey) {
                console.log("Generating new Key Pair for encryption...");
                // 2. Generate new keys
                const keyPair = await cryptoService.generateKeyPair();

                // Save Private Key
                await cryptoService.savePrivateKey(keyPair.privateKey, user.uid);
                privateKey = keyPair.privateKey;

                // Export Public Key
                const publicKeyJwk = await cryptoService.exportPublicKey(keyPair.publicKey);

                // Save Public Key Locally (Offline Support)
                await cryptoService.savePublicKey(publicKeyJwk, user.uid);

                // 3. Upload Public Key to Firestore
                const userRef = doc(db, "users", user.uid);
                await setDoc(userRef, {
                    publicKey: publicKeyJwk,
                    updatedAt: new Date()
                }, { merge: true });

                console.log("Public Key saved locally and uploaded to Firestore.");
            } else {
                console.log("Encryption keys found locally. Validating...");
                let localPubKey = null;
                try {
                    localPubKey = await cryptoService.getPublicKey(user.uid);
                } catch (e) {
                    console.warn("Error reading public key:", e);
                }

                // Validate Key Pair Integrity
                const isValid = localPubKey && await cryptoService.validateKeyPair(privateKey, localPubKey);

                if (!isValid) {
                    console.warn("CRITICAL: Key Mismatch or Missing Public Key detected. Regenerating valid pair...");

                    const keyPair = await cryptoService.generateKeyPair();
                    await cryptoService.savePrivateKey(keyPair.privateKey, user.uid);

                    const publicKeyJwk = await cryptoService.exportPublicKey(keyPair.publicKey);
                    await cryptoService.savePublicKey(publicKeyJwk, user.uid); // Save Local

                    // Upload new key
                    const userRef = doc(db, "users", user.uid);
                    setDoc(userRef, {
                        publicKey: publicKeyJwk,
                        updatedAt: new Date()
                    }, { merge: true }).catch(e => console.error("Background key upload failed:", e));

                    console.log("Keys Auto-Repaired (Fresh Pair).");
                } else {
                    console.log("Keys Validated Successfully.");
                }
            }
        } catch (error) {
            console.error("Error initializing encryption keys:", error);
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            setCurrentUser(user);
            setLoading(false); // Unblock UI immediately

            if (user) {
                // Initialize Keys in background
                initializeUserKeys(user).catch(err => {
                    console.error("Key init failed in background:", err);
                });
            }
        });

        return unsubscribe;
    }, []);

    const value = {
        currentUser,
        signInWithGoogle,
        logout,
        deleteAccount,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}
