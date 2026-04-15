// Pokreni s: node import.js
const xlsx = require('xlsx');
const db = require('./database');
const fs = require('fs');

const INPUT_FILE = 'baza.xlsx';

console.log(`⏳ Tražim datoteku: ${INPUT_FILE}...`);

// Provjera postoji li file uopće
if (!fs.existsSync(INPUT_FILE)) {
    console.error("❌ GREŠKA: Ne vidim datoteku 'baza.xlsx'!");
    console.error("👉 Provjeri nalazi li se 'baza.xlsx' u ISTOJ mapi gdje i ovaj 'import.js'.");
    process.exit(1);
}

try {
    console.log(`✅ Datoteka pronađena. Učitavam Excel...`);
    const workbook = xlsx.readFile(INPUT_FILE);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const data = xlsx.utils.sheet_to_json(worksheet, { header: "A", defval: "" });
    const rows = data.slice(1); // Preskačemo header

    console.log(`Pronađeno ${rows.length} redova. Ubacujem u bazu...`);

    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        db.run("DELETE FROM artikli"); 

        const stmt = db.prepare("INSERT INTO artikli (sifra, naziv, cijena, barkod) VALUES (?, ?, ?, ?)");
        let count = 0;

        rows.forEach(row => {
            // A=ID, B=Naziv, F=Cijena, N=Barkod
            const sifra = row['A'] ? String(row['A']).trim() : null;
            const naziv = row['B'] ? String(row['B']).trim() : "Nepoznat naziv";
            
            // Čišćenje cijene (1,49 kn -> 1.49)
            let rawCijena = row['F'] ? String(row['F']) : "0";
            rawCijena = rawCijena.replace(/kn/gi, "").replace(/\s/g, "").replace(",", ".").trim();
            const cijena = parseFloat(rawCijena) || 0;

            const barkod = row['N'] ? String(row['N']).trim() : null;

            if (barkod) {
                stmt.run(sifra, naziv, cijena, barkod);
                count++;
            }
        });

        stmt.finalize();
        db.run("COMMIT", () => {
            console.log(`\n🎉 USPJEH! Uvezeno ${count} artikala.`);
            console.log("Sada možeš pokrenuti aplikaciju (pokreni.bat).");
        });
    });

} catch (err) {
    console.error("\n❌ KRITIČNA GREŠKA:", err.message);
}