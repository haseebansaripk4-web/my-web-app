window.calculate = function () {

    let type = document.getElementById("calc-type").value;
    let errorBox = document.getElementById("error");
    errorBox.innerText = "";

    let balance = parseFloat(document.getElementById("calc-balance").value);
    let riskPercent = parseFloat(document.getElementById("calc-risk").value);
    let rewardPercent = parseFloat(document.getElementById("calc-reward").value);

    let entry = parseFloat(document.getElementById("calc-entry").value);
    let sl = parseFloat(document.getElementById("calc-sl").value);
    let tp = parseFloat(document.getElementById("calc-tp").value);

    if (!balance || !riskPercent || !entry || !sl || !tp) {
        errorBox.innerText = "Please fill all fields";
        return;
    }

    // LONG RULES
    if (type === "long") {
        if (sl >= entry) {
            errorBox.innerText = "For LONG: SL must be below Entry";
            return;
        }
        if (tp <= entry) {
            errorBox.innerText = "For LONG: TP must be above Entry";
            return;
        }
    }

    // SHORT RULES
    if (type === "short") {
        if (sl <= entry) {
            errorBox.innerText = "For SHORT: SL must be above Entry";
            return;
        }
        if (tp >= entry) {
            errorBox.innerText = "For SHORT: TP must be below Entry";
            return;
        }
    }

    let riskAmount = (balance * riskPercent) / 100;

    let slDistance, tpDistance;

    // ⚠️ SAFETY CHECK (IMPORTANT)
    if (slDistance === 0 || tpDistance === 0) {
        errorBox.innerText = "Invalid SL/TP distance";
        return;
    }

    if (type === "long") {
        slDistance = entry - sl;
        tpDistance = tp - entry;
    } else {
        slDistance = sl - entry;
        tpDistance = entry - tp;
    }

    let quantity = riskAmount / slDistance;
    let tradeAmount = quantity * entry;
    let profit = quantity * tpDistance;
    let rr = tpDistance / slDistance;

    // 💡 Extra RR insight
    let rrPercent = (profit / riskAmount) * 100;

    document.getElementById("qty").innerText = quantity.toFixed(2);
    document.getElementById("amount").innerText = tradeAmount.toFixed(2);
    document.getElementById("loss").innerText = riskAmount.toFixed(2);
    document.getElementById("profit").innerText = profit.toFixed(2);
    document.getElementById("rr").innerText =
        rr.toFixed(2) + " R (" + rrPercent.toFixed(0) + "%)";
};

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("#calculator input, #calculator select")
        .forEach(el => {
            el.addEventListener("input", window.calculate);
        });
});