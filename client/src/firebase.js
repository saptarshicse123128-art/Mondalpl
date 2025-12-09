import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

// Your web app's Firebase configuration
// These values are loaded from environment variables for security
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Helpful runtime validation: throw a clear error if required env vars are missing
if (!firebaseConfig.apiKey || !firebaseConfig.projectId || !firebaseConfig.appId) {
  // Log which values are missing (avoid printing the full API key in logs unless present)
  const missing = [];
  if (!firebaseConfig.apiKey) missing.push('REACT_APP_FIREBASE_API_KEY');
  if (!firebaseConfig.projectId) missing.push('REACT_APP_FIREBASE_PROJECT_ID');
  if (!firebaseConfig.appId) missing.push('REACT_APP_FIREBASE_APP_ID');
  console.error(`Firebase configuration error: missing environment variables: ${missing.join(', ')}`);
  throw new Error(
    `Missing required Firebase environment variables: ${missing.join(', ')}. ` +
    `Create a client/.env file or set them in your environment. See .env.example.`
  );
}

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Enable offline persistence for better user experience
try {
  enableIndexedDbPersistence(db);
} catch (err) {
  if (err.code === 'failed-precondition') {
    console.warn('Multiple tabs open, persistence can only be enabled in one tab at a time.');
  } else if (err.code === 'unimplemented') {
    console.warn('The current browser does not support persistence.');
  }
}

// Initialize Analytics (only in browser environment)
let analytics;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

export { analytics };
export default app;

