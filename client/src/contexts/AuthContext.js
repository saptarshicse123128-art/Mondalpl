import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from 'firebase/auth';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../firebase';

const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  function signup(email, password) {
    // Check if email is in the allowed list
    const normalizedEmail = email.toLowerCase().trim();
    if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
      return Promise.reject(new Error('Access denied. This email is not authorized to create an account.'));
    }

    return createUserWithEmailAndPassword(auth, email, password).then(async (userCredential) => {
      // Double check email after account creation
      const userEmail = userCredential.user.email?.toLowerCase().trim();
      if (!ALLOWED_EMAILS.includes(userEmail)) {
        // Delete the account if email is not allowed
        await userCredential.user.delete();
        throw new Error('Access denied. This email is not authorized to create an account.');
      }

      // Create user document in Firestore
      try {
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          email: userCredential.user.email,
          lastLogin: serverTimestamp(),
          isOnline: true,
          role: 'User',
          createdAt: serverTimestamp()
        });
      } catch (error) {
        console.error('Error creating user document:', error);
      }
      return userCredential;
    });
  }

  // Allowed email addresses
  const ALLOWED_EMAILS = [
    'sunitamondal1809@gmail.com',
    'mondalplumbingsanitation@gmail.com',
    'ghoshsaptarshiofficial@gmail.com'
  ];

  function login(email, password) {
    // Check if email is in the allowed list
    const normalizedEmail = email.toLowerCase().trim();
    if (!ALLOWED_EMAILS.includes(normalizedEmail)) {
      return Promise.reject(new Error('Access denied. This email is not authorized to login.'));
    }

    return signInWithEmailAndPassword(auth, email, password).then(async (userCredential) => {
      // Double check email after authentication
      const userEmail = userCredential.user.email?.toLowerCase().trim();
      if (!ALLOWED_EMAILS.includes(userEmail)) {
        await signOut(auth);
        throw new Error('Access denied. This email is not authorized to login.');
      }

      // Save login info to Firestore
      try {
        await updateDoc(doc(db, 'users', userCredential.user.uid), {
          lastLogin: serverTimestamp(),
          isOnline: true,
          email: userCredential.user.email
        }).catch(async () => {
          // If document doesn't exist, create it
          await setDoc(doc(db, 'users', userCredential.user.uid), {
            email: userCredential.user.email,
            lastLogin: serverTimestamp(),
            isOnline: true,
            role: 'User',
            createdAt: serverTimestamp()
          });
        });
      } catch (error) {
        console.error('Error updating user login data:', error);
      }
      return userCredential;
    });
  }

  function logout() {
    // Set user as offline before logging out
    if (currentUser) {
      try {
        updateDoc(doc(db, 'users', currentUser.uid), {
          isOnline: false
        }).catch(error => console.error('Error updating logout:', error));
      } catch (error) {
        console.error('Error during logout:', error);
      }
    }
    return signOut(auth);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const value = {
    currentUser,
    signup,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

