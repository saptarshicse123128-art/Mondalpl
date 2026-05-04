import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

const SETTINGS_COLLECTION = 'appSettings';
const GLOBAL_SETTINGS_DOC = 'global';

export const DEFAULT_APP_SETTINGS = {
  enableDualUnitSystem: false
};

const getSettingsRef = () => doc(db, SETTINGS_COLLECTION, GLOBAL_SETTINGS_DOC);

export const appSettingsService = {
  onSettingsChange(callback) {
    const settingsRef = getSettingsRef();
    return onSnapshot(
      settingsRef,
      (snapshot) => {
        const raw = snapshot.exists() ? snapshot.data() : {};
        callback({ ...DEFAULT_APP_SETTINGS, ...raw });
      },
      (error) => {
        console.error('Error listening to app settings:', error);
        callback(DEFAULT_APP_SETTINGS, error);
      }
    );
  },

  async updateSettings(partialSettings) {
    const settingsRef = getSettingsRef();
    await setDoc(
      settingsRef,
      {
        ...partialSettings,
        updatedAt: serverTimestamp()
      },
      { merge: true }
    );
  }
};

