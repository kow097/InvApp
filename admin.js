// Pokreni: node admin.js "Ime" PIN
const db = require('./database');
const args = process.argv.slice(2);

if (args.length < 2) {
    console.log("⚠️ Korištenje: node admin.js <Ime> <PIN>");
    process.exit(1);
}

const ime = args[0];
const pin = args[1];

setTimeout(() => {
    db.run("INSERT INTO korisnici (ime, pin) VALUES (?, ?)", [ime, pin], function(err) {
        if (err) console.error("❌ Greška (vjerojatno PIN već postoji).");
        else console.log(`✅ Dodan radnik: ${ime} (PIN: ${pin})`);
        process.exit(0);
    });
}, 500);