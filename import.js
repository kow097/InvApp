// Pokreni s: node import.js
const xlsx = require('xlsx');
const db = require('./database');

const INPUT_FILE = 'baza.xlsx';

console.log(`⏳ Učitavam ${INPUT_FILE}...`);
console.log(`ℹ️  Ovo može potrajati jer imaš puno artikala.`);

try {
    const workbook = xlsx.readFile(INPUT_FILE);
    const sheetName = workbook.SheetNames[0]; // Uzima prvi list
    const worksheet = workbook.Sheets[sheetName];

    // header: "A" znači da čitamo stupce po slovima (A, B, C...)
    const data = xlsx.utils.sheet_to_json(worksheet, { header: "A", defval: "" });
    
    // Preskačemo prvi red (naslove stupaca)
    const rows = data.slice(1);

    console.log(`Pronađeno ${rows.length} redova. Ubacujem u bazu...`);

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("DELETE FROM artikli"); // Briše stare artikle prije uvoza novih

        const stmt = db.prepare("INSERT INTO artikli (sifra, naziv, cijena, barkod) VALUES (?, ?, ?, ?)");
        let count = 0;

        rows.forEach(row => {
            // --- 1. ID (Stupac A) ---
            const sifra = row['A'] ? String(row['A']).trim() : null;
            
            // --- 2. NAZIV (Stupac B) ---
            const naziv = row['B'] ? String(row['B']).trim() : "Nepoznat naziv";
            
            // --- 3. CIJENA (Stupac F) ---
            // Čistimo format "1,49 kn" u broj 1.49
            let rawCijena = row['F'] ? String(row['F']) : "0";
            // Mičemo "kn", razmake i mijenjamo zarez u točku
            rawCijena = rawCijena.replace(/kn/gi, "").replace(",", ".").trim();
            const cijena = parseFloat(rawCijena) || 0;

            // --- 4. BARKOD (Stupac N) ---
            const barkod = row['N'] ? String(row['N']).trim() : null;

            // Ubacujemo u bazu samo ako artikl ima barkod
            if (barkod) {
                stmt.run(sifra, naziv, cijena, barkod);
                count++;
            }
        });

        stmt.finalize();
        db.run("COMMIT", () => {
            console.log(`✅ USPJEH! Uvezeno ${count} artikala.`);
            console.log("👉 Sada možeš pokrenuti aplikaciju (pokreni.bat)");
        });
    });

} catch (err) {
    console.error("❌ GREŠKA:", err.message);
    console.log("Provjeri zove li se datoteka 'baza.xlsx'.");
}