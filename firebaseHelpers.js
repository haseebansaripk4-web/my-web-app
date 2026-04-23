import { db } from "./firebaseConfig.js";
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    getDocs,
    query
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let strategies = [];


function getUser() {
    return window.currentUser || null;
}
// ✅ strategies listener
function listenStrategies(callback) {

    const user = getUser();

    if (!user || !user.uid) {
        console.warn("No user logged in yet - skipping listenStrategies");
        callback([]); // safe empty return
        return;
    }

    const ref = query(
        collection(db, "users", user.uid, "strategies")
    );

    return onSnapshot(ref, (snapshot) => {
        const data = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        callback(data);
    });
}
// ✅ add strategy
async function addStrategy(data) {

    const user = getUser();

    if (!user || !user.uid) {
        console.error("User not logged in");
        return;
    }

    await addDoc(
        collection(db, "users", user.uid, "strategies"),
        data
    );
}

// ✅ update strategy
async function updateStrategy(id, data) {

    const user = getUser();

    if (!user || !user.uid) {
        console.error("User not logged in");
        return;
    }

    await updateDoc(
        doc(db, "users", user.uid, "strategies", id),
        data
    );
}

// ✅ delete strategy
async function deleteStrategy(id) {

    const user = getUser();

    if (!user || !user.uid) {
        console.error("User not logged in");
        return;
    }

    await deleteDoc(
        doc(db, "users", user.uid, "strategies", id)
    );
}

// ✅ settings
async function updateUserSettings(data) {

    const user = getUser();

    if (!user || !user.uid) {
        console.error("User not logged in");
        return;
    }

    await addDoc(
        collection(db, "users", user.uid, "settings"),
        data
    );
}

async function loadSettings() {

    const user = getUser();

    if (!user || !user.uid) return [];

    const snap = await getDocs(
        collection(db, "users", user.uid, "settings")
    );

    let arr = [];
    snap.forEach(d => arr.push(d.data()));

    return arr;
}

// ✅ clear all data
async function clearAllData() {

    const user = getUser();

    if (!user || !user.uid) return;

    const tradesSnap = await getDocs(
        collection(db, "users", user.uid, "trades")
    );

    tradesSnap.forEach(async (d) => {
        await deleteDoc(d.ref);
    });

    const stratSnap = await getDocs(
        collection(db, "users", user.uid, "strategies")
    );

    stratSnap.forEach(async (d) => {
        await deleteDoc(d.ref);
    });
}

async function loadStrategies() {

    const user = getUser();

    if (!user || !user.uid) return [];

    const snapshot = await getDocs(
        collection(db, "users", user.uid, "strategies")
    );

    strategies = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    return strategies;
}

// ✅ GLOBAL EXPORT
window.firebaseHelpers = {
    listenStrategies,
    addStrategy,
    updateStrategy,
    deleteStrategy,
    updateUserSettings,
    loadSettings,
    clearAllData
};