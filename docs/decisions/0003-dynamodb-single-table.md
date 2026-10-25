# 0003: DynamoDB on-demand mit Single-Table-Design

- Status: akzeptiert
- Datum: 2026-10-23

## Kontext

Die Zugriffsmuster sind wenige und bekannt: Kurse eines Studiengangs/Semesters, Termine eines Kurses pro Zeitraum,
Abos eines Users, Lookup per iCal-Token. Die DB soll im Idle nichts kosten und kein VPC erzwingen.

## Optionen

1. DynamoDB on-demand: 0 € Compute im Idle, kein VPC, skaliert automatisch; NoSQL-Modellierung nötig
2. Aurora Serverless v2 (Postgres): SQL, kann auf 0 skalieren, aber Kaltstart, VPC, Lambda im VPC, Secret
3. RDS t4g.micro: dauerhafte Kosten, skaliert nicht elastisch

## Entscheidung

DynamoDB on-demand, eine Tabelle:

| Entität | PK | SK | Weitere Attribute |
|---|---|---|---|
| Studiengang | `PROGRAMS` | `PROGRAM#<id>` | name, semesters (nur per Seed gepflegt) |
| Kurs | `COURSE#<id>` | `META` | name, programId, semester, lecturerId, lecturerName; GSI1PK `PROGRAM#<p>#SEM#<n>`, GSI2PK `LECTURER#<sub>` |
| Termin | `COURSE#<id>` | `SESSION#<sessionId>` | start, end, room, kind, courseName, cancelled, originalRoom, note, updatedAt |
| Abo | `USER#<sub>` | `SUB#<courseId>` | |
| iCal-Token des Users | `USER#<sub>` | `ICAL` | tokenHash |
| iCal-Token-Lookup | `ICAL#<tokenHash>` | `META` | userId |

`sessionId` = `<Start UTC als yyyyMMddTHHmmZ>-<6 Zeichen Zufall>`, z. B. `20261102T0700Z-k3x9qa`. Dadurch ist der SK
nach Start sortiert, und Zeitraumabfragen laufen per `between` auf dem SK. Ein Termin ist geändert, wenn
`originalRoom` gesetzt ist; abgesagt, wenn `cancelled = true`. `courseName` ist denormalisiert für die Planansicht.

Persönlicher Plan: Abos des Users abfragen, dann je Kurs die Termine im Zeitraum.
Dozentenansicht: Kurse über GSI2 (`LECTURER#<sub>`).

## Konsequenzen

- Kein NAT Gateway, keine DB-Secrets.
- N+1-Abfragen beim persönlichen Plan (N = Anzahl Abos, typisch < 10), parallel ausgeführt. Bei Bedarf später
  denormalisieren.
- Ad-hoc-Abfragen und Reports sind schwieriger als mit SQL.
- Verschiebt ein Admin den Start eines Termins, ändert sich die `sessionId` (Item wird neu geschrieben).
- Benennt ein Admin einen Kurs um, muss `courseName` in allen Terminen mit aktualisiert werden.
- Studiengänge haben im MVP keine Admin-UI, nur das Seed-Skript.
