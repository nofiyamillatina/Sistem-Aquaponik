
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";

import {
  getAuth,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

import {
  getDatabase
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-database.js";

import { firebaseConfig } from "./firebase-config.js";

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// Inisialisasi Authentication
export const auth = getAuth(app);

// Inisialisasi Realtime Database
export const database = getDatabase(app);

// Login anonim untuk dashboard
export const firebaseReady = signInAnonymously(auth)
  .then(({ user }) => {
    console.log("Firebase Authentication berhasil.");
    console.log("Anonymous UID:", user.uid);
    return user;
  })
  .catch((error) => {
    console.error("Firebase Authentication gagal:", error);
    throw error;
  });
