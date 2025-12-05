const express = require('express');
const bodyParser = require('body-parser');
const db = require('./database');
const path = require('path');
const xlsx = require('xlsx');
const { exec } = require('child_process');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- 1. LOGIN ---
app.post('/api/login', (req, res) => {
    const { pin } = req.body;
    db.get("SELECT ime FROM korisnici WHERE pin = ?", [pin], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) res.json({ success: true, ime: row.ime });
        else res.json({ success: false, message: "Netočan PIN" });
    });
});

// --- 2. KORISNICI ---
app.get('/api/users', (req, res) => {
    db.all("SELECT * FROM korisnici ORDER BY ime ASC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.post('/api/users', (req, res) => {
    const { ime, pin } = req.body;
    if(!ime || !pin) return res.status(400).json({ error: "Fale podaci" });
    db.run("INSERT INTO korisnici (ime, pin) VALUES (?, ?)", [ime, pin], function(err) {
        if (err) return res.status(500).json({ error: "Vjerojatno PIN već postoji!" });
        res.json({ success: true, id: this.lastID });
    });
});

app.delete('/api/users/:id', (req, res) => {
    db.run("DELETE FROM korisnici WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- 3. SKENIRANJE I PRETRAGA ---

// NOVO: Live Search ruta
app.get('/api/search', (req, res) => {
    const q = req.query.q;
    if (!q || q.length < 2) return res.json({ data: [] }); // Ne traži ako je manje od 2 slova

    // Tražimo po barkodu ILI po nazivu (limitiramo na 20 rezultata da ne gušimo mobitel)
    const sql = `SELECT * FROM artikli WHERE naziv LIKE ? OR barkod LIKE ? LIMIT 20`;
    const param = `%${q}%`; // % znači "bilo što prije ili poslije"

    db.all(sql, [param, param], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.get('/api/artikl/:barkod', (req, res) => {
    const barkod = req.params.barkod;
    db.get("SELECT * FROM artikli WHERE barkod = ?", [barkod], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (row) res.json({ success: true, data: row });
        else res.json({ success: false, message: "Nije pronađen" });
    });
});

app.post('/api/skeniraj', (req, res) => {
    const { barkod, naziv, kolicina, korisnik } = req.body;
    if (!korisnik) return res.status(400).json({ error: "Nema korisnika" });
    const sql = "INSERT INTO skenovi (barkod, naziv, kolicina, korisnik) VALUES (?, ?, ?, ?)";
    db.run(sql, [barkod, naziv, kolicina, korisnik], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.get('/api/skenovi', (req, res) => {
    const korisnik = req.query.korisnik;
    const sql = `
        SELECT s.id, s.barkod, s.naziv, s.kolicina, a.cijena 
        FROM skenovi s 
        LEFT JOIN artikli a ON s.barkod = a.barkod 
        WHERE s.korisnik = ? 
        ORDER BY s.id DESC
    `;
    db.all(sql, [korisnik], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ data: rows });
    });
});

app.put('/api/skeniraj/:id', (req, res) => {
    const { kolicina } = req.body;
    db.run("UPDATE skenovi SET kolicina = ? WHERE id = ?", [kolicina, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/skeniraj/:id', (req, res) => {
    db.run("DELETE FROM skenovi WHERE id = ?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// --- 4. EXPORT ---
app.get('/api/export', (req, res) => {
    const INPUT_FILE = 'baza.xlsx';
    if (!fs.existsSync(INPUT_FILE)) return res.status(500).send("Greška: Nema datoteke baza.xlsx!");

    const sqlSumarno = `SELECT barkod, SUM(kolicina) as ukupno FROM skenovi GROUP BY barkod`;
    db.all(sqlSumarno, [], (err, scannedRows) => {
        if (err) return res.status(500).send("Greška baze");
        
        const skeniranoMap = {};
        scannedRows.forEach(row => skeniranoMap[row.barkod] = row.ukupno);

        try {
            const workbook = xlsx.readFile(INPUT_FILE);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(worksheet, { header: "A", defval: "" });

            if (data.length > 0) data[0]['Y'] = "Inventura_Kolicina";

            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                const barkod = row['N'] ? String(row['N']).trim() : null;
                row['Y'] = (barkod && skeniranoMap[barkod]) ? skeniranoMap[barkod] : 0;
            }

            const newSheet = xlsx.utils.json_to_sheet(data, { header: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y"], skipHeader: true });
            const newWorkbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(newWorkbook, newSheet, "Stanje");
            const buffer = xlsx.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });
            
            res.setHeader('Content-Disposition', `attachment; filename="Inventura_Popunjena_${new Date().toISOString().slice(0,10)}.xlsx"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);
        } catch (e) { res.status(500).send("Greška Excela: " + e.message); }
    });
});

// --- 5. SHUTDOWN ---
app.post('/api/shutdown', (req, res) => {
    res.json({ success: true });
    setTimeout(() => { exec('taskkill /F /IM node.exe /IM ngrok.exe', () => process.exit(0)); }, 1000);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER POKRENUT (HTTP)`);
});