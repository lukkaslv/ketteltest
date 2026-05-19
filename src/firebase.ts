import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAGE64HYcFnnKpp3RijspTcEJDuUmmWqEM",
  authDomain: "ketteltest.firebaseapp.com",
  projectId: "ketteltest",
  storageBucket: "ketteltest.firebasestorage.app",
  messagingSenderId: "935184710738",
  appId: "1:935184710738:web:9a4a2fb6b72fd477f9338b",
  measurementId: "G-NXTCB0220Q"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error("Error signing in with Google: ", error);
    throw error;
  }
};

export const logOut = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out: ", error);
    throw error;
  }
};
