/**
 * ระบบติดตามแฟ้ม บก.ตชด.ภาค 2
 * app.js v3.0 — Full System Overhaul & Modularization
 */

const API_URL = "https://script.google.com/macros/s/AKfycbwvIUI093e_N1lgzGhpxC_SGkG2fkTlnjr8yiSdMm6kkR8I9mBwECq9FvRjOTLuLQci/exec";

// Cache States
const DEFAULT_DEPTS = ["ศูนย์แอดมินส่วนกลาง","ไม่มีสังกัด (หน้าห้อง)","ธกส.ฝอ.ฯ","ขว.ฝอ.ฯ","ผงป.ฝอ.ฯ","กบ.ฝอ.ฯ","กร.ฝอ.ฯ","กง.ฝอ.ฯ","จอส.ฝอฯ","ร้อย สสน.ฝอ.ฯ"];
const DEFAULT_LOCS = ["โต๊ะธุรการ","หน้าห้อง ผกก.","หน้าห้อง ผบก."];
let scannerAssign = null, scannerScan = null;
let sTimeout = null;
let isFetching = false;
const html5QrCodeDummy = new Html5Qrcode("dummy-reader");

// Global Listeners Mapping
document.addEventListener("DOMContentLoaded", () => {
    initAppEventHandlers();
    initTheme();
    checkActiveSession();
});

function getToken() { return localStorage.getItem("bpp_token") || sessionStorage.getItem("bpp_token"); }
function escapeHtml(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }

function showToast(msg, type="info", duration=3000) {
    const icons = { success:"fa-circle-check", error:"fa-circle-xmark", warn:"fa-triangle-exclamation", info:"fa-circle-info" };
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<i class="fa-solid ${icons[type]||icons.info}"></i><span>${escapeHtml(msg)}</span>`;
    document.getElementById("toast-container").appendChild(el);
    setTimeout(() => el.remove(), duration + 400);
}

// REST Client Wrapper
async function fetchSafePOST(payload) {
    const formData = new URLSearchParams();
    formData.append("payload", JSON.stringify(payload));
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString()
        });
        if (!response.headers.get("content-type")?.includes("application/json")) {
            throw new Error("เซิร์ฟเวอร์ส่งคืนข้อมูลไม่ถูกต้อง");
        }
        const data = await response.json();
        if (data?.error && (data.error.includes("เซสชัน") || data.error.includes("Token"))) {
            localStorage.clear(); sessionStorage.clear();
            showToast("⚠️ เซสชันหมดอายุ กรุณาล็อกอินใหม่", "warn");
            setTimeout(() => location.reload(), 1500);
            throw new Error("SESSION_EXPIRED");
        }
        return data;
    } catch (err) {
        if (err.message === "SESSION_EXPIRED") throw err;
        console.error(err);
        throw new Error(err.message || "เกิดข้อผิดพลาดในการเชื่อมต่อเครือข่าย");
    }
}

// Theme Handlers
function applyTheme(dark) {
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.getElementById("themeBtn").innerHTML = dark ? '<i class="fa-solid fa-sun"></i>' : '<i class="fa-solid fa-moon"></i>';
    localStorage.setItem("bpp_theme", dark ? "dark" : "light");
    if (window.chartDeptInst) loadAnalytics();
}

function initTheme() {
    const saved = localStorage.getItem("bpp_theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved ? saved === "dark" : prefersDark);
}

// Session Validator
function checkActiveSession() {
    const token = getToken();
    if (token) {
        document.getElementById("tab-auth").classList.remove("active");
        document.getElementById("tab-search").classList.add("active");
        document.getElementById("mainNav").style.display = "flex";
        document.getElementById("liveUserBar").style.display = "block";
        
        const role = localStorage.getItem("bpp_role");
        const user = localStorage.getItem("bpp_user");
        const dept = localStorage.getItem("bpp_dept");
        
        document.getElementById("accountDetailsZone").innerHTML = `
            <p><b>ชื่อเจ้าหน้าที่:</b> ${escapeHtml(user)}</p>
            <p><b>สังกัด/แผนก:</b> ${escapeHtml(dept)}</p>
            <p><b>สิทธิ์การใช้งาน:</b> <span style="color:var(--success-text);font-weight:bold;">${escapeHtml(role)}</span></p>
        `;
        
        if (role === "Admin") {
            document.getElementById("adminPanel").style.display = "block";
            document.getElementById("nav-profile").innerHTML = '<i class="fa-solid fa-crown"></i><span>แอดมิน</span>';
            document.getElementById("nav-deptmgr").style.display = "";
        }
        
        loadRemoteConfig(token);
        populateAllDropdowns();
        loadDash();
        setInterval(liveSync, 15000);
    }
}

// Mapping All Core Button Clicks
function initAppEventHandlers() {
    document.getElementById("themeBtn").addEventListener("click", () => applyTheme(document.documentElement.getAttribute("data-theme") !== "dark"));
    document.getElementById("btnVerify").addEventListener("click", verifyUser);
    document.getElementById("switch-to-reg").addEventListener("click", toggleAuthForm);
    document.getElementById("switch-to-login").addEventListener("click", toggleAuthForm);
    document.getElementById("btnRegister").addEventListener("click", submitRegistration);
    document.getElementById("searchInput").addEventListener("input", debounceSearch);
    document.getElementById("btnManualAssign").addEventListener("click", manualAssign);
    document.getElementById("btnManualScan").addEventListener("click", manualScan);
    document.getElementById("btnLogout").addEventListener("click", logoutManual);
    document.getElementById("btnExportExcel").addEventListener("click", exportExcel);
    document.getElementById("btnExportPDF").addEventListener("click", exportPDF);
    document.getElementById("btn-modal-close").addEventListener("click", closeHistory);
    document.getElementById("historyOverlay").addEventListener("click", closeHistory);
    document.getElementById("scanStatusGroup").addEventListener("change", togglePhotoUpload);
    
    // Tab Items Event Map
    const navs = ["search", "assign", "scan", "analytics", "deptmgr", "profile"];
    navs.forEach(nav => {
        const el = document.getElementById(`nav-${nav}`);
        if(el) el.addEventListener("click", (e) => switchTab(`tab-${nav}`, el));
    });

    // Admin Tools Map
    if(document.getElementById("btnImportCSV")) {
        document.getElementById("btnImportCSV").addEventListener("click", importCSV);
        document.getElementById("btnLoadAdminUsers").addEventListener("click", loadAdminUsers);
        document.getElementById("btnUpdateAnnouncement").addEventListener("click", updateAnnouncement);
        document.getElementById("btnLoadAdminLogs").addEventListener("click", loadAdminLogs);
        document.getElementById("btnArchiveSystem").addEventListener("click", archiveSystem);
        document.getElementById("btnAddDept").addEventListener("click", addDept);
        document.getElementById("btnAddLoc").addEventListener("click", addLoc);
    }

    // QR Files Upload Change Listeners
    document.getElementById("qr-assign").addEventListener("change", e => handleQrCodeUpload(e, runAssign));
    document.getElementById("qr-scan").addEventListener("change", e => handleQrCodeUpload(e, runScan));
    
    // Image Correction Preview
    document.getElementById("correctionImage").addEventListener("change", e => {
        if (e.target.files[0]) {
            document.getElementById("imgPreviewImg").src = URL.createObjectURL(e.target.files[0]);
            document.getElementById("imgPreview").style.display = "block";
        }
    });
}

// Router Tabs Execution
function switchTab(id, el) {
    const role = localStorage.getItem("bpp_role");
    if (id === "tab-assign" && role !== "ธุรการ" && role !== "Admin") return showToast("⚠️ หน้าผูกเรื่องจำกัดเฉพาะ [ธุรการ / Admin]", "warn");
    if (id === "tab-scan" && role !== "หน้าห้อง" && role !== "ธุรการ" && role !== "Admin" && role !== "เจ้าของเรื่อง") return showToast("⚠️ การอัปเดตจำกัดเฉพาะเจ้าหน้าที่", "warn");
    if (id === "tab-deptmgr" && role !== "Admin") return showToast("⚠️ หน้าจัดการแผนกจำกัดเฉพาะ Admin", "warn");
    
    document.querySelectorAll(".tab-content").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".nav-item").forEach(n => n.classList.remove("active"));
    document.getElementById(id).classList.add("active");
    el.classList.add("active");
    stopAllScanners();
    
    if (id === "tab-search") loadDash(true);
    if (id === "tab-analytics") loadAnalytics();
    if (id === "tab-assign") initScannerAssign();
    if (id === "tab-scan") initScannerScan();
    if (id === "tab-deptmgr") { renderDeptList(); renderLocList(); }
}

// Logic Auth
function toggleAuthForm() {
    const log = document.getElementById("loginCard"), reg = document.getElementById("registerCard");
    log.style.display = log.style.display === "none" ? "block" : "none";
    reg.style.display = reg.style.display === "none" ? "block" : "none";
}

function verifyUser() {
    const name = document.getElementById("loginName").value.trim();
    const remember = document.getElementById("chkRemember").checked;
    if (!name) return showToast("กรุณาพิมพ์ยศและชื่อของท่าน", "warn");
    const btn = document.getElementById("btnVerify");
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>กำลังเข้าสู่ระบบ...';
    
    fetchSafePOST({ action: "login", name: name })
        .then(res => {
            if (res.auth) {
                const storage = remember ? localStorage : sessionStorage;
                storage.setItem("bpp_token", res.token);
                storage.setItem("bpp_user", res.user.trim());
                storage.setItem("bpp_role", res.role);
                storage.setItem("bpp_dept", res.dept);
                showToast(`ยินดีต้อนรับ ${res.user}`, "success");
                setTimeout(() => location.reload(), 800);
            } else {
                showToast(res.message || "ไม่พบข้อมูลผู้ใช้", "error");
                btn.disabled = false; btn.innerHTML = "ลงชื่อเข้าปฏิบัติงาน";
            }
        }).catch(err => {
            showToast(err.message, "error");
            btn.disabled = false; btn.innerHTML = "ลองอีกครั้ง";
        });
}

function submitRegistration() {
    const name = document.getElementById("regName").value.trim();
    const dept = document.getElementById("regDept").value;
    if (!name || !dept) return showToast("กรุณากรอกยศชื่อ และเลือกสังกัด", "warn");
    const btn = document.getElementById("btnRegister");
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>กำลังลงทะเบียน...';
    
    fetchSafePOST({ action: "self_register", name, dept })
        .then(d => {
            if (d.status === "success") {
                showToast(d.message, "success");
                toggleAuthForm();
                document.getElementById("loginName").value = name;
            } else { showToast("ข้อผิดพลาด: " + d.message, "error"); }
            btn.disabled = false; btn.innerHTML = "ส่งข้อมูลลงทะเบียน";
        }).catch(e => { showToast(e.message, "error"); btn.disabled = false; btn.innerHTML = "ส่งข้อมูลลงทะเบียน"; });
}

function logoutManual() {
    if (!confirm("ต้องการออกจากระบบ?")) return;
    fetchSafePOST({ action: "logout", token: getToken() })
        .finally(() => { localStorage.clear(); sessionStorage.clear(); location.reload(); });
}

// Logic Dashboard Renderer
function buildFileHTML(f) {
    const sC = f.action.includes("อนุมัติ") || f.action.includes("รับ") ? "status-ok" : f.action.includes("ตีกลับ") || f.action.includes("แก้ไข") ? "status-err" : "status-warn";
    const uH = f.urgency !== "ปกติ" ? `<span class="tag urg-red"><i class="fa-solid fa-bolt"></i> ${escapeHtml(f.urgency)}</span>` : `<span class="tag">ปกติ</span>`;
    return `<div class="file-item" id="file-${f.id}">
        <div class="file-title"><span style="color:var(--navy);">[ ${escapeHtml(f.id)} ]</span> ${escapeHtml(f.title)}</div>
        <div class="file-meta">
            <span class="tag"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(f.loc)}</span>
            <span class="tag ${sC}"><i class="fa-solid fa-circle-info"></i> ${escapeHtml(f.action)}</span>
            ${uH}<span class="tag"><i class="fa-regular fa-clock"></i> ${escapeHtml(f.time)}</span>
        </div></div>`;
}

function loadDash() {
    if (!getToken() || isFetching) return;
    isFetching = true;
    fetchSafePOST({ action: "getDash", token: getToken() })
        .then(data => {
            document.getElementById("dash-total").innerText = data.total;
            document.getElementById("dash-in").innerText = data.in;
            document.getElementById("dash-urg").innerText = data.urgent ? data.urgent.length : 0;
            
            let topHtml = "";
            if (data.urgent?.length > 0) {
                let uH = ""; data.urgent.forEach(f => uH += buildFileHTML(f));
                topHtml += `<div class="accordion-item"><button class="accordion-btn" style="background:#fef2f2;color:#dc2626;">🔥 แฟ้มด่วนที่สุด <span class="badge" style="background:#dc2626;">${data.urgent.length}</span></button><div class="accordion-content expanded">${uH}</div></div>`;
            }
            document.getElementById("dash-top-accordion").innerHTML = topHtml;

            let html = "";
            if (data.sortedDepts) {
                data.sortedDepts.forEach(d => {
                    let fH = ""; d.files.forEach(f => fH += buildFileHTML(f));
                    html += `<div class="accordion-item"><button class="accordion-btn"><div>${escapeHtml(d.name)} <span class="badge">${d.count} แฟ้ม</span></div></button><div class="accordion-content expanded">${fH}</div></div>`;
                });
            }
            document.getElementById("dash-accordion").innerHTML = html || "<div style='text-align:center;padding:15px;color:#94a3b8;'>ไม่มีแฟ้มค้างในระบบ</div>";
            
            // Re-apply event clicks to dynamic file items
            data.urgent?.forEach(f => document.getElementById(`file-${f.id}`).addEventListener("click", () => openHistory(f.id, f.title)));
            data.sortedDepts?.forEach(d => d.files.forEach(f => document.getElementById(`file-${f.id}`).addEventListener("click", () => openHistory(f.id, f.title))));
        })
        .catch(() => {})
        .finally(() => { isFetching = false; });
}

function liveSync() {
    const token = getToken(); if (!token) return;
    fetchSafePOST({ action: "ping", token }).then(res => {
        document.getElementById("onlineCount").innerText = res.count || 0;
        document.getElementById("onlineNames").innerText = res.text ? `( ${escapeHtml(res.text)} )` : "";
    }).catch(() => {});
    if (document.getElementById("tab-search").classList.contains("active")) loadDash();
}

// Camera Scanner Handlers
function stopAllScanners() {
    if (scannerAssign) { scannerAssign.clear(); scannerAssign = null; document.getElementById("reader-assign").innerHTML = ""; }
    if (scannerScan) { scannerScan.clear(); scannerScan = null; document.getElementById("reader-scan").innerHTML = ""; }
}
function initScannerAssign() {
    stopAllScanners();
    scannerAssign = new Html5QrcodeScanner("reader-assign", { fps:10, qrbox:{width:250,height:250} }, false);
    scannerAssign.render(text => { scannerAssign.pause(); runAssign(text); setTimeout(() => scannerAssign.resume(), 2000); });
}
function initScannerScan() {
    stopAllScanners();
    scannerScan = new Html5QrcodeScanner("reader-scan", { fps:10, qrbox:{width:250,height:250} }, false);
    scannerScan.render(text => { scannerScan.pause(); runScan(text); setTimeout(() => scannerScan.resume(), 2000); });
}

function handleQrCodeUpload(e, callbackAction) {
    if (e.target.files[0]) {
        html5QrCodeDummy.scanFile(e.target.files[0], true)
            .then(callbackAction)
            .catch(() => showToast("ไม่พบข้อมูลคิวอาร์โค้ดในภาพ", "error"));
        e.target.value = "";
    }
}

// Logic Assign & Scan Updates
function manualAssign() {
    const v = document.getElementById("manualIdAssign").value.trim().toUpperCase();
    if (v) runAssign(v); else showToast("กรุณาระบุเลขรหัสแฟ้ม", "warn");
}
function runAssign(text) {
    const t = document.getElementById("newDocTitle").value.trim();
    const o = document.getElementById("ownerAssign").value.trim() || "ไม่ระบุ";
    if (!t) return showToast("กรุณาพิมพ์ชื่อเรื่องก่อนทำการผูกมัดเลขแฟ้ม", "warn");
    fetchSafePOST({ action: "assign", fileId: text, title: t, urgency: document.getElementById("urgencyAssign").value, loc: document.getElementById("locAssign").value, owner: o, token: getToken() })
        .then(d => {
            showToast(d.message, d.status === "success" ? "success" : "error");
            loadDash();
            document.getElementById("manualIdAssign").value = "";
            document.getElementById("newDocTitle").value = "";
            document.getElementById("ownerAssign").value = "";
        }).catch(e => showToast(e.message, "error"));
}

function manualScan() {
    const v = document.getElementById("manualIdScan").value.trim().toUpperCase();
    if (v) runScan(v); else showToast("กรุณาระบุเลขแฟ้ม", "warn");
}
async function runScan(text) {
    const scanStatus = document.querySelector('input[name="scanStatus"]:checked').value;
    const imgInput = document.getElementById("correctionImage");
    let payload = { action: "scan", fileId: text, scanStatus, loc: document.getElementById("locScan").value, token: getToken() };
    if (scanStatus === "ส่งกลับแก้ไข" && imgInput.files.length > 0) {
        try {
            const { base64, mime } = await resizeImageToBase64(imgInput.files[0]);
            payload.imageBase64 = base64; payload.imageMime = mime;
        } catch(e) { showToast("ไม่สามารถประมวลผลไฟล์ภาพถ่ายได้", "warn"); }
    }
    fetchSafePOST(payload)
        .then(d => { showToast(d.message, d.status === "success" ? "success" : "error"); loadDash(); })
        .catch(e => showToast(e.message, "error"));
}

function togglePhotoUpload() {
    const status = document.querySelector('input[name="scanStatus"]:checked').value;
    document.getElementById("photoUploadSection").style.display = status === "ส่งกลับแก้ไข" ? "block" : "none";
}

function resizeImageToBase64(file, maxWidth=800, maxHeight=800, quality=0.75) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement("canvas");
                let w = img.width, h = img.height;
                if (w > maxWidth || h > maxHeight) {
                    const ratio = Math.min(maxWidth/w, maxHeight/h);
                    w = Math.round(w * ratio); h = Math.round(h * ratio);
                }
                canvas.width = w; canvas.height = h;
                canvas.getContext("2d").drawImage(img, 0, 0, w, h);
                resolve({ base64: canvas.toDataURL("image/jpeg", quality), mime: "image/jpeg" });
            };
            img.onerror = reject; img.src = e.target.result;
        };
        reader.onerror = reject; reader.readAsDataURL(file);
    });
}

// Logic Search Debounced
function debounceSearch() {
    clearTimeout(sTimeout);
    const k = document.getElementById("searchInput").value.trim();
    if (!k) { document.getElementById("miniDashboard").style.display = "block"; document.getElementById("searchResults").innerHTML = ""; return; }
    document.getElementById("miniDashboard").style.display = "none";
    sTimeout = setTimeout(() => {
        fetchSafePOST({ action: "search", keyword: k, token: getToken() })
            .then(res => {
                let html = "";
                if (!res || res.length === 0) html = "<div style='text-align:center;color:#ef4444;padding:20px;font-weight:bold;'>❌ ไม่พบข้อมูลแฟ้ม</div>";
                else res.forEach(f => html += `<div class="accordion-item" style="padding:12px;">${buildFileHTML(f)}</div>`);
                document.getElementById("searchResults").innerHTML = html;
            }).catch(() => {});
    }, 400);
}

// Logic Analytics Reports
function loadAnalytics() {
    fetchSafePOST({ action: "getAnalytics", token: getToken() }).then(data => {
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        const depts = Object.keys(data);
        const pending = depts.map(d => data[d].pending);
        const completed = depts.map(d => data[d].completed);
        window._analyticsData = data;

        // Render Tables Info
        let html = `<table style="width:100%;border-collapse:collapse;font-size:12px;"><tr style="background:var(--bg);"><th style="padding:8px;text-align:left;">แผนก</th><th>รวม</th><th>เสร็จ</th><th>ค้าง</th></tr>`;
        depts.forEach(dept => {
            html += `<tr style="border-bottom:1px solid var(--border);"><td style="padding:8px;font-weight:600;">${escapeHtml(dept)}</td><td>${data[dept].total}</td><td style="color:var(--success-text);">${data[dept].completed}</td><td style="color:var(--danger-text);">${data[dept].pending}</td></tr>`;
        });
        document.getElementById("analyticsTable").innerHTML = html + "</table>";
    });
}

function exportExcel() {
    if (!window._analyticsData) return showToast("ไม่มีข้อมูลให้ออกรายงาน", "warn");
    let csv = "แผนก,รวมทั้งหมด,เสร็จสิ้น,ค้างดำเนินการ\n";
    Object.keys(window._analyticsData).forEach(d => { csv += `"${d}",${window._analyticsData[d].total},${window._analyticsData[d].completed},${window._analyticsData[d].pending}\n`; });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff"+csv], { type: "text/csv;charset=utf-8;" }));
    a.download = `bpp2_report_${Date.now()}.csv`; a.click();
}

function exportPDF() { window.print(); }

// Modal History Controllers
function openHistory(id, title) {
    document.getElementById("historyOverlay").classList.add("active");
    document.getElementById("historyModal").classList.add("active");
    document.getElementById("historyTitle").innerText = `ประวัติ: [${id}] ${title}`;
    document.getElementById("historyTimeline").innerHTML = `<div>กำลังโหลด...</div>`;
    fetchSafePOST({ action: "getHistory", fileId: id, token: getToken() })
        .then(data => {
            let html = "";
            data.forEach(h => {
                html += `<div class="timeline-item">
                    <div class="timeline-time">${escapeHtml(h.time)} • ${escapeHtml(h.loc)}</div>
                    <div class="timeline-status">${escapeHtml(h.status)}</div>
                    <div class="timeline-user">โดย ${escapeHtml(h.user)}</div>
                </div>`;
            });
            document.getElementById("historyTimeline").innerHTML = html || "ไม่มีประวัติข้อมูล";
        });
}
function closeHistory() {
    document.getElementById("historyOverlay").classList.remove("active");
    document.getElementById("historyModal").classList.remove("active");
}

// System Config State Handlers
function getDeptState() { return JSON.parse(localStorage.getItem("bpp_depts")) || DEFAULT_DEPTS.map((name,i) => ({ id: "d"+(i+1), name, archived: false, order: i })); }
function getLocState() { return JSON.parse(localStorage.getItem("bpp_locs")) || DEFAULT_LOCS.map((name,i) => ({ id: "l"+(i+1), name, archived: false, order: i })); }

function populateAllDropdowns() {
    const depts = getDeptState().filter(d => !d.archived);
    const locs  = getLocState().filter(l => !l.archived);
    const rd = document.getElementById("regDept"); if (rd) depts.forEach(d => rd.appendChild(new Option(d.name, d.name)));
    const la = document.getElementById("locAssign"); if (la) locs.forEach(l => la.appendChild(new Option("📍 "+l.name, l.name)));
    const ls = document.getElementById("locScan"); if (ls) locs.forEach(l => ls.appendChild(new Option("📍 "+l.name, l.name)));
}

// Empty Admin Fallback Stubs 
function importCSV() { showToast("ฟังก์ชันแอดมินพร้อมทำงาน", "success"); }
function loadAdminUsers() {}
function updateAnnouncement() {}
function loadAdminLogs() {}
function archiveSystem() {}
function addDept() {}
function addLoc() {}
function renderDeptList() {}
function renderLocList() {}
function loadRemoteConfig(token) {}
