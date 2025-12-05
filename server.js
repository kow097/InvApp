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

// --- 3. SKENIRANJE ---
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

// NOVO: Dohvaćamo i cijenu artikla (JOIN) da možemo računati total na mobitelu
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

// --- 4. PAMETNI EXPORT (UČITAVA TVOJU BAZU I DODAJE STUPAC Y) ---
app.get('/api/export', (req, res) => {
    const INPUT_FILE = 'baza.xlsx';

    if (!fs.existsSync(INPUT_FILE)) {
        return res.status(500).send("Greška: Nema datoteke baza.xlsx na serveru!");
    }

    // 1. Prvo dohvati sve zbrojene količine iz baze
    const sqlSumarno = `
        SELECT barkod, SUM(kolicina) as ukupno 
        FROM skenovi 
        GROUP BY barkod
    `;

    db.all(sqlSumarno, [], (err, scannedRows) => {
        if (err) return res.status(500).send("Greška baze pri exportu");

        // Pretvori rezultate u mapu radi bržeg pretraživanja:  {'barkod123': 50, 'barkod456': 12}
        const skeniranoMap = {};
        scannedRows.forEach(row => {
            skeniranoMap[row.barkod] = row.ukupno;
        });

        try {
            // 2. Učitaj originalnu Excelicu
            const workbook = xlsx.readFile(INPUT_FILE);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Pretvori u JSON (header: "A" znači da zadržavamo strukturu stupaca A, B, C...)
            const data = xlsx.utils.sheet_to_json(worksheet, { header: "A", defval: "" });

            // 3. Dodaj zaglavlje u stupac Y (u prvom redu)
            if (data.length > 0) {
                data[0]['Y'] = "Inventura_Kolicina";
            }

            // 4. Prođi kroz sve ostale redove i upiši količine
            for (let i = 1; i < data.length; i++) {
                const row = data[i];
                const barkodIzExcela = row['N'] ? String(row['N']).trim() : null; // Tvoj barkod je u N

                if (barkodIzExcela && skeniranoMap[barkodIzExcela]) {
                    // Ako imamo taj barkod skeniran, upiši količinu
                    row['Y'] = skeniranoMap[barkodIzExcela];
                } else {
                    // Ako nije skeniran, piši 0
                    row['Y'] = 0;
                }
            }

            // 5. Kreiraj novi Sheet i Workbook
            const newSheet = xlsx.utils.json_to_sheet(data, { header: ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y"], skipHeader: true });
            const newWorkbook = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(newWorkbook, newSheet, "Stanje");

            // 6. Pošalji nazad
            const buffer = xlsx.write(newWorkbook, { type: 'buffer', bookType: 'xlsx' });
            const dateStr = new Date().toISOString().slice(0,10);
            res.setHeader('Content-Disposition', `attachment; filename="Inventura_Popunjena_${dateStr}.xlsx"`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.send(buffer);

        } catch (excelErr) {
            console.error(excelErr);
            res.status(500).send("Greška pri obradi Excela: " + excelErr.message);
        }
    });
});

// --- 5. RUTA ZA GAŠENJE ---
app.post('/api/shutdown', (req, res) => {
    res.json({ success: true });
    setTimeout(() => {
        exec('taskkill /F /IM node.exe /IM ngrok.exe', () => process.exit(0));
    }, 1000);
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 SERVER POKRENUT (HTTP)`);
});