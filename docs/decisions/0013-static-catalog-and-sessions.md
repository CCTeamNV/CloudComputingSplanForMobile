# 0013: Katalog und Termine als statische JSON-Dateien über CloudFront

- Status: vorgeschlagen
- Datum: 2026-11-09

## Kontext

Katalog und Termine sind für alle Nutzer gleich und werden viel öfter gelesen als geändert. Geplant war bisher, jede
Leseanfrage über API Gateway, Lambda und DynamoDB zu beantworten (ADR 0003, 0008). Beim Szenario „Semesterstart
7:45 Uhr“ (`loadtest/`) trifft das vor allem `GET /me/schedule`: Jeder Aufruf kostet eine Lambda-Ausführung und N+1
DynamoDB-Abfragen. Der Hinweis auf eine statische Auslieferung kam aus dem Check-in mit dem Dozenten am 2026-11-09.

Randbedingungen: Idle-Kosten nahe 0 €, keine neuen Dienste mit Grundgebühr, eine Absage muss zeitnah sichtbar sein.
Kurse und Termine sollen nur für angemeldete Nutzer sichtbar sein.

## Optionen

1. Wie geplant über Lambda: einfachstes Modell und immer aktuell, aber die Last wächst linear mit jedem Aufruf
2. CloudFront als Cache vor öffentlichen API-Routen (TTL 60 s): kein Publisher nötig, Daten können nicht dauerhaft
   veralten; dafür ein zweiter CloudFront-Origin, und bei jedem abgelaufenen Eintrag laufen wieder Lambda (ggf. mit
   Kaltstart) und DynamoDB
3. Nur der Katalog statisch: wenig Aufwand, aber der teure Weg `/me/schedule` bleibt
4. Katalog und Termine statisch, Generierung bei Änderung: Leselast hängt nicht mehr an Lambda und DynamoDB; dafür
   ein neuer Schreibpfad und bis zu etwa 2 Minuten alte Daten

## Entscheidung

Option 4. Die Lesekapazität wird dann von CloudFront getragen. Pro App-Start bleibt ein API-Aufruf für die Abos, die
einzelnen Planaufrufe erzeugen keine Lambda- oder DynamoDB-Last mehr.

**Dateien** im vorhandenen Frontend-Bucket, ausgeliefert über die vorhandene CloudFront-Distribution:

| Datei | Inhalt | Ersetzt |
|---|---|---|
| `/catalog/programs.json` | Studiengänge | `GET /programs` |
| `/catalog/courses/<programId>/<semester>.json` | Kurse eines Semesters | `GET /courses`, `GET /courses/{courseId}` |
| `/catalog/sessions/<courseId>.json` | alle Termine eines Kurses, nach Start sortiert | `GET /courses/{courseId}/sessions`, `GET /me/schedule` |

Alle Dateien werden mit `Cache-Control: public,max-age=60` geschrieben. Ein neues Cache-Behavior für `/catalog/*`
nutzt Managed-CachingOptimized und übernimmt diesen Wert.

**Zugriffsschutz:** CloudFront kann ein Cognito-JWT nicht selbst prüfen. Deshalb verlangt das Behavior `/catalog/*`
signierte URLs (`trusted_key_groups`):

- `GET /me/subscriptions` liefert zusätzlich `catalogAccess`: die CloudFront-Parameter `Policy`, `Signature` und
  `Key-Pair-Id` einer Custom Policy für `https://<domain>/catalog/*`, 1 Stunde gültig. Die App ruft diese Route ohnehin
  beim Start auf, es entsteht also kein zusätzlicher Aufruf.
- Die App hängt die Parameter an jeden Abruf einer Datei an. CloudFront entfernt sie vor der Weiterleitung, und der
  Cache-Schlüssel enthält keine Query-Strings. Alle Nutzer teilen sich also denselben Cache.
- Der private Schlüssel entsteht per Terraform (`tls_private_key`) und liegt als SecureString im SSM Parameter Store.
  Nur die Lambda `student` darf ihn lesen (`ssm:GetParameter` auf diesen einen Parameter).

Verworfen: Lambda@Edge prüft das JWT zwar direkt, rechnet aber wieder bei jedem Abruf und erschwert
`terraform destroy`, weil erst die Replikate entfernt sein müssen. Signierte Cookies scheiden aus, weil die API auf
einer anderen Domain liegt als CloudFront und dort keine Cookies setzen kann.

**Schreiben:** Die Lambda `catalog` wird vom API-Handler zum Publisher und hängt an einem DynamoDB Stream der Tabelle:

- Ein Event-Source-Filter lässt nur Keys mit `COURSE#` und `PROGRAMS` durch, Nutzerdaten (`USER#`, `ICAL#`) erreichen
  die Funktion also nicht.
- Sie liest den aktuellen Stand aus der Tabelle, statt das Event anzuwenden. Dadurch sind Wiederholungen unschädlich.
- Pro Batch wird jede betroffene Datei einmal geschrieben; ein großer Import erzeugt so keine Schreibflut.
- Wechselt ein Kurs Studiengang oder Semester, werden alte und neue Liste neu geschrieben (`OldImage`, `NewImage`).
- Wird ein Kurs gelöscht, wird auch seine Termindatei gelöscht.
- Rechte: `s3:PutObject` und `s3:DeleteObject` nur auf `<bucket>/catalog/*`, DynamoDB nur Query und GetItem.

**Lesen:** Die App lädt die Abos über `GET /me/subscriptions`, holt je Kurs die Termindatei und baut den Plan im
Client zusammen, inklusive Zeitraumfilter und Sortierung. Dozenten- und Admin-Ansicht lesen dieselben Dateien und
übernehmen nach dem Speichern die Antwort des Schreibaufrufs, damit die eigene Änderung sofort sichtbar ist.

**Felder in den Dateien:** Eine Signatur gilt für alle Dateien und lässt sich bis zum Ablauf weitergeben, deshalb
enthalten die Dateien nur, was der Plan braucht:

| Feld | Enthalten | Grund |
|---|---|---|
| `lecturerId` | nein | interne Cognito-ID |
| `note` | nein | Freitext, kann Personenbezug haben (Beispiel im Vertrag: „Krankheitsbedingt“) |
| `lecturerName` | nein, im Review zu bestätigen | Datensparsamkeit; im MVP nicht erforderlich |

Über die API bleiben `/me/subscriptions*`, `/me/ical-token`, `/me`, `/lecturer/*`, `/admin/*` und `/ical/{token}`.
Die Lambda `ical` liest weiter aus DynamoDB, ihr Feed ist privat (ADR 0007).

Ergänzt ADR 0003 (Zugriffsmuster des persönlichen Plans) und ADR 0008 (Routen und Rechte von `catalog`).

## Konsequenzen

- Die Leselast beim Semesterstart hängt nicht mehr an Lambda-Concurrency und DynamoDB. Beide Wege lassen sich im
  Lasttest vergleichen.
- Die N+1-Abfragen im Backend entfallen; `student` verwaltet nur noch Abos, iCal-Token und das Konto.
- Kein Dienst mit Grundgebühr. Auch CloudFront rechnet pro Anfrage ab; die tatsächliche Ersparnis wird im Abschnitt
  Pricing berechnet.
- Eine Absage ist erst nach Stream-Verzögerung und Cache-Ablauf sichtbar, im Normalfall nach bis zu etwa 2 Minuten.
- Nach Logout oder Kontolöschung bleibt eine ausgestellte Signatur bis zu 1 Stunde gültig. Das betrifft nur die
  Kurs- und Termindaten, keine Nutzerdaten.
- Die öffentliche Planansicht (#37) ist damit ausgeschlossen, solange der Login Pflicht bleibt.
- Der private Schlüssel steht auch im Terraform-State. Der State-Bucket ist privat und nur für die Terraform-Rolle
  gedacht (ADR 0004).
- Scheitert der Publisher dauerhaft, bleiben die Dateien veraltet, obwohl die Tabelle stimmt. Der Stream hält Einträge
  24 Stunden. Deshalb braucht das Monitoring (#23) einen Alarm auf `IteratorAge` und Fehler der Funktion. Fällt ein
  Stream-Batch aus, braucht es ein Skript, das alle Dateien neu erzeugt; das deckt auch seltene Reihenfolgeprobleme
  der aus GSI1 gelesenen Kurslisten ab.
- Die Distribution beantwortet 403 und 404 mit `index.html` und Status 200 (SPA-Deep-Links). Eine fehlende Datei
  liefert also HTML statt JSON, und dasselbe gilt für eine abgelaufene Signatur (403). Der Publisher schreibt daher für
  jeden Kurs eine Datei, auch mit leerer Liste. Bei einer Nicht-JSON-Antwort holt die App einmal `catalogAccess` neu
  und versucht es erneut, danach gilt der Abruf als Fehler.
- `aws s3 sync` im CI-Deploy läuft ohne `--delete` und lässt `catalog/` unangetastet. Wer `--delete` ergänzt, muss
  `catalog/*` ausschließen.
- Terraform: Stream auf der Tabelle, Event-Source-Mapping und S3-Rechte für `catalog`, Schlüsselpaar, Key Group und
  SSM-Parameter (neuer Provider `hashicorp/tls`). Lokale Entwicklung braucht einen
  Vite-Proxy auf `/catalog`, weil die Dateien ohne CORS-Header ausgeliefert werden.
- Betroffen sind #12, #13, #15, #16, #21 und #30. `docs/api.yaml` wird vor der Umsetzung per PR angepasst.
