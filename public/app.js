let html5QrcodeScanner = null;
let currentBarcode = null;
let currentUser = null;
let editingId = null;
let searchTimeout = null; // Za odgodu pretrage

document.addEventListener('DOMContentLoaded', () => {
    const savedUser = localStorage.getItem('inventura_user');
    if (savedUser) initApp(savedUser);
    else document.getElementById('pin-input').focus();

    document.getElementById('btn-login').addEventListener('click', performLogin);
    document.getElementById('pin-input').addEventListener('keypress', (e) => { if(e.key==='Enter') performLogin() });

    document.getElementById('btn-logout').addEventListener('click', () => {
        if(confirm("Odjava?")) { localStorage.removeItem('inventura_user'); location.reload(); }
    });

    document.getElementById('btn-save').addEventListener('click', saveScan);
    document.getElementById('btn-cancel').addEventListener('click', resetToScanner);
    document.getElementById('quantity').addEventListener('keydown', (e) => { if(e.key==='Enter'){e.preventDefault(); saveScan();} });

    // --- LIVE SEARCH EVENTI ---
    document.getElementById('btn-toggle-manual').addEventListener('click', showSearch);
    document.getElementById('btn-cancel-search').addEventListener('click', resetToScanner);
    document.getElementById('live-search').addEventListener('input', handleSearchInput);

    document.getElementById('btn-error-ok').addEventListener('click', () => {
        document.getElementById('error-modal').classList.add('hidden'); resetToScanner();
    });
    document.getElementById('btn-close-edit').addEventListener('click', () => {
        document.getElementById('edit-modal').classList.add('hidden');
    });
    document.getElementById('btn-update').addEventListener('click', updateScan);
});

function performLogin() {
    const pin = document.getElementById('pin-input').value.trim();
    if (!pin) return;
    fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin })
    }).then(res => res.json()).then(data => {
        if (data.success) { localStorage.setItem('inventura_user', data.ime); initApp(data.ime); }
        else {
            const err = document.getElementById('login-error'); err.classList.remove('hidden');
            document.getElementById('pin-input').value = ''; setTimeout(() => err.classList.add('hidden'), 2000);
        }
    }).catch(() => alert("Greška servera!"));
}

function initApp(name) {
    currentUser = name;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('user-name-span').innerText = name;
    startScanner(); loadMyScans();
}

function startScanner() {
    if(html5QrcodeScanner) return;
    html5QrcodeScanner = new Html5Qrcode("reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" }, { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
        (decodedText) => handleBarcodeFound(decodedText)
    ).catch(err => console.log("Camera error", err));
}

function handleBarcodeFound(barcode) {
    if(html5QrcodeScanner && html5QrcodeScanner.isScanning) html5QrcodeScanner.pause();
    currentBarcode = barcode;
    fetch(`/api/artikl/${barcode}`).then(res => res.json()).then(response => {
        if (response.success) showQuantityForm(response.data.naziv, barcode);
        else showErrorModal();
    }).catch(() => { alert("Greška mreže!"); resetToScanner(); });
}

function showQuantityForm(naziv, barkod) {
    document.getElementById('scanner-container').classList.add('hidden');
    document.getElementById('search-container').classList.add('hidden'); // Sakrij tražilicu
    document.getElementById('quantity-section').classList.remove('hidden');
    document.getElementById('item-name').innerText = naziv;
    document.getElementById('item-barcode').innerText = barkod;
    const qtyInput = document.getElementById('quantity'); qtyInput.value = ""; 
    setTimeout(() => qtyInput.focus(), 100);
}

function showErrorModal() {
    if(navigator.vibrate) navigator.vibrate([200, 50, 200]);
    document.getElementById('error-modal').classList.remove('hidden');
}

function resetToScanner() {
    document.getElementById('quantity-section').classList.add('hidden');
    document.getElementById('search-container').classList.add('hidden');
    document.getElementById('scanner-container').classList.remove('hidden');
    currentBarcode = null; 
    document.getElementById('live-search').value = ""; // Očisti tražilicu
    document.getElementById('search-results').innerHTML = ""; // Očisti rezultate
    document.getElementById('search-results').classList.add('hidden');

    try { if(html5QrcodeScanner) html5QrcodeScanner.resume(); } catch(e) {}
}

// --- LOGIKA ZA LIVE SEARCH ---
function showSearch() {
    if(html5QrcodeScanner && html5QrcodeScanner.isScanning) html5QrcodeScanner.pause();
    document.getElementById('scanner-container').classList.add('hidden');
    document.getElementById('search-container').classList.remove('hidden');
    document.getElementById('live-search').focus();
}

function handleSearchInput(e) {
    const query = e.target.value.trim();
    const resultsList = document.getElementById('search-results');

    // Debounce: Čekaj 300ms prije slanja upita (da ne gušimo server)
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
        resultsList.innerHTML = "";
        resultsList.classList.add('hidden');
        return;
    }

    searchTimeout = setTimeout(() => {
        fetch(`/api/search?q=${encodeURIComponent(query)}`)
            .then(res => res.json())
            .then(response => {
                resultsList.innerHTML = "";
                if (response.data.length > 0) {
                    resultsList.classList.remove('hidden');
                    response.data.forEach(item => {
                        const li = document.createElement('li');
                        li.innerHTML = `
                            <span class="res-name">${item.naziv}</span>
                            <span class="res-barcode">${item.barkod} | ${item.cijena} €</span>
                        `;
                        // KLIK NA REZULTAT
                        li.addEventListener('click', () => {
                            currentBarcode = item.barkod;
                            showQuantityForm(item.naziv, item.barkod);
                        });
                        resultsList.appendChild(li);
                    });
                } else {
                    resultsList.innerHTML = "<li style='color:red; text-align:center;'>Nema rezultata</li>";
                    resultsList.classList.remove('hidden');
                }
            });
    }, 300);
}

function saveScan() {
    const qty = document.getElementById('quantity').value;
    if (!qty || qty <= 0) return alert("Količina > 0!");
    fetch('/api/skeniraj', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barkod: currentBarcode, naziv: document.getElementById('item-name').innerText, kolicina: parseInt(qty), korisnik: currentUser })
    }).then(res => res.json()).then(data => {
        if (data.success) { showToast(); loadMyScans(); resetToScanner(); }
        else alert("Greška: " + data.error);
    });
}

function showToast() {
    const t = document.getElementById('toast'); t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 1500);
}

function loadMyScans() {
    if(!currentUser) return;
    fetch(`/api/skenovi?korisnik=${encodeURIComponent(currentUser)}`).then(res => res.json()).then(response => {
        const list = document.getElementById('scan-list'); list.innerHTML = '';
        let grandTotal = 0;
        response.data.forEach(item => {
            const cijena = item.cijena || 0;
            const subtotal = cijena * item.kolicina;
            grandTotal += subtotal;
            const li = document.createElement('li');
            li.innerHTML = `
                <div class="list-left" onclick="openEdit(${item.id}, '${item.naziv}', ${item.kolicina})">
                    <strong>${item.naziv}</strong><br>
                    <small style="color:#666;">${item.barkod}</small><br>
                    <span class="item-price">Cijena: ${cijena.toFixed(2)} €</span>
                </div>
                <div class="list-right">
                    <span class="qty-badge">${item.kolicina}</span>
                    <button class="btn-delete" onclick="deleteScan(${item.id})">✕</button>
                </div>
            `;
            list.appendChild(li);
        });
        document.getElementById('grand-total').innerText = grandTotal.toFixed(2) + " €";
    });
}

window.deleteScan = function(id) {
    if(!confirm("Obrisati?")) return;
    fetch(`/api/skeniraj/${id}`, { method: 'DELETE' }).then(res => res.json()).then(d => { if(d.success) loadMyScans(); });
}
window.openEdit = function(id, naziv, kol) {
    editingId = id; document.getElementById('edit-item-name').innerText = naziv; document.getElementById('edit-quantity').value = kol;
    document.getElementById('edit-modal').classList.remove('hidden'); setTimeout(() => document.getElementById('edit-quantity').focus(), 100);
}
function updateScan() {
    const newQty = document.getElementById('edit-quantity').value;
    fetch(`/api/skeniraj/${editingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kolicina: newQty }) })
    .then(res => res.json()).then(data => { if(data.success) { document.getElementById('edit-modal').classList.add('hidden'); loadMyScans(); showToast(); } });
}