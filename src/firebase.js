
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";

// TODO: Replace the following with your app's Firebase project configuration
// You can find these in your Firebase Console -> Project Settings
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Validate config
const missingKeys = Object.keys(firebaseConfig).filter(key => !firebaseConfig[key]);
if (missingKeys.length > 0) {
  const message = `Missing Firebase configuration keys: ${missingKeys.join(', ')}. \nPlease check your .env file and ensure it is saved. \nAlso, restart the server (Ctrl+C and npm run dev) to load environment variables.`;
  console.error(message);
  // alert(message); // Alert might be annoying if it pops up too often during dev
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const messaging = getMessaging(app);
export const googleProvider = new GoogleAuthProvider();
