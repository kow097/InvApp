@echo off
cd /d "%~dp0"

echo ---------------------------------------------------
echo    POKRETANJE SUSTAVA (SERVER + NGROK)
echo ---------------------------------------------------

:: 1. Pokreni Node.js Server u zasebnom prozoru
echo Pokrecem server...
start "INVENTURA SERVER" npm start

:: 2. Pokreni Ngrok u zasebnom prozoru
echo Pokrecem Ngrok...
start "NGROK TUNEL" ngrok http 3000

:: 3. Kratka pauza od 2 sekunde da se serveri stignu upaliti
timeout /t 2 >nul

:: 4. Otvori Admin panel u pregledniku
echo Otvaram Admin Panel...
start "" "http://localhost:3000/admin.html"

echo.
echo ===================================================
echo    SVE JE POKRENUTO!
echo.
echo    1. Pogledaj u prozor "NGROK TUNEL".
echo    2. Kopiraj onaj HTTPS link (Forwarding).
echo    3. Posalji taj link radnicima.
echo ===================================================
echo.
pause