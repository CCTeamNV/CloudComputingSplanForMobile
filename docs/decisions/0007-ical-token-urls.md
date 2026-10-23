# 0007: iCal-Abo über geheime Token-URLs

- Status: akzeptiert
- Datum: 2026-10-23

## Kontext

Kalender-Apps (Google, Apple, Outlook) rufen eine URL periodisch ab und können kein JWT senden.
Der Feed enthält den persönlichen Plan und soll nicht öffentlich sein.

## Optionen

1. Öffentlicher Feed pro Kurs: kein Personenbezug, aber kein persönlicher Plan
2. Geheimer, zufälliger Token in der URL pro User
3. Basic Auth: von vielen Kalender-Apps schlecht unterstützt

## Entscheidung

Option 2: `/ical/<token>` mit 256 Bit Zufall. Gespeichert wird nur der SHA-256-Hash. Der User kann den Token
jederzeit neu erzeugen, der alte wird dabei ungültig. Die `ical`-Lambda hat nur Leserechte.

## Konsequenzen

- Wer die URL kennt, sieht den Plan; das ist bei Kalender-Abos üblich und wird in der UI erklärt.
- Token dürfen nicht geloggt werden (API-Gateway-Access-Logs ohne vollen Pfad bzw. maskiert).
