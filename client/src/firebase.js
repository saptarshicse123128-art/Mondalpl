import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCT1OVbTS_vIIY--joUJUp8acTA53bL0IY",
  authDomain: "mondalpl-30ea5.firebaseapp.com",
  projectId: "mondalpl-30ea5",
  storageBucket: "mondalpl-30ea5.firebasestorage.app",
  messagingSenderId: "1091570180886",
  appId: "1:1091570180886:web:e293555435ebc06a8f6637",
  measurementId: "G-CKEZ3D4N5X"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

// Initialize Analytics (only in browser environment)
let analytics;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

export { analytics };
export default app;

