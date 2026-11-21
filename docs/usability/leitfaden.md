# Usability-Test: Leitfaden

Für #26: kurzer Test mit 3 Kommiliton:innen. Ziel ist nicht, die App zu bewerten, sondern Stellen zu finden, an denen
Studierende hängen bleiben. Jede Person bekommt ein eigenes Protokoll (`protokoll-vorlage.md` kopieren als
`protokoll-p1.md`, `-p2.md`, `-p3.md`), am Ende fasst `auswertung.md` zusammen.

**Dauer:** ca. 20 Minuten pro Person. **Rollen:** eine Person moderiert, die andere protokolliert.
**Gerät:** das eigene Smartphone der Testperson (iPhone oder Android), damit Gerätetest und Usability-Test zusammenfallen.
**Umgebung:** dev, https://d15dhpnu2ji9c9.cloudfront.net

## Vorbereitung (am Testtag, ca. 15 Minuten)

1. Pro Testperson einen eigenen Testuser: P1 = `k6-001@loadtest.example.com`, P2 = `k6-002…`, P3 = `k6-003…`. Alle haben
   die Kurse aus SEB, 7. Semester abonniert. Passwort aus `.env` (`SEED_PASSWORD`); die moderierende Person tippt es ein.
2. Als `dozent.muster@loadtest.example.com` anmelden, unter „Verwaltung“ → „Meine Termine“:
   - einen Termin von **IT-Sicherheit** in dieser Woche **absagen** (Hinweis z. B. „krank“),
   - bei einem Termin von **Software-Architektur** in dieser Woche den **Raum ändern** (z. B. A.105 → B.210).

   Notieren, welche Termine das sind (für die Lösungen unten). Danach 2–3 Minuten warten, bis die Dateien nachziehen.
3. Prüfen, dass P1–P3 **Programmieren 1** (SEB, 1. Semester) noch nicht abonniert haben; sonst vorher abbestellen.
4. Vor jeder Person: im Browser abmelden, Tabs schließen, die App ggf. vom Homescreen entfernen.

## Einleitung (vorlesen)

> Danke, dass du mitmachst. Wir testen die App, nicht dich: Wenn etwas nicht klappt, liegt es an der App, und genau das
> wollen wir finden. Bitte sag laut, was du denkst, was du suchst und was dich wundert. Ich helfe dir nur, wenn du gar
> nicht weiterkommst. Nach jeder Aufgabe frage ich kurz, wie leicht sie war. Es dauert etwa 20 Minuten.

Dann die Person die App im eigenen Browser öffnen lassen und den Testuser anmelden.

## Aufgaben

Aufgaben einzeln vorlesen, nicht zeigen, wo es geht. Abbruch, wenn die Person nach 2 Minuten nicht weiterkommt oder
selbst aufgibt; dann „mit Hilfe“ oder „nicht gelöst“ notieren.

| Nr. | Aufgabe (vorlesen) | Gelöst, wenn … |
|---|---|---|
| A1 | „Welche Veranstaltung hast du heute als Nächstes, und in welchem Raum?“ | richtige Veranstaltung und Raum aus der Tagesansicht genannt (an einem Tag ohne Termine: „… am nächsten Tag mit Terminen“) |
| A2 | „An welchem Tag hast du diese Woche Cloud Computing im Labor?“ | Mittwoch genannt, Wochenansicht oder Blättern benutzt |
| A3 | „Eine deiner Veranstaltungen diese Woche fällt aus. Welche?“ | der vorbereitete Termin von IT-Sicherheit |
| A4 | „Bei einer Veranstaltung hat sich der Raum geändert. Wo findet sie jetzt statt?“ | Software-Architektur, neuer Raum genannt |
| A5 | „Du willst zusätzlich Programmieren 1 aus dem 1. Semester mitschreiben. Füge den Kurs deinem Plan hinzu.“ | Kurs abonniert (Button zeigt „Abonniert“) |
| A6 | „Du hast es dir anders überlegt. Nimm den Kurs wieder raus.“ | Kurs abbestellt |
| A7 | „Du möchtest deine Termine in deinem Handykalender sehen. Wie würdest du das einrichten?“ | Kalender-Link unter „Konto“ gefunden (ggf. erzeugt) und kopiert; ein echtes Abo ist nicht nötig. Den Link nicht neu erzeugen lassen, wenn schon einer da ist |
| A8 | „Leg dir die App auf den Homescreen, damit du sie wie eine normale App öffnen kannst.“ | Icon auf dem Homescreen, App öffnet ohne Browserleiste |
| A9 | „Wo würdest du dein Konto löschen? Zeig es mir, aber lösch es nicht.“ | „Account löschen“ unter „Konto“ gezeigt, **vor** der Bestätigung gestoppt |

Optional, falls eine Testperson die Dozentensicht ausprobieren soll (Account `dozent.beispiel@…`):

| Nr. | Aufgabe | Gelöst, wenn … |
|---|---|---|
| D1 | „Du bist krank. Sag deine nächste Cloud-Computing-Vorlesung ab.“ | Termin abgesagt, mit oder ohne Hinweis |
| D2 | „Nimm die Absage wieder zurück.“ | Absage zurückgenommen |

**Nach jeder Aufgabe** fragen: „Wie leicht oder schwer war das, von 1 = sehr schwer bis 7 = sehr leicht?“
(Single Ease Question, SEQ).

## Abschluss

1. Fragebogen SUS (10 Aussagen, im Protokoll) von der Testperson selbst ausfüllen lassen.
2. Offene Fragen: „Was hat dich am meisten gestört?“, „Was fandest du gut?“, „Würdest du die App statt SPLAN nutzen?
   Warum (nicht)?“
3. Aufräumen: Programmieren 1 abbestellen, falls noch abonniert. Nach allen Tests die Absage und die Raumänderung aus
   der Vorbereitung als Dozent zurücknehmen.

## Was protokollieren

- **Ergebnis je Aufgabe:** gelöst / mit Hilfe / nicht gelöst, Zeit in Sekunden (grob reicht), SEQ.
- **Beobachtungen:** wörtliche Zitate beim lauten Denken, falsche Klicks, Zögern, Umwege, Missverständnisse.
- **Befunde:** jeder Stolperstein als ein Satz mit Schweregrad:
  - **3 kritisch:** Aufgabe nicht lösbar ohne Hilfe,
  - **2 mittel:** gelöst, aber mit deutlichem Umweg oder Fehler,
  - **1 leicht:** kurzes Zögern, Wording, Kosmetik.

Abnahme #26: Jeder Befund mit Schweregrad 2 oder 3 wird als Issue angelegt oder direkt behoben (in `auswertung.md`
verlinken).
