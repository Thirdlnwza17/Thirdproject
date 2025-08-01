// src/firebaseConfig.ts
import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyC7jADGWqwgFSMvJGWoDEwPA-GOHlCE22w",
    authDomain: "sterilie-23a8a.firebaseapp.com",
    projectId: "sterilie-23a8a",
    storageBucket: "sterilie-23a8a.firebasestorage.app",
    messagingSenderId: "544281812264",
    appId: "1:544281812264:web:9179294cca6908f8d5441d",
    measurementId: "G-5QD8XV01XR"
  // ...อื่นๆ จาก Firebase Console
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApps()[0];
export const auth = getAuth(app);
export const storage = getStorage(app);
export const db = getFirestore(app);