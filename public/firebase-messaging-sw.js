importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyA3jRH1a3swCuonAi_YbpLBd_zh1g3P5WQ",
    authDomain: "chat-app-601e0.firebaseapp.com",
    projectId: "chat-app-601e0",
    storageBucket: "chat-app-601e0.firebasestorage.app",
    messagingSenderId: "787434652728",
    appId: "1:787434652728:web:c0e063592b922e435c12cd"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);
    const notificationTitle = payload.notification.title;
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/logo.png'
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});
