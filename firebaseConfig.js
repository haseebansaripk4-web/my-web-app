import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAP5s2xFAxcLqD18M4O04R7Gm4Jp5jkDWk",
    authDomain: "trading-journal-35078.firebaseapp.com",
    projectId: "trading-journal-35078",
    storageBucket: "trading-journal-35078.firebasestorage.app",
    messagingSenderId: "285791655657",
    appId: "1:285791655657:web:bb7eead6f1526456174278",
    measurementId: "G-MN271006GV"
};

const app = initializeApp(firebaseConfig);

// ✅ THIS IS THE MISSING PART
export const db = getFirestore(app);