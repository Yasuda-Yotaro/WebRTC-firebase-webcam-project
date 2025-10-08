// fierebase-config.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAURA1Os8rPj_ov0ofDs-BCyO3aKhibhtw",
  authDomain: "webrtc-tutorial-81613.firebaseapp.com",
  projectId: "webrtc-tutorial-81613",
  storageBucket: "webrtc-tutorial-81613.firebasestorage.app",
  messagingSenderId: "911640820129",
  appId: "1:911640820129:web:b7102245c80e146013b3e0",
  measurementId: "G-68WFGEKPQB"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
