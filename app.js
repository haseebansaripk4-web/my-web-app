/* =========================================================
   GLOBAL STATE VARIABLES (App Data & UI State Management)
   ========================================================= */
import { db } from "./firebaseConfig.js";
import {
    collection,
    addDoc,
    deleteDoc,
    updateDoc,
    doc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let trades = [];
let unsubscribeTrades = null;
let strategies = [];
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();
let renderTimeout;
let editingStrategyIndex = null;
let deleteIndex = null;
let editingTradeIndex = null;
let currentFilter = "all";
let visibleTrades = 20; // how many trades show
let chartMode = "equity";
let loadStep = 20; // load more step
let chartZoom = 1;
let winChartInstance = null;
let pfChartInstance = null;
let isListeningStarted = false;
let chartOffset = 0;
const MIN_ZOOM = 1;
const MAX_ZOOM = 5;


window.loadTrades = function () {

    if (!window.currentUser) return;

    const userId = window.currentUser.uid;

    if (unsubscribeTrades) {
        unsubscribeTrades();
        unsubscribeTrades = null;
    }



    const ref = query(
        collection(db, "users", userId, "trades"),
        orderBy("date", "asc") // 🔥 CHANGE THIS
    );

    unsubscribeTrades = onSnapshot(ref, (snapshot) => {
        trades = [];

        snapshot.forEach(doc => {
            trades.push({ id: doc.id, ...doc.data() });
        });
        smartRender();
    });
}
/* ---------------------------------------------------------
   This function is used to switch between app screens
   and update active navigation state
--------------------------------------------------------- */
function show(id, el) {

    document.querySelectorAll('.view').forEach(v => {
        v.classList.remove('active');
    });

    setTimeout(() => {
        document.getElementById(id).classList.add('active');
    }, 50);

    // nav active
    document.querySelectorAll('.nav-item')
        .forEach(b => b.classList.remove('active'));

    if (el) el.classList.add('active');

    render();
    setTimeout(() => lucide.createIcons(), 50);

}
window.show = show;
/* =========================================================
   FILTER & TRADE TYPE CONTROLS
   Handles filtering trades (profit/loss/date)
   ========================================================= */

/* Set custom date range filter */

function setRangeFilter() {
    currentFilter = "range";
    render();
}

/* Toggle trade type (profit / loss button UI + value) */

function setTradeType(val) {
    document.getElementById('type').value = val;

    let profitBtn = document.getElementById('profitBtn');
    let lossBtn = document.getElementById('lossBtn');

    profitBtn.classList.remove('trade-active');
    lossBtn.classList.remove('trade-active');

    if (val === 'profit') {
        profitBtn.classList.add('trade-active');
    } else {
        lossBtn.classList.add('trade-active');
    }
}

/* Filter trades based on selected filter (today/week/month/range) */

function getFilteredTrades() {
    let now = new Date();

    return trades.filter(t => {

        let tradeDate = t.date ? new Date(t.date.replace(" ", "T")) : null;
        if (!tradeDate || isNaN(tradeDate)) return false;

        if (currentFilter === "all") return true;

        if (currentFilter === "profit") return t.type === "profit";

        if (currentFilter === "loss") return t.type === "loss";

        if (currentFilter === "today") {
            return tradeDate.toDateString() === now.toDateString();
        }

        if (currentFilter === "week") {
            let weekAgo = new Date();
            weekAgo.setDate(now.getDate() - 7);
            return tradeDate >= weekAgo;
        }

        if (currentFilter === "month") {
            return tradeDate.getMonth() === now.getMonth() &&
                tradeDate.getFullYear() === now.getFullYear();
        }

        if (currentFilter === "range") {
            let from = document.getElementById("fromDate").value;
            let to = document.getElementById("toDate").value;

            if (!from && !to) return true;

            let fromDate = from ? new Date(from + "T00:00:00") : null;
            let toDate = to ? new Date(to + "T23:59:59") : null;

            if (fromDate && tradeDate < fromDate) return false;
            if (toDate && tradeDate > toDate) return false;

            return true;
        }

        return true;
    });
}
function clearFilter() {
    currentFilter = "all";
    visibleTrades = 20;

    // reset date inputs
    document.getElementById("fromDate").value = "";
    document.getElementById("toDate").value = "";

    // reset active pill UI
    document.querySelectorAll(".filter-pill")
        .forEach(b => b.classList.remove("active"));

    // activate ONLY "All" button properly
    document.querySelectorAll(".filter-pill").forEach(btn => {
        if (btn.textContent.trim() === "All") {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    smartRender();
}
function animateNumberSafeUI(el, target, isFloat = false, duration = 800) {
    if (!el) return;

    target = Number(target) || 0;

    let start = 0;
    let startTime = null;

    function animate(t) {
        if (!startTime) startTime = t;

        let progress = Math.min((t - startTime) / duration, 1);
        let value = start + (target - start) * progress;

        el.innerText = isFloat
            ? value.toFixed(2)
            : Math.floor(value);

        if (progress < 1) requestAnimationFrame(animate);
    }

    requestAnimationFrame(animate);
}
/* =========================================================
   MAIN RENDER ENGINE (CORE UI UPDATE)
   This function updates:
   - Stats (profit/loss/net)
   - Trade list
   - Strategy dropdown
   - Chart
   ========================================================= */

function render() {
    let p = 0, l = 0;

    trades.forEach(t => {
        if (t.type === 'profit') {
            p += +t.amt;
        } else {
            l += +t.amt;
        }
    });

    let net = p - l;


    let list = document.getElementById('list');
    list.innerHTML = '';

    let fragment = document.createDocumentFragment();
    let filtered = getFilteredTrades();
    // newest first
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    // limit trades
    let displayTrades = filtered.slice(0, visibleTrades);

    if (displayTrades.length === 0) {
        list.innerHTML = `<div style="text-align:center;color:#aaa;padding:20px;">No trades yet</div>`;
        return;
    }

    let lastDate = "";

    displayTrades.forEach((t) => {

        let realIndex = trades.findIndex(x => x.id === t.id);

        let tradeDate = new Date(t.date);
        let today = new Date();

        let label = "";

        if (tradeDate.toDateString() === today.toDateString()) {
            label = "Today";
        } else {
            let y = new Date();
            y.setDate(today.getDate() - 1);

            if (tradeDate.toDateString() === y.toDateString()) {
                label = "Yesterday";
            } else {
                label = tradeDate.toLocaleDateString();
            }
        }

        // 🔥 DATE HEADING (sirf ek dafa show hota hai)
        if (label !== lastDate) {
            let div = document.createElement("div");
            div.innerHTML = `
      <div style="padding:8px;color:#F3BA2F;font-size:12px;">
        ${label}
      </div>
    `;
            fragment.appendChild(div);
            lastDate = label;
        }

        // 🔥 TRADE CARD
        let div = document.createElement("div");
        div.innerHTML = `
<div class="swipe-wrapper">

  <div class="swipe-actions">
    <div class="swipe-btn edit-btn" onclick="editTrade('${t.id}')">
      <span class="icon-btn">✏️</span>
    </div>

    <div class="swipe-btn delete-btn" onclick="deleteTrade(${realIndex})">
      <span class="icon-btn">🗑️</span>
    </div>
  </div>

  <div class="swipe-content"
    ontouchstart="startSwipe(event,this)"
    ontouchmove="moveSwipe(event,this)">
    
    <div class="history-card">
      
      <div>
        <div style="font-weight:600;">${t.coin}</div>
        <div style="font-size:10px;color:#aaa;">
          ${new Date(t.date).toLocaleTimeString()}
        </div>
      </div>

      <div class="${t.type === 'profit' ? 'green' : 'red'}">
        $${t.amt}
      </div>
      <button onclick="openTradeDetails(${realIndex})" style="
  background:rgba(255,255,255,0.05);
  border:none;
  color:#fff;
  padding:6px 10px;
  border-radius:8px;
  font-size:12px;
  margin-top:6px;
  cursor:pointer;
">
  +
</button>

    </div>

  </div>

</div>
`;
        fragment.appendChild(div);
    });

    if (filtered.length > visibleTrades) {
        let div = document.createElement("div");
        div.innerHTML = `
    <button onclick="loadMoreTrades()" class="btn">
      Load More
    </button>
  `;
        fragment.appendChild(div);
    }
    // ✅ FINAL APPEND (MISSING LINE - FIX)
    list.appendChild(fragment);
    let s = document.getElementById('strategy');

    if (s) {
        s.innerHTML = `<option value="">Select Strategy</option>` +
            strategies.map(x => `<option value="${x.name}">${x.name}</option>`).join('');
    }
    updateChecks();
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            safeChartRender();
        });
    });
    // ✅ restore active chart button
    document.querySelectorAll('.chart-card .filter-btn')
        .forEach(b => b.classList.remove('active'));

    let btns = document.querySelectorAll('.chart-card .filter-btn');

    if (chartMode === "equity") btns[0].classList.add('active');
    if (chartMode === "bar") btns[1].classList.add('active');
    if (chartMode === "calendar") btns[2].classList.add('active');
    if (chartMode === "calendar") {
        renderCalendar();
    } else {
        document.getElementById("chart").style.display = "block";
        document.getElementById("calendarView").classList.add("hidden");
    }
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            lucide.createIcons();
        });
    });
    // ===== NEW UI UPDATE =====
    let tradesEl = document.getElementById("totalTradesUI");
    if (tradesEl) animateNumberSafeUI(tradesEl, trades.length);

    let profitEl = document.getElementById("totalProfitUI");
    if (profitEl) animateNumberSafeUI(profitEl, p, true);

    let lossEl = document.getElementById("totalLossUI");
    if (lossEl) animateNumberSafeUI(lossEl, l, true);

    let netUIEl = document.getElementById("netUI");
    if (netUIEl) animateNumberSafeUI(netUIEl, net, true);

    if (netUIEl) {

        // reset classes
        netUIEl.classList.remove("green", "red");

        // apply correct color (IMPORTANT)
        if (net > 0) {
            netUIEl.classList.add("green");
        } else if (net < 0) {
            netUIEl.classList.add("red");
        }
    }

    setTimeout(() => {

        if (profitEl) profitEl.innerText = "$" + Number(p).toFixed(2);
        if (lossEl) lossEl.innerText = "$" + Number(l).toFixed(2);
        if (netUIEl) netUIEl.innerText = "$" + Number(net).toFixed(2);

    }, 850);
    // ===== MONTHLY COMPARISON =====

    let now = new Date();

    // current month
    let currentMonth = trades.filter(t => {
        let d = new Date(t.date);
        return d.getMonth() === now.getMonth() &&
            d.getFullYear() === now.getFullYear();
    });

    // last month
    let lastMonthDate = new Date();
    lastMonthDate.setMonth(now.getMonth() - 1);

    let lastMonth = trades.filter(t => {
        let d = new Date(t.date);
        return d.getMonth() === lastMonthDate.getMonth() &&
            d.getFullYear() === lastMonthDate.getFullYear();
    });

    // ===== CALCULATIONS =====

    function calcStats(arr) {
        let p = 0, l = 0;

        arr.forEach(t => {
            if (t.type === "profit") p += +t.amt;
            else l += +t.amt;
        });

        return {
            trades: arr.length,
            profit: p,
            loss: l,
            net: p - l
        };
    }

    let cur = calcStats(currentMonth);
    let prev = calcStats(lastMonth);

    // ===== PERCENT CHANGE =====

    function percentChange(current, previous) {
        if (previous === 0) {
            if (current === 0) return 0;
            return 100; // ya "∞" bhi kar sakte ho UI mein
        }
        return ((current - previous) / Math.abs(previous)) * 100;
    }


    // ===== UPDATE UI =====

    function setChange(id, value) {

        let el = document.getElementById(id);
        if (!el) return;

        let numEl = el.querySelector(".num");
        let labelEl = el.querySelector(".label");

        let icon = "";
        let absValue = Math.abs(value);

        if (value > 0) {
            icon = "↑";
            numEl.classList.remove("red");
            numEl.classList.add("green");
            numEl.innerText = `${icon} ${absValue.toFixed(1)}%`;
        }
        else if (value < 0) {
            icon = "↓";
            numEl.classList.remove("green");
            numEl.classList.add("red");
            numEl.innerText = `${icon} ${absValue.toFixed(1)}%`;
        }
        else {
            numEl.classList.remove("green", "red");
            numEl.innerText = `0%`;
        }

        // always gray label
        labelEl.innerText = " vs last month";
    }


    // APPLY
    setChange("tradesChange", percentChange(cur.trades, prev.trades));
    setChange("profitChange", percentChange(cur.profit, prev.profit));
    setChange("lossChange", percentChange(cur.loss, prev.loss));
    setChange("netChange", percentChange(cur.net, prev.net));

    function animateValue(el, start, end, duration = 600) {
        let startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;

            let progress = Math.min((timestamp - startTime) / duration, 1);

            el.innerText = Math.floor(progress * (end - start) + start);

            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }

        requestAnimationFrame(step);
    }

}

// ===== NUMBER ANIMATION FUNCTION =====
function animateValue(el, start, end, duration = 800, isCurrency = false) {

    if (!el) return;

    let startTime = null;

    function step(timestamp) {

        if (!startTime) startTime = timestamp;

        let progress = Math.min((timestamp - startTime) / duration, 1);

        let value = start + (end - start) * progress;

        if (isCurrency) {
            el.innerText = "$" + value.toFixed(2);
        } else {
            el.innerText = Math.floor(value);
        }

        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}

/* Debounced render to improve performance */

function smartRender() {
    clearTimeout(renderTimeout);
    renderTimeout = setTimeout(() => {
        render();
        renderAnalytics();
    }, 50);
}


/* =========================================================
   STRATEGY CHECKLIST SYSTEM
   Handles checklist UI for selected strategy
   ========================================================= */

/* Render checklist items for selected strategy */

function updateChecks() {
    let selected = document.getElementById('strategy').value;

    let c = document.getElementById('checks');
    c.innerHTML = '';

    // ❌ agar koi strategy select nahi
    if (!selected) return;

    let st = strategies.find(s => s.name === selected);
    if (!st) return;

    st.items.forEach(item => {
        c.innerHTML += `
      <div class="check-item">
        <span>${item}</span>
        <div class="check-toggle" onclick="toggleCheck(this)"></div>
      </div>
    `;
    });
}

/* Apply saved checklist selections (used in edit mode) */

function applyChecklistSelections(checksArray) {
    const maxRetry = 10;
    let attempt = 0;

    function tryApply() {
        const items = document.querySelectorAll('.check-toggle');

        // agar checklist abhi render nahi hui → retry
        if (items.length === 0 && attempt < maxRetry) {
            attempt++;
            setTimeout(tryApply, 50);
            return;
        }

        items.forEach(el => {
            let text = el.parentElement.querySelector('span').innerText;
            if (checksArray?.includes(text)) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    }

    tryApply();
}

/* Handle filter button clicks (UI + logic) */

function setFilter(type, el) {
    currentFilter = type;
    visibleTrades = 20;

    document.querySelectorAll('.filter-pill')
        .forEach(b => b.classList.remove('active'));

    el.classList.add('active');

    smartRender();
}


/* =========================================================
   SAVE TRADE FUNCTION (MAIN LOGIC)
   - Validates input
   - Adds or updates trade
   - Saves to localStorage
   - Triggers UI update
   ========================================================= */

function save() {
    document.querySelector("#add .btn").innerText = "Saving...";

    let coinEl = document.getElementById('coin');
    let entryEl = document.getElementById('entry');
    let levEl = document.getElementById('lev');
    let amtEl = document.getElementById('amt');
    let dateEl = document.getElementById('date');
    if (!dateEl.value) {
        dateEl.value = new Date().toISOString().slice(0, 16);
    }
    let typeEl = document.getElementById('type');
    let strategyEl = document.getElementById('strategy');
    // ✅ VALIDATION
    if (!coinEl.value || !amtEl.value || !dateEl.value) {
        showToast("Please fill required fields", "error");
        return;
    }
    // ✅ AMOUNT SHOULD BE > 0
    if (+amtEl.value <= 0) {
        showToast("Amount must be greater than 0", "error");
        return;
    }
    let selectedChecks = [...document.querySelectorAll('.check-toggle.active')]
        .map(el => el.parentElement.querySelector('span').innerText);



    let tradeData = {
        coin: coinEl.value,
        entry: entryEl.value,
        leverage: levEl.value,
        amt: Math.abs(+amtEl.value),
        type: typeEl.value,
        date: dateEl.value,
        createdAt: serverTimestamp(), // ✅ ADD THIS
        strategy: strategyEl.value,
        checks: selectedChecks,
        note: document.getElementById('note').value || ""
    };

    // ✅ EDIT MODE
    if (editingTradeIndex !== null) {

        let id = trades[editingTradeIndex].id;

        updateTradeInFirebase(id, tradeData);

        editingTradeIndex = null;

        document.querySelector("#add .btn").innerText = "Save Trade";
    }

    else {
        addTradeToFirebase(tradeData);
    }
    document.querySelector("#add .btn").innerText = "Save Trade";

    // reset form
    coinEl.value = "";
    entryEl.value = "";
    levEl.value = "";
    amtEl.value = "";
    dateEl.value = "";
    typeEl.value = "profit";
    strategyEl.value = "";
    document.getElementById('note').value = "";

    document.querySelectorAll('.check-toggle.active')
        .forEach(el => el.classList.remove('active'));

    setTradeType("profit");

    smartRender();


}
window.save = save;
async function addTradeToFirebase(tradeData) {

    if (!window.currentUser) {
        showToast("Login required", "error");
        return;
    }

    try {
        await addDoc(
            collection(db, "users", currentUser.uid, "trades"),
            tradeData
        );

        showToast("Trade Saved ✔");

    } catch (err) {
        console.error(err);
        showToast("Error saving trade", "error");
    }
}
async function updateTradeInFirebase(id, tradeData) {

    if (!window.currentUser) {
        showToast("Login required", "error");
        return;
    }

    try {
        await updateDoc(
            doc(db, "users", currentUser.uid, "trades", id),
            tradeData
        );
    } catch (err) {
        console.error(err);
        showToast("Update failed", "error");
    }
}
/* Calculate running balance (equity curve) */

function getEquityData() {
    let balance = 0;
    let equity = [];

    trades.forEach(t => {
        let amt = +t.amt || 0;

        if (t.type === 'profit') {
            balance += amt;
        } else {
            balance -= amt;
        }

        equity.push(balance);
    });

    return equity;
}

/* =========================================================
   CHART SYSTEM (Chart.js)
   Handles equity chart, bar chart, zoom & pan
   ========================================================= */

let myChart;

/* Ensure chart renders only when canvas is visible */

function safeChartRender(retry = 0) {
    const canvas = document.getElementById("chart");

    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    // ❌ agar canvas visible nahi (width/height 0)
    if ((rect.width === 0 || rect.height === 0) && retry < 5) {
        setTimeout(() => safeChartRender(retry + 1), 100);
        return;
    }

    // ✅ ensure height fix (IMPORTANT)
    canvas.style.height = "260px";

    chart();
}

/* Main chart rendering logic (equity + bar chart) */

function chart() {

    let ctx = document.getElementById('chart');
    if (!ctx || !trades.length) return;

    if (myChart) myChart.destroy();

    // ================= DATA =================
    let equityData = getEquityData();

    let labels = trades.map((_, i) => i + 1);

    // ================= ZOOM LOGIC =================
    let baseVisible = 40; // better UX for mobile 

    let visibleCount = Math.max(
        10,
        Math.floor(baseVisible / chartZoom)
    );

    // 🔥 allow full navigation
    let maxOffset = Math.max(0, trades.length - visibleCount);

    chartOffset = Math.max(0, Math.min(chartOffset, maxOffset));

    let start = chartOffset;
    let end = chartOffset + visibleCount;

    let slicedTrades = trades.slice(start, end);
    let slicedEquity = equityData.slice(start, end);
    let slicedLabels = labels.slice(start, end);

    let canvas = ctx;
    let container = document.getElementById("chartWrapper");

    // ================= AUTO WIDTH =================
    canvas.style.width = Math.max(600, trades.length * 30) + "px"; // 🔥 full data width
    // 🔥 enable smooth scroll container
    if (container) {
        container.style.overflowX = "auto";
        container.style.scrollBehavior = "smooth";
    }

    // ================= BAR CHART =================
    if (chartMode === "bar") {

        myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: slicedLabels,
                datasets: [{
                    label: "P/L",
                    data: slicedTrades.map(t => t.amt),
                    backgroundColor: slicedTrades.map(t =>
                        t.type === 'profit' ? '#1fa16f' : '#f6465d'
                    ),
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { display: false } },
                    y: { ticks: { color: "#aaa" } }
                }
            }
        });

    }

    // ================= EQUITY CHART =================
    else {

        let gradient = ctx.getContext('2d')
            .createLinearGradient(0, 0, 0, 300);

        gradient.addColorStop(0, 'rgba(31,161,111,0.5)');
        gradient.addColorStop(1, 'rgba(31,161,111,0.0)');

        myChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: slicedLabels,
                datasets: [{
                    label: "Equity",
                    data: slicedEquity,
                    borderColor: '#1fa16f',
                    backgroundColor: gradient,
                    fill: true,
                    tension: 0.4,
                    pointRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { ticks: { display: false } },
                    y: { ticks: { color: "#aaa" } }
                }
            }
        });
    }
    // 🔥 auto scroll to latest (right side)
    setTimeout(() => {
        if (container) {
            container.scrollLeft = container.scrollWidth;
        }
    }, 50);
}

/* Switch between chart types (equity / bar / calendar) */

function setChartMode(mode, el) {
    chartMode = mode;
    firebaseHelpers.updateUserSettings?.({
        chartMode: mode
    });
    document.querySelectorAll('.chart-card .filter-btn')
        .forEach(b => b.classList.remove('active'));

    el.classList.add('active');

    if (mode === "calendar") {
        renderCalendar();   // show calendar
    }
    else {
        document.getElementById("chart").style.display = "block";
        document.getElementById("calendarView").classList.add("hidden");
        chart(); // equity/bar chart
    }
}

/* =========================================================
   STRATEGY MANAGEMENT (CREATE / EDIT / DELETE)
   ========================================================= */

function openStrategyModal() {
    document.getElementById('strategyModal').style.display = 'flex';
}

function closeStrategyModal() {
    document.getElementById('strategyModal').style.display = 'none';

    document.getElementById('newStrategyName').value = "";
    document.getElementById('checklistInputs').innerHTML = "";

    editingStrategyIndex = null;
}

function addChecklistField() {
    let container = document.getElementById('checklistInputs');

    let input = document.createElement('input');
    input.className = 'input checklist-field';
    input.placeholder = 'Checklist item';

    container.appendChild(input);
}

async function saveStrategy(e) {
    if (e) e.preventDefault(); // 🔥 IMPORTANT FIX

    let name = document.getElementById('newStrategyName').value.trim();
    let items = [...document.querySelectorAll('.checklist-field')]
        .map(i => i.value)
        .filter(v => v.trim() !== '');

    if (!name) {
        showToast("Enter strategy name", "error");
        return;
    }

    let newData = { name, items };

    try {

        // ✅ EDIT MODE
        if (editingStrategyIndex !== null) {

            let id = strategies[editingStrategyIndex].id;

            await firebaseHelpers.updateStrategy(id, newData);

            editingStrategyIndex = null;

            showToast("Strategy Updated ✔");

        } else {

            await firebaseHelpers.addStrategy(newData);

            showToast("Strategy Saved ✔");
        }

        closeStrategyModal();

        document.getElementById('newStrategyName').value = "";
        document.getElementById('checklistInputs').innerHTML = "";

        // force dropdown + UI refresh after Firebase write
        setTimeout(() => {
            if (typeof startStrategyListener === "function") {
                startStrategyListener();
            }
        }, 300);

    } catch (err) {
        console.error("Strategy Save Error:", err);
        showToast("Failed to save strategy", "error");
    }
}

function toggleCheck(el) {
    el.classList.toggle('active');
}

/* =========================================================
   SWIPE GESTURE SYSTEM (Mobile UX)
   Handles swipe-to-edit & swipe-to-delete
   ========================================================= */

let activeSwipe = null;

let currentTranslate = 0;
let currentElement = null;

function startSwipe(e, el) {
    startX = e.touches[0].clientX;
    currentElement = el;

    // close previous open swipe
    document.querySelectorAll('.swipe-content').forEach(item => {
        if (item !== el) item.style.transform = 'translateX(0px)';
    });
}

function moveSwipe(e, el) {
    let moveX = e.touches[0].clientX;
    let diff = startX - moveX;

    if (diff > 0) {
        let move = Math.min(diff, 140); // max swipe
        el.style.transform = `translateX(-${move}px)`;
        document.body.style.overflow = "hidden";


    }
}

function endSwipe() {
    document.querySelectorAll('.swipe-content').forEach(el => {
        let style = window.getComputedStyle(el);
        let matrix = new WebKitCSSMatrix(style.transform);
        let currentX = matrix.m41;

        let wrapper = el.closest('.swipe-wrapper');

        if (currentX < -70) {
            el.style.transform = 'translateX(-120px)';
            wrapper.classList.add('open');   // ✅ ADD THIS
        } else {
            el.style.transform = 'translateX(0px)';
            wrapper.classList.remove('open'); // ✅ ADD THIS
        }
    });
}
document.body.style.overflow = "";

function animateNumber(el, endValue, isMoney = false, duration = 800) {
    if (!el) return;

    let start = 0;
    let startTime = null;

    function step(timestamp) {
        if (!startTime) startTime = timestamp;

        let progress = Math.min((timestamp - startTime) / duration, 1);

        let value = start + (endValue - start) * progress;

        if (isMoney) {
            el.innerText = "$" + value.toFixed(2);
        } else {
            el.innerText = value.toFixed(2);
        }

        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }

    requestAnimationFrame(step);
}
/* =========================================================
   ANALYTICS SYSTEM (Performance Metrics)
   ========================================================= */

/* Calculate strategy performance score */

function calculateStrategyScore(winRate, sp, totalTrades) {

    // Win rate (0 - 100)
    let w = winRate;

    // SP% (-100 to +100)
    let s = sp;

    // Consistency bonus (max 100)
    let consistency = Math.min(totalTrades, 50) / 50 * 100;

    // FINAL SCORE (professional weighted model)
    return (w * 0.4) + (s * 0.4) + (consistency * 0.2);
}
function animateNumberSafe(el, target, isFloat = false, duration = 800) {
    if (!el) return;

    let start = 0;
    let startTime = null;

    target = Number(target) || 0;

    function animate(time) {
        if (!startTime) startTime = time;

        let progress = Math.min((time - startTime) / duration, 1);
        let value = start + (target - start) * progress;

        el.innerText = isFloat
            ? value.toFixed(2)
            : Math.floor(value);

        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }

    requestAnimationFrame(animate);
}
/* Render trading analytics (win rate, RR, expectancy, strategy ranking) */

function renderAnalytics() {

    let totalTrades = trades.length;

    let wins = 0;
    let losses = 0;

    let totalProfit = 0;
    let totalLoss = 0;

    trades.forEach(t => {
        let amt = +t.amt || 0;

        if (t.type === "profit") {
            wins++;
            totalProfit += amt;
        } else {
            losses++;
            totalLoss += amt;
        }
    });

    // ---------------- BASIC ----------------
    let winRate = totalTrades ? ((wins / totalTrades) * 100) : 0;
    let lossRate = totalTrades ? ((losses / totalTrades) * 100) / 100 : 0;

    const winRateEl = document.getElementById("winRate");
    if (winRateEl) winRateEl.innerText = winRate.toFixed(1) + "%";


    let rr = totalLoss ? (totalProfit / totalLoss) : 0;
    document.getElementById("rrRatio").innerText = rr.toFixed(2);

    // ================= NEW METRICS =================

    // AVG WIN
    let avgWin = wins ? (totalProfit / wins) : 0;

    // AVG LOSS
    let avgLoss = losses ? (totalLoss / losses) : 0;

    // EXPECTANCY
    let expectancy =
        ((wins / (totalTrades || 1)) * avgWin) -
        ((losses / (totalTrades || 1)) * avgLoss);

    // ROUND
    avgWin = avgWin.toFixed(2);
    avgLoss = avgLoss.toFixed(2);

    expectancy = Number(expectancy.toFixed(2));


    // UPDATE UI
    const rrEl = document.getElementById("rrRatio");
    if (rrEl) animateNumber(rrEl, rr);

    const winEl = document.getElementById("avgWin");
    if (winEl) animateNumber(winEl, avgWin, true);

    const lossEl = document.getElementById("avgLoss");
    if (lossEl) animateNumber(lossEl, avgLoss, true);
    // ===== PROGRESS BAR LOGIC =====

    let maxValue = Math.max(
        Math.abs(avgWin),
        Math.abs(avgLoss),
        rr
    );

    // avoid divide by zero
    if (maxValue === 0) maxValue = 1;

    let rrPercent = Math.min((rr / maxValue) * 100, 100);
    let winPercent = Math.min((avgWin / maxValue) * 100, 100);
    let lossPercent = Math.min((avgLoss / maxValue) * 100, 100);

    // update bars
    let rrBar = document.getElementById("rrBar");
    let winBar = document.getElementById("winBar");
    let lossBar = document.getElementById("lossBar");

    if (rrBar) rrBar.style.width = rrPercent + "%";
    if (winBar) winBar.style.width = winPercent + "%";
    if (lossBar) lossBar.style.width = lossPercent + "%";

    // COLOR LOGIC
    if (winEl) winEl.className = "stat-value green";
    if (lossEl) lossEl.className = "stat-value red";

    let expEl = document.getElementById("expectancy");
    if (expEl) {
        expEl.className = expectancy >= 0 ? "green" : "red";
    }

    // ---------------- STRATEGY ANALYTICS ----------------
    let map = {};

    trades.forEach(t => {
        if (!t.strategy) return;

        if (!map[t.strategy]) {
            map[t.strategy] = { wins: 0, losses: 0 };
        }

        if (t.type === "profit") {
            map[t.strategy].wins++;
        } else {
            map[t.strategy].losses++;
        }
    });

    let ranked = [];
    let html = "";

    // 1. build ranking
    Object.keys(map).forEach(name => {

        let s = map[name];
        let total = s.wins + s.losses;

        let winRate = total ? (s.wins / total) * 100 : 0;

        let profit = 0;
        let loss = 0;

        trades.forEach(t => {
            if (t.strategy !== name) return;

            if (t.type === "profit") profit += +t.amt;
            else loss += +t.amt;
        });

        let sp = (total > 0)
            ? ((profit - loss) / (total * Math.max((profit + loss) / total, 1))) * 100
            : 0;

        let score = calculateStrategyScore(winRate, sp, total);

        ranked.push({
            name,
            score,
            winRate,
            sp,
            total,
            wins: s.wins,
            losses: s.losses
        });
    });

    // 2. sort ranking
    ranked.sort((a, b) => {

        if (b.score === a.score) {
            if (b.winRate !== a.winRate) return b.winRate - a.winRate;
            return b.total - a.total;
        }

        return b.score - a.score;
    });
    let bestStrategy = ranked.length ? ranked[0] : null;

    // SAFE CALL (NO BREAK)
    renderBestStrategyCard(bestStrategy, trades);
    // 4. RENDER UI
    ranked.forEach(r => {

        html += `
<div style="
  background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 12px;
">

  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
    <div style="font-size:14px;font-weight:600;">
      ${r.name}
    </div>

    <div style="font-size:11px;padding:4px 8px;border-radius:20px;background:rgba(243,186,47,0.1);color:#F3BA2F;">
      ${r.sp.toFixed(1)}% S.P
    </div>
  </div>

  <div style="
    height:8px;
    background:rgba(255,255,255,0.05);
    border-radius:10px;
    overflow:hidden;
    margin-bottom:12px;
  ">
    <div style="
      width:${r.winRate}%;
      height:100%;
      background:linear-gradient(90deg,#1fa16f,#3ddc97);
      border-radius: 10px;
    "></div>
  </div>

  <div style="display:flex;gap:8px;">
    <div style="flex:1;text-align:center;">
      <div style="color:#1fa16f;font-size:11px;">Wins</div>
      <div class="anim-win" data-value="${r.wins}">0</div>
    </div>

    <div style="flex:1;text-align:center;">
      <div style="color:#f6465d;font-size:11px;">Loss</div>
      <div class="anim-loss" data-value="${r.losses}">0</div>
    </div>

    <div style="flex:1;text-align:center;">
      <div style="color:#F3BA2F;font-size:11px;">Win %</div>
      <div class="anim-winrate" data-value="${r.winRate}">0%</div>
    </div>
  </div>

</div>
`;
    });

    document.getElementById("strategyStats").innerHTML = html;

    // STRATEGY COUNTING ANIMATION
    observeAndAnimate(".anim-win", (el) => {
        animateNumberSafe(el, el.dataset.value);
    });

    observeAndAnimate(".anim-loss", (el) => {
        animateNumberSafe(el, el.dataset.value);
    });

    observeAndAnimate(".anim-winrate", (el) => {
        animateNumberSafe(el, el.dataset.value, true);
    });

    updateCircleWidgets(winRate, expectancy, wins, losses, totalTrades);

    // WIN RATE CIRCLE


    // PROFIT FACTOR
    let pf = totalLoss ? (totalProfit / totalLoss) : 0;


}

// GLOBAL TOUCH END
document.addEventListener('touchend', endSwipe);

/* =========================================================
   TRADE ACTIONS (EDIT / DELETE)
   ========================================================= */

let pendingDeleteIndex = null;

function deleteTrade(index) {
    pendingDeleteIndex = index;
    document.getElementById("dangerModal").style.display = "flex";
}

async function deleteTradeFromFirebase(id) {

    if (!window.currentUser) return;

    try {
        await deleteDoc(
            doc(db, "users", currentUser.uid, "trades", id)
        );
    } catch (err) {
        console.error(err);
        showToast("Delete failed", "error");
    }
}
function editTrade(id) {
    let index = trades.findIndex(t => t.id === id);
    let t = trades[index];
    editingTradeIndex = index;

    show('add');

    requestAnimationFrame(() => {

        document.getElementById('coin').value = t.coin || "";
        document.getElementById('entry').value = t.entry || "";
        document.getElementById('lev').value = t.leverage || "";
        document.getElementById('amt').value = t.amt || "";

        if (t.date) {
            let d = new Date(t.date);
            d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
            document.getElementById('date').value = d.toISOString().slice(0, 16);
        }
        // FIXED ORDER


        setTimeout(() => {
            document.getElementById('strategy').value = t.strategy || "";
            updateChecks();

            // 🔥 FIXED APPLY
            applyChecklistSelections(t.checks);

            setTradeType(t.type);

        }, 50);

        document.querySelector("#add .btn").innerText = "Update Trade";
        document.getElementById("cancelBtn").style.display = "block";
    });
}


/* =========================================================
   UI / UX HELPERS
   ========================================================= */

function handleKeyboard() {
    const nav = document.querySelector('.bottom-nav');

    window.visualViewport.addEventListener('resize', () => {
        const heightDiff = window.innerHeight - window.visualViewport.height;

        if (heightDiff > 150) {
            // keyboard open
            nav.style.display = "none";
        } else {
            // keyboard close
            nav.style.display = "flex";
        }
    });
}
function toggleSettingsMenu() {
    let menu = document.getElementById('settingsMenu');
    let bg = document.getElementById('settingsBackdrop');

    if (menu.style.bottom === "0px") {
        menu.style.bottom = "-100%";
        bg.style.display = "none";
    } else {
        menu.style.bottom = "0px";
        bg.style.display = "block";

        // 🔥 refresh icons
        setTimeout(() => lucide.createIcons(), 50);
    }
}

/* Reset all app data (trades + strategies) */

function closeResetModal() {
    document.getElementById("resetModal").classList.add("hidden");
    hideOverlay();
}
function resetAllData() {
    closeSettingsMenu();
    showOverlay();
    document.getElementById("resetModal").classList.remove("hidden");
}

function confirmReset() {

    // hide modal first
    closeResetModal();

    trades = [];
    strategies = [];

    // Firebase clear (important)
    firebaseHelpers.clearAllData();

    document.getElementById("list").innerHTML = "";
    document.getElementById("strategyStats").innerHTML = "";

    // SAFE chart reset
    const chartEl = document.getElementById("chart");
    if (chartEl) chartEl.remove();

    const canvas = document.createElement("canvas");
    canvas.id = "chart";
    document.querySelector(".chart-card").appendChild(canvas);

    toggleSettingsMenu();
    smartRender();
}

/* Strategy Manager UI (list, edit, delete strategies) */

function openStrategyManager() {
    closeSettingsMenu(); // ✅ ADD THIS
    showOverlay();
    document.getElementById('strategyManager').style.display = 'block';
    renderStrategyManager();
}
function renderStrategyManager() {
    let box = document.getElementById('strategyList');
    box.innerHTML = "";

    strategies.forEach((s, i) => {
        box.innerHTML += `
      <div style="
        padding:10px;
        border-radius:10px;
        background:rgba(255,255,255,0.04);
        margin-bottom:8px;
        display:flex;
        justify-content:space-between;
        align-items:center;
      ">
        <span>${s.name}</span>

        <div style="display:flex;gap:8px;">
          
          <button onclick="editStrategy(${i})" style="
            background:#F3BA2F;
            border:none;
            color:#111;
            padding:6px 10px;
            border-radius:8px;
            font-weight:600;
          ">Edit</button>

          <button onclick="deleteStrategy(${i})" style="
            background:#f6465d;
            border:none;
            color:#fff;
            padding:6px 10px;
            border-radius:8px;
          ">Del</button>

        </div>
      </div>
    `;
    });
}
function editStrategy(i) {
    closeStrategyManager();
    closeSettingsMenu(); // ✅ ADD THIS
    editingStrategyIndex = i;

    let s = strategies[i];

    document.getElementById('strategyModal').style.display = 'flex';

    // fill old data
    document.getElementById('newStrategyName').value = s.name;

    let container = document.getElementById('checklistInputs');
    container.innerHTML = "";

    s.items.forEach(item => {
        let input = document.createElement('input');
        input.className = 'input checklist-field';
        input.value = item;
        container.appendChild(input);
    });
}
function deleteStrategy(i) {
    closeStrategyManager();
    closeSettingsMenu(); // ✅ ADD THIS
    deleteIndex = i;
    showOverlay();
    document.getElementById("deleteModal").classList.remove("hidden");
}
function closeDeleteModal() {
    document.getElementById("deleteModal").classList.add("hidden");
    deleteIndex = null;
    hideOverlay();

}
document.getElementById("overlay").addEventListener("click", () => {

    closeResetModal();
    closeDeleteModal();
    closeStrategyManager();

    document.getElementById('strategyModal').style.display = 'none';

});
function confirmDelete() {
    if (deleteIndex === null) return;

    let id = strategies[deleteIndex].id;

    // Firebase delete
    firebaseHelpers.deleteStrategy(id);

    closeDeleteModal();
}
function closeStrategyManager() {
    document.getElementById('strategyManager').style.display = 'none';
    hideOverlay();
}

/* Cancel trade editing and reset form */

function cancelEdit() {
    editingTradeIndex = null;

    document.querySelector("#add .btn").innerText = "Save Trade";
    document.getElementById("cancelBtn").style.display = "none";

    // reset inputs
    document.getElementById('coin').value = "";
    document.getElementById('entry').value = "";
    document.getElementById('lev').value = "";
    document.getElementById('amt').value = "";
    document.getElementById('date').value = "";
    document.getElementById('strategy').value = "";

    // reset type
    setTradeType("profit");

    // reset checklist UI properly
    document.getElementById('checks').innerHTML = "";

    // IMPORTANT: clear active checkmarks
    document.querySelectorAll('.check-toggle').forEach(el => {
        el.classList.remove('active');
    });

    // refresh UI
    updateChecks();
}

/* =========================================================
   PULL TO REFRESH (Mobile UX Feature)
   ========================================================= */

let startY = 0;
let isPulling = false;
let threshold = 80;

const app = document.querySelector(".app");
const pull = document.getElementById("pullRefresh");
const text = document.getElementById("pullText");

app.addEventListener("touchstart", (e) => {

    // ✅ ONLY allow when scroll is at TOP
    if (app.scrollTop <= 2) {
        startY = e.touches[0].clientY;
        isPulling = true;
    } else {
        isPulling = false;
    }

});

app.addEventListener("touchmove", (e) => {

    // ❌ stop if not pulling OR not at top
    if (!isPulling || app.scrollTop > 0) return;

    let currentY = e.touches[0].clientY;
    let diff = currentY - startY;

    // only downward pull
    if (diff > 0) {
        e.preventDefault();

        // smooth movement
        let move = Math.min(diff, 120);
        pull.style.transform = `translateY(${move - 100}px)`;

        if (diff > threshold) {
            pull.classList.add("active");
            text.innerText = "Release to refresh";
        } else {
            pull.classList.remove("active");
            text.innerText = "Pull to refresh";
        }
    }

});

app.addEventListener("touchend", () => {

    if (!isPulling) return;

    isPulling = false;

    if (pull.classList.contains("active")) {

        // start loading
        pull.classList.add("loading");
        text.innerText = "Refreshing...";

        setTimeout(() => {

            smartRender();

            if (!isListeningStarted && typeof startStrategyListener === "function") {
                startStrategyListener();
                isListeningStarted = true;
            }



            // success state
            pull.classList.remove("loading");
            pull.classList.add("success");
            text.innerText = "Updated ✔";

            setTimeout(() => {
                pull.classList.remove("success", "active");
                pull.style.transform = "translateY(-100%)";
                text.innerText = "Pull to refresh";
            }, 800);

        }, 600); // faster feel

    } else {
        pull.style.transform = "translateY(-100%)";
        pull.classList.remove("active");
    }

});

/* =========================================================
   CALENDAR VIEW (Monthly Performance)
   ========================================================= */

function renderCalendar() {
    document.getElementById("chart").style.display = "none";
    document.getElementById("calendarView").classList.remove("hidden");

    let cal = document.getElementById("calendarView");

    let monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    // 🔥 USE GLOBAL MONTH/YEAR (IMPORTANT FOR SWITCHING)
    let year = calendarYear;
    let month = calendarMonth;

    let firstDay = new Date(year, month, 1).getDay();
    let daysInMonth = new Date(year, month + 1, 0).getDate();

    // 🔥 HEADER (MONTH NAV)
    let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
      
      <button onclick="changeMonth(-1)" style="
        background:rgba(255,255,255,0.05);
        border:none;
        color:#fff;
        padding:6px 10px;
        border-radius:10px;
      ">◀</button>

      <div style="font-size:13px;font-weight:600;color:#F3BA2F;">
        ${monthNames[month]} ${year}
      </div>

      <button onclick="changeMonth(1)" style="
        background:rgba(255,255,255,0.05);
        border:none;
        color:#fff;
        padding:6px 10px;
        border-radius:10px;
      ">▶</button>

    </div>

    <div class="calendar">
  `;

    // EMPTY BOXES
    for (let i = 0; i < firstDay; i++) {
        html += `<div class="day empty"></div>`;
    }

    // DAYS LOOP
    for (let d = 1; d <= daysInMonth; d++) {

        let dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

        let dayTrades = trades.filter(t => {
            if (!t.date) return false;
            let tradeDate = new Date(t.date);
            return tradeDate.toISOString().slice(0, 10) === dateStr;
        });

        let profit = 0;
        let loss = 0;

        dayTrades.forEach(t => {
            if (t.type === "profit") profit += +t.amt;
            else loss += +t.amt;
        });

        let cls = "";
        if (profit > loss) cls = "profit";
        else if (loss > profit && (profit + loss) > 0) cls = "loss";

        html += `<div class="day ${cls}" onclick="openDay('${dateStr}')">${d}</div>`;
    }

    html += `</div>`;

    cal.innerHTML = html;
}

function changeMonth(dir) {
    calendarMonth += dir;

    if (calendarMonth > 11) {
        calendarMonth = 0;
        calendarYear++;
    }

    if (calendarMonth < 0) {
        calendarMonth = 11;
        calendarYear--;
    }

    renderCalendar();
}

function openDay(dateStr) {

    let dayTrades = trades.filter(t => {
        if (!t.date) return false;
        return t.date.slice(0, 10) === dateStr;
    });

    let profit = 0;
    let loss = 0;
    let wins = 0;
    let losses = 0;

    dayTrades.forEach(t => {
        let amt = +t.amt;

        if (t.type === "profit") {
            profit += amt;
            wins++;
        } else {
            loss += amt;
            losses++;
        }
    });

    let net = profit - loss;
    let winRate = (wins + losses) ? (wins / (wins + losses)) * 100 : 0;

    // DATE
    document.getElementById("popupDate").innerText =
        `📅 ${dateStr}`;

    // SUMMARY
    document.getElementById("popupSummary").innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:10px;">
      <div style="flex:1;background:rgba(31,161,111,0.1);padding:10px;border-radius:12px;text-align:center;">
        <div style="font-size:11px;color:#1fa16f;">Profit</div>
        <div style="font-weight:600;font-size:12px;">$${profit.toFixed(2)}</div>
      </div>

      <div style="flex:1;background:rgba(246,70,93,0.1);padding:10px;border-radius:12px;text-align:center;">
        <div style="font-size:11px;color:#f6465d;">Loss</div>
        <div style="font-weight:600;font-size:12px;">$${loss.toFixed(2)}</div>
      </div>

      <div style="flex:1;background:rgba(243,186,47,0.1);padding:10px;border-radius:12px;text-align:center;">
        <div style="font-size:11px;color:#F3BA2F;">Win %</div>
        <div style="font-weight:600;font-size:12px;">${winRate.toFixed(1)}%</div>
      </div>
    </div>

    <div style="text-align:center;font-weight:600;color:${net >= 0 ? '#1fa16f' : '#f6465d'}">
      Net: $${net.toFixed(2)}
    </div>
  `;

    // TRADES LIST
    let html = "";

    if (dayTrades.length === 0) {
        html = `<div style="text-align:center;color:#aaa;padding:10px;">No trades</div>`;
    }

    let previewTrades = dayTrades.slice(0, 4);

    previewTrades.forEach(t => {
        html += `
      <div style="
        background:rgba(255,255,255,0.04);
        padding:10px;
        border-radius:12px;
        margin-bottom:8px;
        display:flex;
        justify-content:space-between;
      ">
        <div>
          <div style="font-size:13px;font-weight:600;">${t.coin}</div>
          <div style="font-size:11px;color:#aaa;">${t.strategy || ''}</div>
        </div>

        <div style="color:${t.type === 'profit' ? '#1fa16f' : '#f6465d'};font-weight:600;">
          ${t.type === 'profit' ? '+' : '-'}$${t.amt}
        </div>
      </div>
    `;
    });

    let fullHtml = html;

    // if more trades exist
    if (dayTrades.length > 5) {
        fullHtml += `
    <div style="text-align:center;margin-top:10px;">
      <button class="btn" onclick="openFullDayTrades('${dateStr}')">
        View All Trades (${dayTrades.length}) ↓
      </button>
    </div>
  `;
    }

    document.getElementById("popupTrades").innerHTML = fullHtml;

    // SHOW POPUP
    document.getElementById("dayPopup").style.bottom = "0";
    document.getElementById("popupBackdrop").style.display = "block";
}

function closeDayPopup() {
    document.getElementById("dayPopup").style.bottom = "-100%";
    document.getElementById("popupBackdrop").style.display = "none";
}

/* Show toast notifications (success / error messages) */

function showToast(msg = "Saved Successfully ✔", type = "success") {

    const toast = document.getElementById("toast");
    const msgEl = document.getElementById("toastMsg");
    const iconEl = document.getElementById("toastIcon");

    // reset classes
    toast.className = "toast";

    // message
    msgEl.innerText = msg;

    // type system
    if (type === "error") {
        toast.classList.add("error");
        iconEl.innerText = "✖";
    }

    else if (type === "warning") {
        toast.classList.add("warning");
        iconEl.innerText = "⚠";
    }

    else {
        toast.classList.add("success");
        iconEl.innerText = "✔";
    }

    // show
    toast.classList.add("show");

    // restart animation (progress bar)
    const progress = toast.querySelector(".toast-progress::after");
    toast.querySelector(".toast-progress").style.animation = "none";
    void toast.offsetWidth;
    toast.querySelector(".toast-progress").style.animation = "progress 2.2s linear forwards";

    // auto hide
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2200);
}

function loadMoreTrades() {
    visibleTrades += loadStep;
    render();
}
function openFullDayTrades(dateStr) {
    let dayTrades = trades.filter(t => t.date.slice(0, 10) === dateStr);

    let container = document.getElementById("popupTrades");

    let html = `
    <div style="max-height:300px;overflow-y:auto;">
  `;

    dayTrades.forEach(t => {
        html += `
      <div style="
        background:rgba(255,255,255,0.04);
        padding:10px;
        border-radius:12px;
        margin-bottom:8px;
        display:flex;
        justify-content:space-between;
      ">
        <div>
          <div style="font-size:13px;font-weight:600;">${t.coin}</div>
          <div style="font-size:11px;color:#aaa;">${t.strategy || ''}</div>
        </div>

        <div style="color:${t.type === 'profit' ? '#1fa16f' : '#f6465d'};font-weight:600;">
          ${t.type === 'profit' ? '+' : '-'}$${t.amt}
        </div>
      </div>
    `;
    });

    html += `</div>`;

    container.innerHTML = html;
}

/* =========================================================
   TRADE DETAILS MODAL (Full trade info view)
   ========================================================= */

function openTradeDetails(index) {
    // ❌ BLOCK if user typing (keyboard open)
    if (document.body.classList.contains("typing-mode")) return;
    let t = trades[index];

    let html = `
    <div style="margin-bottom:10px;">
      <h3 style="margin:0;">${t.coin}</h3>
      <small style="color:#aaa;">${new Date(t.date).toLocaleString()}</small>
    </div>

    <div style="display:grid;gap:8px;margin-top:10px;">

      <div><b>Entry:</b> ${t.entry || '-'}</div>
      <div><b>Leverage:</b> ${t.leverage || '-'}</div>
      <div><b>Amount:</b> ${t.amt}</div>
      <div><b>Type:</b> ${t.type}</div>
      <div><b>Strategy:</b> ${t.strategy || '-'}</div>

      <div style="margin-top:10px;">
  <b>Checklist</b>
  <div style="
  margin-top:8px;
  display:flex;
  flex-direction:column;
  gap:8px;

  max-height:260px;
  overflow-y:auto;
  padding-right:6px;
" class="checklist-scroll">
    ${(function () {

            if (!t.strategy) return `<div style="color:#777;font-size:12px;">No checklist</div>`;

            let st = strategies.find(s => s.name === t.strategy);
            if (!st) return `<div style="color:#777;font-size:12px;">No checklist</div>`;

            return st.items.map(item => {

                let isChecked = t.checks?.includes(item);

                return `
      <div style="
        display:flex;
        justify-content:space-between;
        align-items:center;
        padding:8px 10px;
        border-radius:10px;
        background:${isChecked ? 'rgba(31,161,111,0.08)' : 'rgba(246,70,93,0.05)'};
        border:1px solid ${isChecked ? 'rgba(31,161,111,0.2)' : 'rgba(246,70,93,0.15)'};
      ">

        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:14px;">
            ${isChecked ? "✔️" : "❌"}
          </span>

          <span style="font-size:12px;color:${isChecked ? '#1fa16f' : '#f6465d'};">
            ${item}
          </span>
        </div>

        <span style="font-size:12px;color:#888;">
          ${isChecked ? "Done" : "Missed"}
        </span>

      </div>
    `;
            }).join("");

        })()}

      <div><b>Journal Note:</b></div>
      <div style="
        background:rgba(255,255,255,0.05);
        padding:10px;
        border-radius:10px;
        font-size:12px;
        color:#ddd;
      ">
        ${t.note ? t.note : "No note added"}
      </div>

    </div>
  `;

    document.getElementById("tradeDetailsContent").innerHTML = html;
    document.getElementById("tradeModal").style.bottom = "0";
    document.getElementById("tradeBackdrop").style.display = "block";
}

function closeTradeDetails() {
    document.getElementById("tradeModal").style.bottom = "-100%";
    document.getElementById("tradeBackdrop").style.display = "none";
}


handleKeyboard();
document.addEventListener("DOMContentLoaded", initApp);

/* =========================================================
   APP INITIALIZATION
   - Load data
   - Setup UI
   - Connect Firebase
   ========================================================= */

function initApp() {
    // ✅ AUTO DATE FIX (timezone safe)
    let dateInput = document.getElementById("date");
    if (dateInput && !dateInput.value) {
        let now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        dateInput.value = now.toISOString().slice(0, 16);
    }
    requestAnimationFrame(() => {

        // ✅ render (optimized)
        smartRender();

        // ✅ icons (next frame for smoothness)
        requestAnimationFrame(() => {
            lucide.createIcons();
        });
        // 🔥 LOAD SETTINGS (chartMode)
        firebaseHelpers.loadSettings?.().then(data => {
            if (data && data.length > 0) {
                chartMode = data[0].chartMode || "equity";
                smartRender();
            }
        });
        // ✅ strategy dropdown
        let strategyEl = document.getElementById("strategy");
        if (strategyEl) {
            strategyEl.innerHTML =
                `<option value="">Select Strategy</option>` +
                strategies.map(x => `<option value="${x.name}">${x.name}</option>`).join('');

            // ✅ auto select first strategy (FIXED HERE)
            if (strategies.length > 0) {
                strategyEl.value = strategies[0].name;
            }
        }

        // ✅ checklist update AFTER selection
        updateChecks();

    });

}
let strategyListenerStarted = false;

function startStrategyListener(retry = 0) {

    // already running
    if (strategyListenerStarted) return;

    // wait until login ready
    if (!window.currentUser || !window.currentUser.uid) {

        if (retry < 30) {
            setTimeout(() => {
                startStrategyListener(retry + 1);
            }, 500);
        }

        return;
    }

    strategyListenerStarted = true;

    firebaseHelpers.listenStrategies((data) => {

        strategies = data || [];

        let strategyEl = document.getElementById("strategy");

        if (strategyEl) {

            let oldValue = strategyEl.value;

            strategyEl.innerHTML =
                `<option value="">Select Strategy</option>` +
                strategies.map(x =>
                    `<option value="${x.name}">${x.name}</option>`
                ).join('');

            // restore previous selected value
            if (oldValue && strategies.find(s => s.name === oldValue)) {
                strategyEl.value = oldValue;
            }
        }

        updateChecks();
        smartRender();
    });
}
/* =========================================================
   CHART INTERACTION (Zoom & Pan Controls)
   ========================================================= */

const chartWrapper = document.getElementById("chartWrapper");
const wrapper = chartWrapper;
// ================= MOUSE WHEEL ZOOM =================
chartWrapper.addEventListener("wheel", (e) => {
    e.preventDefault();

    if (e.deltaY < 0) {
        chartZoom = Math.min(MAX_ZOOM, chartZoom + 0.3); // zoom in
    } else {
        chartZoom = Math.max(MIN_ZOOM, chartZoom - 0.3); // zoom out
    }

    chart();
}, { passive: false });


// ================= DRAG SCROLL =================
let isDragging = false;


chartWrapper.addEventListener("touchstart", (e) => {
    isDragging = true;
    startX = e.touches[0].clientX;
});

chartWrapper.addEventListener("touchmove", (e) => {
    if (!isDragging) return;

    let moveX = e.touches[0].clientX;
    let diff = startX - moveX;

    chartWrapper.scrollLeft += diff;
    startX = moveX;
});

chartWrapper.addEventListener("touchend", () => {
    isDragging = false;
});

function zoomIn() {
    chartZoom = Math.min(MAX_ZOOM, chartZoom + 0.3);
    chart();
}

function zoomOut() {
    chartZoom = Math.max(MIN_ZOOM, chartZoom - 0.3);
    chart();
}
let isPanning = false;
let startX = 0;
let lastMove = 0;

chartWrapper.addEventListener("touchstart", (e) => {
    isPanning = true;
    startX = e.touches[0].clientX;
    lastMove = startX;
});

chartWrapper.addEventListener("touchmove", (e) => {
    if (!isPanning) return;

    let moveX = e.touches[0].clientX;
    let diff = moveX - lastMove;

    lastMove = moveX;

    let step = Math.round(diff / 15);

    chartOffset -= step;

    let maxOffset = Math.max(0, trades.length - 10);

    chartOffset = Math.max(0, Math.min(chartOffset, maxOffset));

    chart();
});

chartWrapper.addEventListener("touchend", () => {
    isPanning = false;
});

/* Prevent UI bugs when keyboard is open */

function handleInputFocusFix() {
    const inputs = document.querySelectorAll("input, textarea");

    inputs.forEach(input => {
        input.addEventListener("focus", () => {

            // ✅ close trade popup
let tradeModal = document.getElementById("tradeModal");
let tradeBackdrop = document.getElementById("tradeBackdrop");

if (tradeModal) tradeModal.style.bottom = "-100%";
if (tradeBackdrop) tradeBackdrop.style.display = "none";

            // 🔥 CLOSE any open detail modals / states
            document.querySelectorAll('.swipe-wrapper.open')
                .forEach(w => w.classList.remove('open'));

            document.querySelectorAll('.swipe-content')
                .forEach(el => el.style.transform = 'translateX(0px)');

            // 🔥 OPTIONAL: prevent accidental clicks
            document.body.classList.add("typing-mode");
        });

        input.addEventListener("blur", () => {
            document.body.classList.remove("typing-mode");
        });
    });
}

document.getElementById("cancelDeleteBtn").onclick = function () {
    document.getElementById("dangerModal").style.display = "none";
    pendingDeleteIndex = null;
};

document.getElementById("confirmDeleteBtn").onclick = function () {

    if (pendingDeleteIndex === null) return;

    let id = trades[pendingDeleteIndex].id;
    deleteTradeFromFirebase(id);

    showToast("Trade Deleted 🗑️");

    document.getElementById("dangerModal").style.display = "none";
    pendingDeleteIndex = null;
};
function showOverlay() {
    document.getElementById("overlay").classList.remove("hidden");
}

function hideOverlay() {
    document.getElementById("overlay").classList.add("hidden");
}

function closeSettingsMenu() {
    let menu = document.getElementById('settingsMenu');
    let bg = document.getElementById('settingsBackdrop');

    menu.style.bottom = "-100%";
    bg.style.display = "none";
}

function updateCircleWidgets(winRate, expectancy, wins, losses, totalTrades) {

    winRate = Number(winRate) || 0;
    expectancy = Number(expectancy) || 0;

    document.getElementById("winRateCircle").innerText = winRate.toFixed(1) + "%";
    document.getElementById("pfValue").innerText = expectancy.toFixed(2);


    document.getElementById("winBreakdown").innerText =
        `${wins} Wins / ${totalTrades} Trades`;

    document.getElementById("expBreakdown").innerText =
        `Expectancy per trade`;

    // ================= DESTROY OLD WIN CHART =================
    if (window.winChartInstance) {
        window.winChartInstance.destroy();
    }

    const ctx = document.getElementById("winChart").getContext("2d");

    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, "#22c55e");
    gradient.addColorStop(1, "#4ade80");
    window.winChartInstance = new Chart(document.getElementById("winChart"), {
        type: "doughnut",
        data: {
            datasets: [{
                data: [winRate, 100 - winRate],

                // ✅ Progress color (green)
                backgroundColor: [
                    gradient,
                    "#1a2626"
                ],

                borderWidth: 0,

                // ✅ Rounded edges (IMPORTANT)
                borderRadius: 20,

                // ✅ Thoda gap for modern look
                spacing: 4,

                hoverOffset: 0
            }]
        },
        options: {
            cutout: "78%", // thinner ring = premium look

            animation: {
                animateRotate: true,
                duration: 1400,
                easing: "easeOutQuart"
            },

            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });

    // ================= DESTROY OLD PF CHART =================
    if (window.pfChartInstance) {
        window.pfChartInstance.destroy();
    }

    let normalized = Math.min(Math.abs(expectancy) * 10, 100);

    const ctx2 = document.getElementById("pfChart").getContext("2d");

    // ✅ Gradient (optional but pro look)
    const gradientPurple = ctx2.createLinearGradient(0, 0, 0, 200);
    gradientPurple.addColorStop(0, "#8b5cf6");
    gradientPurple.addColorStop(1, "#a78bfa");

    window.pfChartInstance = new Chart(document.getElementById("pfChart"), {
        type: "doughnut",
        data: {
            datasets: [{
                data: [normalized, 100 - normalized],

                // ✅ Progress + Background colors
                backgroundColor: [
                    gradientPurple, // progress
                    "#231b38"       // background ring
                ],

                borderWidth: 0,

                // ✅ Rounded edges
                borderRadius: 20,

                // ✅ Modern spacing
                spacing: 4,

                hoverOffset: 0
            }]
        },
        options: {
            cutout: "78%", // thin premium ring

            animation: {
                animateRotate: true,
                duration: 1400,
                easing: "easeOutQuart"
            },

            plugins: {
                legend: { display: false },
                tooltip: { enabled: false }
            }
        }
    });
}

function renderBestStrategyCard(bestStrategy, trades) {

    const container = document.getElementById("bestStrategyCard");
    if (!container || !bestStrategy) return;

    let total = bestStrategy.wins + bestStrategy.losses;

    let profit = 0;
    let loss = 0;

    trades.forEach(t => {
        if (t.strategy !== bestStrategy.name) return;

        if (t.type === "profit") profit += +t.amt;
        else loss += +t.amt;
    });

    let netProfit = profit - loss;

    container.innerHTML = `
    <div class="bs-card">

        <div class="bs-top">
            <div class="bs-title">BEST STRATEGY</div>

            <div class="bs-icon-wrap">
                <svg class="bs-icon" viewBox="0 0 24 24" fill="none">
                    <path d="M7 4h10v3a5 5 0 0 1-10 0V4Z" 
                          stroke="currentColor" stroke-width="2"/>
                    <path d="M9 14v2a3 3 0 0 0 6 0v-2" 
                          stroke="currentColor" stroke-width="2"/>
                    <path d="M8 21h8" 
                          stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
            </div>

        </div>

        <div class="bs-name">${bestStrategy.name}</div>

        <div class="bs-grid">

            <div class="bs-box">
                <div class="bs-label">TOTAL TRADES</div>
                <div class="bs-value">${total}</div>
            </div>

            <div class="bs-box">
                <div class="bs-label">WIN RATE</div>
                <div class="bs-value green">${bestStrategy.winRate.toFixed(1)}%</div>
            </div>

            <div class="bs-box">
                <div class="bs-label">NET PROFIT</div>
                <div class="bs-value ${netProfit >= 0 ? 'green' : 'red'}">
                    $${netProfit.toFixed(2)}
                </div>
            </div>

        </div>

    </div>
    `;
}

function observeAndAnimate(selector, callback) {
    const observer = new IntersectionObserver((entries, obs) => {
        entries.forEach(entry => {

            if (entry.isIntersecting) {

                callback(entry.target);

                // run only once
                obs.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.3 // 30% visible hote hi trigger
    });

    document.querySelectorAll(selector).forEach(el => {
        observer.observe(el);
    });
}

window.togglePassword = function () {
  const input = document.getElementById("password");
  const icon = document.querySelector(".toggle-password");

  if (input.type === "password") {
    input.type = "text";
    icon.textContent = "🙈";
  } else {
    input.type = "password";
    icon.textContent = "👁";
  }
};

// 🔓 OPEN POPUP
window.confirmLogout = function () {
  const popup = document.getElementById("logoutPopup");

  if (!popup) {
    console.error("Popup not found ❌");
    return;
  }

  popup.classList.add("show");
};

window.closeLogoutPopup = function () {
  const popup = document.getElementById("logoutPopup");

  if (!popup) return;

  popup.classList.remove("show");
};

// call once
setTimeout(handleInputFocusFix, 100);


document.getElementById('strategy')?.addEventListener('change', updateChecks);
// ================= GLOBAL FUNCTION EXPORT (FIX POPUP ISSUE) =================
window.openStrategyModal = openStrategyModal;
window.closeStrategyModal = closeStrategyModal;
window.addChecklistField = addChecklistField;
window.saveStrategy = saveStrategy;
window.setTradeType = setTradeType;
window.updateChecks = updateChecks;
window.toggleCheck = toggleCheck;
window.startStrategyListener = startStrategyListener;
window.save = save;
window.cancelEdit = cancelEdit;
window.deleteTrade = deleteTrade;
window.editTrade = editTrade;
window.openTradeDetails = openTradeDetails;
window.show = show;
window.closeTradeDetails = closeTradeDetails;
window.closeDayPopup = closeDayPopup;
window.openFullDayTrades = openFullDayTrades;
window.setFilter = setFilter;
window.setRangeFilter = setRangeFilter;
window.setChartMode = setChartMode;
window.zoomIn = zoomIn;
window.zoomOut = zoomOut;
window.startSwipe = startSwipe;
window.moveSwipe = moveSwipe;
window.endSwipe = endSwipe;
window.openDay = openDay;
window.clearFilter = clearFilter;
window.toggleSettingsMenu = toggleSettingsMenu;
window.openStrategyManager = openStrategyManager;
window.closeStrategyManager = closeStrategyManager;
window.editStrategy = editStrategy;
window.deleteStrategy = deleteStrategy;
window.resetAllData = resetAllData;
window.closeResetModal = closeResetModal;
window.closeDeleteModal = closeDeleteModal;
window.confirmDelete = confirmDelete;
window.confirmReset = confirmReset;
window.changeMonth = changeMonth;