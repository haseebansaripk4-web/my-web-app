// 🔥 Firebase Modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";



// 🔥 Config
const firebaseConfig = {
  apiKey: "AIzaSyAP5s2xFAxcLqD18M4O04R7Gm4Jp5jkDWk",
  authDomain: "trading-journal-35078.firebaseapp.com",
  projectId: "trading-journal-35078",
  storageBucket: "trading-journal-35078.firebasestorage.app",
  messagingSenderId: "285791655657",
  appId: "1:285791655657:web:bb7eead6f1526456174278",
  measurementId: "G-MN271006GV"
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log("Persistence enabled");
  })
  .catch((err) => {
    console.error("Persistence error:", err);
  });
const db = getFirestore(app);

// 🔐 SIGNUP
window.registerUser = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("Enter email & password");
    return;
  }

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    console.log("Signup success:", userCredential.user);
    updateUIAfterLogin(userCredential.user);
  } catch (error) {
    console.error("Signup error:", error.message);
    alert(error.message);
  }
};

// 🔐 LOGIN
window.loginUser = async function () {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("Enter email & password");
    return;
  }

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    console.log("Login success:", userCredential.user);
    updateUIAfterLogin(userCredential.user);
  } catch (error) {
    console.error("Login error:", error.message);
    alert(error.message);
  }
};

// GLOBAL
window.auth = auth;
window.db = db;
window.loadTrades = function () {

  if (!window.currentUser) return;

  try {

    const userId = window.currentUser.uid;

    if (unsubscribeTrades) {
      unsubscribeTrades();
      unsubscribeTrades = null;
    }

    const ref = query(
      collection(db, "users", userId, "trades"),
      orderBy("date", "desc")
    );

    unsubscribeTrades = onSnapshot(ref, (snapshot) => {
      trades = [];

      snapshot.forEach(doc => {
        trades.push({ id: doc.id, ...doc.data() });
      });

      renderTrades();
      updateDashboard();
    });

  } catch (err) {
    console.error("loadTrades error:", err);
  }
};




// 🔐 LOGOUT

// ✅ FINAL LOGOUT
window.logoutUserConfirm = async function () {
  try {
    if (!auth) {
      console.error("Auth not initialized ❌");
      return;
    }

    await signOut(auth);

    window.currentUser = null;

    if (typeof unsubscribeTrades !== "undefined" && unsubscribeTrades) {
      unsubscribeTrades();
      unsubscribeTrades = null;
    }

    closeLogoutPopup();

    const login = document.getElementById("loginScreen");
    const app = document.getElementById("appScreen");

    if (login) login.style.display = "block";
    if (app) app.style.display = "none";

    console.log("User logged out ✅");

  } catch (err) {
    console.error("Logout error:", err);
    alert("Logout failed");
  }
};

// ✅ expose globally
window.auth = auth;

window.logoutUser = async function () {
  await signOut(auth);
  window.currentUser = null;

  if (unsubscribeTrades) {
    unsubscribeTrades();
    unsubscribeTrades = null;
  }
};
// ✅ HANDLE REDIRECT LOGIN RESULT (IMPORTANT FIX)



function updateUIAfterLogin(user) {
  console.log("LOGIN USER:", user);

  const login = document.getElementById("loginScreen");
  const app = document.getElementById("appScreen");

  if (user) {
    window.currentUser = user;

    if (login) login.style.display = "none";
    if (app) app.style.display = "block";

    window.loadTrades?.();

    if (window.startStrategyListener) {
      window.startStrategyListener();
    }

  } else {
    window.currentUser = null;

    if (login) login.style.display = "block";
    if (app) app.style.display = "none";
  }
}

// ✅ auth state listener
let authReady = false;

onAuthStateChanged(auth, (user) => {
  console.log("AUTH STATE:", user);

  if (user) {
    updateUIAfterLogin(user);
  } else {
    console.log("User not logged in");
  }
});