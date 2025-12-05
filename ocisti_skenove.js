// Pokreni s: node ocisti_skenove.js
const sqlite3 = require('sqlite3').verbose();
const readline = require('readline').createInterface({ input: process.stdin, output: process.stdout });
const db = new sqlite3.Database('inventura.db');

console.log("\n⚠️  OVO BRIŠE SVE SKENIRANE KOLIČINE!");
console.log("ℹ️  Koristi ovo samo kad si preuzeo Excel i prelaziš na NOVO skladište.");
console.log("ℹ️  Popis artikala i radnika OSTAJE u bazi.\n");

readline.question('Upiši "DA" za brisanje: ', (answer) => {
    if (answer === 'DA') {
        db.serialize(() => {
            db.run("DELETE FROM skenovi", (err) => {
                if(!err) {
                    // Reset ID brojača
                    db.run("DELETE FROM sqlite_sequence WHERE name='skenovi'");
                    console.log("✅ Skenovi obrisani. Spremno za novo skladište!");
                } else {
                    console.log("❌ Greška:", err.message);
                }
                process.exit(0);
            });
        });
    } else {
        console.log("Prekinuto.");
        process.exit(0);
    }
});