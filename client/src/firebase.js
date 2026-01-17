import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getAnalytics } from 'firebase/analytics';

// Your web app's Firebase configuration
// Primary source: environment variables (REACT_APP_*)
const envConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
};

// Optional local secrets file support (local-only, must NOT be committed)
// Create `client/src/firebase.secrets.js` with a default export like:
// export default { apiKey: '...', authDomain: '...', projectId: '...', appId: '...', ... };
// This file is added to .gitignore above so it won't be committed.
// Note: In CI/production builds, env vars (REACT_APP_*) are used instead
let localConfig = null;
// Skip loading secrets file in CI to avoid webpack build errors
// In CI, webpack tries to statically analyze require() calls even in try-catch blocks
if (!process.env.CI) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // @ts-ignore - This file is optional and may not exist
    const secretsModule = require('./firebase.secrets');
    const secrets = secretsModule && (secretsModule.default || secretsModule);
    // Only use local config if it has a valid API key (not empty object)
    if (secrets && secrets.apiKey && typeof secrets.apiKey === 'string' && secrets.apiKey.trim().length > 0) {
      localConfig = secrets;
    }
  } catch (e) {
    // File doesn't exist, which is fine - we'll use env vars instead
    localConfig = null;
  }
}

// Use local config only if it has valid data, otherwise fall back to env vars
const firebaseConfig = (localConfig && localConfig.apiKey && localConfig.apiKey.trim().length > 0) 
  ? localConfig 
  : envConfig;

// Helpful runtime validation: throw a clear error if required config is missing
const missing = [];
if (!firebaseConfig.apiKey) missing.push('REACT_APP_FIREBASE_API_KEY or client/src/firebase.secrets.js(apiKey)');
if (!firebaseConfig.projectId) missing.push('REACT_APP_FIREBASE_PROJECT_ID or client/src/firebase.secrets.js(projectId)');
if (!firebaseConfig.appId) missing.push('REACT_APP_FIREBASE_APP_ID or client/src/firebase.secrets.js(appId)');
if (missing.length > 0) {
  console.error(`Firebase configuration error: missing required values: ${missing.join(', ')}`);
  throw new Error(`Missing required Firebase configuration: ${missing.join(', ')}. Create client/.env, set env vars, or create client/src/firebase.secrets.js locally.`);
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

