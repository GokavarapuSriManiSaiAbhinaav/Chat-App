import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getToken } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, messaging } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { IoNotifications } from 'react-icons/io5';

const NotificationManager = () => {
    const { currentUser } = useAuth();
    const VAPID_KEY = import.meta.env.VITE_VAPID_KEY;
    const [showModal, setShowModal] = useState(false);

    useEffect(() => {
        // Check permission after a short delay
        const timer = setTimeout(async () => {
            console.log("🔔 NotificationManager: Checking permissions...", Notification.permission);
            if (!currentUser) {
                console.log("🔔 NotificationManager: No current user logged in.");
                return;
            }

            if (Notification.permission === 'default') {
                console.log("🔔 NotificationManager: Permission default, showing modal.");
                setShowModal(true);
            } else if (Notification.permission === 'granted') {
                console.log("🔔 NotificationManager: Permission granted, fetching token...");
                // If already granted, log the token for debugging/user verification
                try {
                    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
                    console.log("🔥 FCM TOKEN:", token);
                    window.fcmToken = token;

                    // Update token in DB to ensure freshness
                    if (token && currentUser) {
                        const tokenRef = doc(db, 'users', currentUser.uid, 'fcmTokens', token);
                        await setDoc(tokenRef, {
                            token: token,
                            deviceType: 'web',
                            lastUpdated: serverTimestamp()
                        }, { merge: true });
                        console.log("✅ FCM Token saved to Firestore");
                    }
                } catch (e) {
                    console.error("❌ Error fetching FCM token:", e);
                }
            } else {
                console.log("🔔 NotificationManager: Permission denied or other state:", Notification.permission);
            }
        }, 2000);
        return () => clearTimeout(timer);
    }, [currentUser]);

    const handleEnable = async () => {
        console.log("🔔 NotificationManager: 'Yes, Notify Me' clicked");
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const token = await getToken(messaging, { vapidKey: VAPID_KEY });
                if (token && currentUser) {
                    console.log("🔥 FCM TOKEN (Newly Granted):", token);
                    window.fcmToken = token;
                    const tokenRef = doc(db, 'users', currentUser.uid, 'fcmTokens', token);
                    await setDoc(tokenRef, {
                        token: token,
                        deviceType: 'web',
                        lastUpdated: serverTimestamp()
                    });
                }
            }
        } catch (error) {
            console.error("Notification permission error:", error);
        } finally {
            setShowModal(false);
        }
    };

    const handleLater = () => {
        console.log("🔔 NotificationManager: 'Maybe Later' clicked");
        setShowModal(false);
    };

    if (!showModal) return null;

    return createPortal(
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            zIndex: 10000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backdropFilter: 'blur(5px)'
        }}>
            <div style={{
                background: '#18181b',
                padding: '30px',
                borderRadius: '16px',
                width: '90%',
                maxWidth: '400px',
                textAlign: 'center',
                border: '1px solid #27272a',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}>
                <div style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '50%',
                    background: 'rgba(34, 197, 94, 0.1)',
                    color: '#22c55e',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '30px',
                    margin: '0 auto 20px'
                }}>
                    <IoNotifications />
                </div>
                <h3 style={{ margin: '0 0 10px', color: 'white', fontSize: '1.25rem' }}>Enable Notifications</h3>
                <p style={{ margin: '0 0 24px', color: '#a1a1aa', fontSize: '0.95rem', lineHeight: '1.5' }}>
                    Stay instantly updated! Enable notifications to alert you when you receive new messages, even when the app is in the background.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <button
                        onClick={handleEnable}
                        style={{
                            padding: '12px',
                            background: '#22c55e',
                            color: 'white',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '1rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                        }}
                    >
                        Yes, Notify Me
                    </button>
                    <button
                        onClick={handleLater}
                        style={{
                            padding: '12px',
                            background: 'transparent',
                            color: '#71717a',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.9rem',
                            cursor: 'pointer'
                        }}
                    >
                        Maybe Later
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default NotificationManager;
