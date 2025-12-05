const sqlite3 = require('sqlite3').verbose();
const dbName = 'inventura.db';

const db = new sqlite3.Database(dbName, (err) => {
    if (err) {
        console.error("Greška baze:", err.message);
    } else {
        console.log("✅ Spojen na SQLite bazu.");
        // WAL mode za brži rad s više korisnika odjednom
        db.run("PRAGMA journal_mode = WAL;");
        initDb();
    }
});

function initDb() {
    // 1. ŠIFARNIK (Podaci iz tvog Excela)
    db.run(`CREATE TABLE IF NOT EXISTS artikli (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sifra TEXT,   -- Stupac A
        naziv TEXT,   -- Stupac C
        cijena REAL,  -- Stupac L
        barkod TEXT   -- Stupac AB
    )`);

    // 2. SKENOVI (Rezultati)
    db.run(`CREATE TABLE IF NOT EXISTS skenovi (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        barkod TEXT,
        naziv TEXT,
        kolicina INTEGER,
        korisnik TEXT,
        vrijeme TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // 3. KORISNICI (PIN sustav)
    db.run(`CREATE TABLE IF NOT EXISTS korisnici (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ime TEXT,
        pin TEXT UNIQUE
    )`);
}

module.exports = db;