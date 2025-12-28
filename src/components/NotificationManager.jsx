import React, { useEffect } from 'react';
import { getToken } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, messaging } from '../firebase';
import { useAuth } from '../context/AuthContext';

const NotificationManager = () => {
    const { currentUser } = useAuth();
    const VAPID_KEY = "BGJe_UDaOmVtxWlRy_JT-fz6rPuBFkYrVnXjrE4lOGajBtmfKvJgVaQ5d_zu2LCuSsp1X25SyvRvqHmSzqHp_-c";

    useEffect(() => {
        const registerNotifications = async () => {
            if (!currentUser) return;

            // 1. Check if permission is already granted or denied
            if (Notification.permission === 'default') {
                const confirmed = window.confirm("Allow notifications for new messages?");
                if (!confirmed) return;
            }

            try {
                // 2. Request permission (browser native)
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    // 3. Get FCM Token
                    const token = await getToken(messaging, { vapidKey: VAPID_KEY });

                    if (token) {
                        // 4. Save Token to Firestore
                        const tokenRef = doc(db, 'users', currentUser.uid, 'fcmTokens', token);
                        await setDoc(tokenRef, {
                            token: token,
                            deviceType: 'web',
                            lastUpdated: serverTimestamp()
                        });
                    }
                }
            } catch (error) {
                // Silent fail in production or send to error reporting service
            }
        };

        // Delay registration slightly to not interfere with login animations/loaders
        const timer = setTimeout(registerNotifications, 3000);
        return () => clearTimeout(timer);
    }, [currentUser]);

    return null; // This component doesn't render anything UI-wise
};

export default NotificationManager;
