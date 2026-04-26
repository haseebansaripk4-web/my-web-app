// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyC7ST5BIqroJ7sGupqjh59vkjIw8W64TxE",
  authDomain: "trading-journal-f0ded.firebaseapp.com",
  projectId: "trading-journal-f0ded",
  storageBucket: "trading-journal-f0ded.firebasestorage.app",
  messagingSenderId: "754760873432",
  appId: "1:754760873432:web:ae7ed065d113153a7d2ead",
  measurementId: "G-2PF1X322JC"
};

// INIT
firebase.initializeApp(firebaseConfig);

// SERVICES
const auth = firebase.auth();
const db = firebase.firestore();

// GOOGLE PROVIDER
const provider = new firebase.auth.GoogleAuthProvider();