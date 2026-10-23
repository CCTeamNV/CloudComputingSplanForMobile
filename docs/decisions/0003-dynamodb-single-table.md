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
| Kurs | `COURSE#<id>` | `META` | name, program, semester, lecturerId; GSI1PK `PROGRAM#<p>#SEM#<n>` |
| Termin | `COURSE#<id>` | `SESSION#<startISO>#<id>` | end, room, status, originalRoom, note |
| Abo | `USER#<sub>` | `SUB#<courseId>` | |
| iCal-Token des Users | `USER#<sub>` | `ICAL` | tokenHash |
| iCal-Token-Lookup | `ICAL#<tokenHash>` | `META` | userId |

Persönlicher Plan: Abos des Users abfragen, dann je Kurs die Termine im Zeitraum (`begins_with`/`between` auf SK).

## Konsequenzen

- Kein NAT Gateway, keine DB-Secrets.
- N+1-Abfragen beim persönlichen Plan (N = Anzahl Abos, typisch < 10), parallel ausgeführt. Bei Bedarf später
  denormalisieren.
- Ad-hoc-Abfragen und Reports sind schwieriger als mit SQL.
