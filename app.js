
// LOGIN
function login() {
    auth.signInWithPopup(provider)
        .then(result => {
            console.log("User:", result.user);
            window.location.href = "dashboard.html";
        })
        .catch(err => {
            alert(err.message);
        });
}

// AUTH CHECK
auth.onAuthStateChanged(user => {

    showLoader();

    if (!user) {
        hideLoader();

        document.getElementById("loginView").style.display = "flex";
        document.getElementById("dashboardView").style.display = "none";
        return;
    }

    document.getElementById("loginView").style.display = "none";
    document.getElementById("dashboardView").style.display = "block";

    let uid = user.uid;

    db.collection("users").doc(uid).get()
        .then(doc => {

            if (!doc.exists || !doc.data().initialBalance) {

                document.getElementById("balanceSetup").style.display = "flex";

                hideLoader(); // ✅ FIX: ALWAYS CLOSE LOADER
                return;
            }

            document.getElementById("balanceSetup").style.display = "none";

            loadData(uid);
        })
        .catch(err => {
            console.error(err);
            hideLoader(); // ✅ SAFE ERROR FIX
        });
});

// ================= BALANCE =================
function saveBalance() {
    let val = Number(document.getElementById("initialBalance").value);

    if (!val || val <= 0) {
        alert("Enter valid balance");
        return;
    }

    let user = auth.currentUser;

    if (!user) {
        alert("User not ready, please try again");
        return;
    }

    let uid = user.uid;

    db.collection("users").doc(uid).set({
        initialBalance: val,
        createdAt: Date.now()
    }, { merge: true })
        .then(() => {
            document.getElementById("balanceSetup").style.display = "none";
            loadData(uid);
        })
        .catch(err => {
            alert(err.message);
        });
}
// ================= ADD TRADE =================
function addTrade() {
    let uid = auth.currentUser.uid;

    let pnlValue = Number(document.getElementById("pnl").value);

    if (tradeType === "loss") pnlValue = -Math.abs(pnlValue);
    if (tradeType === "profit") pnlValue = Math.abs(pnlValue);

    let data = {
        date: document.getElementById("date").value,
        pair: document.getElementById("pair").value,
        direction: document.getElementById("direction").value,
        pnl: pnlValue,
        emotion: document.getElementById("emotion").value,
        mistake: document.getElementById("mistake").value,
        note: document.getElementById("note").value,
        link: document.getElementById("link").value,
        createdAt: Date.now()
    };

    if (!data.date || !data.pair) {
        alert("Fill required fields");
        return;
    }

    let ref = db.collection("users").doc(uid).collection("trades");

    // 🔥 EDIT MODE
    if (editId) {
        ref.doc(editId).update(data).then(() => {
            editId = null;
            closeForm();
            loadData(uid);
        });
    }
    // 🔥 NEW MODE
    else {
        ref.add(data).then(() => {
            closeForm();
            loadData(uid);
        });
    }
}

// ================= DELETE =================
function deleteTrade(id) {
    let uid = auth.currentUser.uid;

    db.collection("users").doc(uid)
        .collection("trades")
        .doc(id).delete()
        .then(() => loadData(uid));
}


// ================= EDIT =================
let editId = null;

function editTrade(id, t) {
    openForm();

    editId = id;

    document.getElementById("date").value = t.date;
    document.getElementById("pair").value = t.pair;
    document.getElementById("direction").value = t.direction;
    document.getElementById("pnl").value = Math.abs(t.pnl);
    document.getElementById("emotion").value = t.emotion;
    document.getElementById("mistake").value = t.mistake;
    document.getElementById("note").value = t.note;
    document.getElementById("link").value = t.link;

    // 🔥 UX FIX (important)
    document.querySelector("#formPopup button:last-child").innerText = "Update Trade";
}

function updateTrade() {
    let uid = auth.currentUser.uid;

    let data = {
        date: date.value,
        pair: pair.value,
        direction: direction.value,
        pnl: Number(pnl.value),
        emotion: emotion.value,
        mistake: mistake.value,
        note: note.value,
        link: link.value
    };

    db.collection("users").doc(uid)
        .collection("trades")
        .doc(editId)
        .update(data)
        .then(() => {
            editId = null;
            closeForm();
            loadData(uid);
        });
}


// ================= LOAD DATA =================
function loadData(uid) {

    const journal = document.getElementById("journal");
    journal.innerHTML = "";

    let profit = 0, loss = 0, wins = 0, total = 0;
    let best = -Infinity, worst = Infinity;
    let profits = [], losses = [];

    const userRef = db.collection("users").doc(uid);
    const tradesRef = userRef.collection("trades");

    // ✅ RUN BOTH QUERIES TOGETHER (FASTER)
    Promise.all([
        userRef.get(),
        tradesRef.orderBy("createdAt", "desc").get()
    ]).then(([doc, snapshot]) => {

        // ================= USER DATA =================
        if (doc.exists) {
            const data = doc.data();

            const initialEl = document.getElementById("initial");
            if (initialEl) initialEl.innerText = data.initialBalance ?? 0;

            document.getElementById("balanceSetup").style.display = "none";
        } else {
            document.getElementById("balanceSetup").style.display = "flex";
            return;
        }

        // ================= BUILD TABLE FAST =================
        let rowsHTML = "";

        let allTrades = [];

        snapshot.forEach(docSnap => {
            let t = docSnap.data();
            allTrades.push({ id: docSnap.id, ...t });

            total++;

            if (t.pnl > 0) {
                profit += t.pnl;
                wins++;
                profits.push(t.pnl);
            } else {
                loss += t.pnl;
                losses.push(t.pnl);
            }

            if (t.pnl > best) best = t.pnl;
            if (t.pnl < worst) worst = t.pnl;
        });

        // ================= DASHBOARD (LAST 10 TRADES) =================
        let dashboardHTML = "";

        allTrades.slice(0, 10).forEach(t => {
            dashboardHTML += generateRow(t);
        });

        journal.innerHTML = dashboardHTML;

        // store globally for pagination
        window.allTrades = allTrades;

        // show/hide View All button
        document.getElementById("viewAllBtn").style.display =
            currentTab === "dashboard" ? "inline-block" : "none";

        setTimeout(() => {
            lucide.createIcons();
        }, 0);
        // ✅ ONE TIME DOM UPDATE (FAST)

        // pagination only for trades tab
        if (currentTab === "trades") {
            loadTradesPage(1);
        }

        // ================= CALCULATIONS =================
        let net = profit + loss;
        let winRate = total ? (wins / total) * 100 : 0;

        let avgProfit = profits.length ? profit / profits.length : 0;
        let avgLoss = losses.length ? loss / losses.length : 0;

        let initial = Number(document.getElementById("initial")?.innerText || 0);
        let current = initial + net;

        // ================= UI UPDATE =================


        // PROFIT (GREEN + $)
        document.getElementById("profit").innerHTML =
            `<span style="color:#22c55e;">$${profit.toFixed(2)}</span>`;

        // LOSS (RED + $)
        document.getElementById("loss").innerHTML =
            `<span style="color:#ef4444;">$${Math.abs(loss).toFixed(2)}</span>`;

        // NET PNL (GREEN IF +, RED IF -)
        document.getElementById("net").innerHTML =
            net >= 0
                ? `<span style="color:#22c55e;">$${net.toFixed(2)}</span>`
                : `<span style="color:#ef4444;">$${net.toFixed(2)}</span>`;

        // WIN RATE (same as before)
        document.getElementById("win").innerText = winRate.toFixed(2) + "%";

        // OTHER VALUES (unchanged)
        document.getElementById("avgProfit").innerText = avgProfit.toFixed(2);
        document.getElementById("avgLoss").innerText = avgLoss.toFixed(2);

        document.getElementById("best").innerText = best === -Infinity ? 0 : best;
        document.getElementById("worst").innerText = worst === Infinity ? 0 : worst;

        document.getElementById("current").innerText = current.toFixed(2);
        // ✅ ICONS ONLY ONCE
        lucide.createIcons();
        // ================= END LOADING =================
        setTimeout(() => {
            hideLoader();
        }, 600);
    });
}

function generateRow(t) {
    return `
<tr>
  <td>${t.date}</td>
  <td>${t.pair}</td>
  <td>${t.direction}</td>

  <td style="color:${t.pnl >= 0 ? '#22c55e' : '#ef4444'}">
    ${t.pnl}
  </td>

  <td>${t.emotion}</td>
  <td>${t.mistake}</td>
  <td>${t.note}</td>

  <td class="actions">
    <button onclick="openImage('${t.link}')">
      <i data-lucide="eye"></i>
    </button>

    <button onclick='editTrade("${t.id}", ${JSON.stringify(t)})'>
      <i data-lucide="edit-2"></i>
    </button>

    <button onclick="deleteTrade('${t.id}')">
      <i data-lucide="trash-2"></i>
    </button>
  </td>
</tr>`;
}

// ================= IMAGE MODAL =================
// ================= IMAGE MODAL =================
let zoomLevel = 1;
let posX = 0;
let posY = 0;
let isDragging = false;
let startX, startY;

function openImage(src) {
    const modal = document.getElementById("imgModal");
    const img = document.getElementById("modalImg");

    modal.style.display = "flex";
    img.src = src;

    // reset
    zoomLevel = 1;
    posX = 0;
    posY = 0;

    applyTransform();
}

// apply transform (zoom + pan)
function applyTransform() {
    const img = document.getElementById("modalImg");
    img.style.transform = `translate(${posX}px, ${posY}px) scale(${zoomLevel})`;
}

// ================= ZOOM =================
document.addEventListener("DOMContentLoaded", () => {
    const img = document.getElementById("modalImg");
    if (!img) return;

    img.addEventListener("wheel", function (e) {
        e.preventDefault();

        let zoomStep = 0.2;

        if (e.deltaY < 0) {
            zoomLevel += zoomStep;
        } else {
            zoomLevel -= zoomStep;
        }

        zoomLevel = Math.max(1, Math.min(zoomLevel, 5));

        applyTransform();
    }, { passive: false });

    // ================= DRAG START =================
    img.addEventListener("mousedown", (e) => {
        isDragging = true;
        startX = e.clientX - posX;
        startY = e.clientY - posY;
        img.style.cursor = "grabbing";
    });

    // ================= DRAG MOVE =================
    window.addEventListener("mousemove", (e) => {
        if (!isDragging) return;

        posX = e.clientX - startX;
        posY = e.clientY - startY;

        applyTransform();
    });

    // ================= DRAG END =================
    window.addEventListener("mouseup", () => {
        isDragging = false;
        const img = document.getElementById("modalImg");
        if (img) img.style.cursor = "grab";
    });

    // prevent click bubbling
    img.addEventListener("click", (e) => {
        e.stopPropagation();
    });
});

// ================= CLOSE =================
function closeImage() {
    document.getElementById("imgModal").style.display = "none";
}

let tradeType = "profit";

function setType(type) {
    tradeType = type;

    document.getElementById("profitBtn").classList.remove("active");
    document.getElementById("lossBtn").classList.remove("active");

    document.getElementById(type + "Btn").classList.add("active");
}
// ================= FORM =================
function openForm() {
    document.getElementById("formPopup").style.display = "block";
}

function closeForm() {
    document.getElementById("formPopup").style.display = "none";
}

document.addEventListener("click", function (e) {
    let form = document.getElementById("formPopup");

    if (e.target === form) {
        closeForm();
    }
});
document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
        closeForm();
        document.getElementById("balanceSetup").style.display = "none";
    }
});
lucide.createIcons();

function showBalancePopup() {
    document.getElementById("balanceSetup").style.display = "flex";
}

// ================= NAVIGATION =================
function goToTrades() {
    document.getElementById("dashboardView").style.display = "none";
    document.getElementById("tradesView").style.display = "block";

    loadTradesPage(1);
}

function goToDashboard() {
    document.getElementById("dashboardView").style.display = "block";
    document.getElementById("tradesView").style.display = "none";
}

// ================= PAGINATION =================
function loadTradesPage(page) {
    const perPage = 50;
    const start = (page - 1) * perPage;
    const end = start + perPage;

    let trades = window.allTrades || [];
    if (currentTab !== "trades") return;
    let table = document.getElementById("tradesTable");

    let html = "";

    trades.slice(start, end).forEach(t => {
        html += generateRow(t);
    });

    table.innerHTML = html;

    let totalPages = Math.ceil(trades.length / perPage);

    // only show pagination if > 50 trades
    if (trades.length > 50) {
        renderPagination(page, totalPages);
    } else {
        document.getElementById("pagination").innerHTML = "";
    }

    setTimeout(() => lucide.createIcons(), 0);
}

function renderPagination(current, total) {
    let container = document.getElementById("pagination");

    let html = "";

    for (let i = 1; i <= total; i++) {
        html += `
        <button onclick="loadTradesPage(${i})"
            style="margin:5px; ${i === current ? 'font-weight:bold;' : ''}">
            ${i}
        </button>`;
    }

    container.innerHTML = html;
}

// ================= TAB SWITCH =================
let currentTab = "dashboard";

function switchTab(tab) {
    currentTab = tab;

    document.querySelectorAll(".nav").forEach(btn => btn.classList.remove("active"));
    document.querySelectorAll(".nav")[tab === "dashboard" ? 0 : 1].classList.add("active");

    // VIEW SWITCH
    if (tab === "dashboard") {
        document.getElementById("dashboardView").style.display = "block";
        document.getElementById("tradesView").style.display = "none";
    } else {
        document.getElementById("dashboardView").style.display = "none";
        document.getElementById("tradesView").style.display = "block";
    }

    let uid = auth.currentUser.uid;
    loadData(uid);
}

document.getElementById("imgModal").addEventListener("click", function (e) {
    if (e.target === this) {
        closeImage();
    }
});

// ================= SAAS LOADER CONTROL =================
let loaderShown = false;

// ================= SAAS LOADER CONTROL =================
function showLoader() {
    loaderShown = true;
    const loader = document.getElementById("saasLoader");
    if (loader) {
        loader.style.display = "flex";
        loader.style.opacity = "1";
    }
}

function hideLoader() {
    loaderShown = false;
    const loader = document.getElementById("saasLoader");
    if (!loader) return;

    loader.style.opacity = "0";

    setTimeout(() => {
        loader.style.display = "none";
    }, 300);
}

setInterval(() => {
    if (loaderShown && document.getElementById("dashboardView").style.display === "block") {
        // safety fallback
        hideLoader();
    }
}, 5000);