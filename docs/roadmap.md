# Roadmap bis zur Abgabe am 18.01.2027

Rollen: **A** = Frontend/UX, **B** = Infra/Backend. B hat Noa umgesetzt; A ist offen, den Login (#14) übernimmt Noa.
Jeder PR wird von der anderen Person reviewt. Jede Person betreibt dev und prod im eigenen Account (ADR 0012).
Grundsatz: früh deployen, jede Woche läuft `main` auf dev.

Stand: 14.11.2026. Backend bis M2 fertig und in dev live geprüft; Frontend hängt hinter M1 (nur Login in Arbeit).

## M0: Fundament (bis 01.11.)

Account-Setup, **jede Person im eigenen Account**:

- [ ] AWS Budget mit Alarmen bei 20/50/100 % von 50 $ (Noa: erledigt, `splan-monthly`; Teampartner: offen, #5)
- [ ] IAM-User in Gruppe `admins` mit MFA, `aws login` eingerichtet, Root-Access-Keys gelöscht (Noa: erledigt; Teampartner: offen, #5)
- [x] Lambda-Concurrency-Quota prüfen; im Referenz-Account auf 1.000 erhöhen (genehmigt: 1.000)

Projekt:

- [x] B: `infra/bootstrap` (State-Bucket, OIDC-Rolle), `envs/dev`, CI-Workflow plan/apply (#3, #4)
- [x] B: Walking Skeleton: `GET /health`-Lambda hinter API Gateway (#4)
- [x] A: Vite-React-App mit Tailwind und shadcn/ui, auf S3/CloudFront deployt (#38, #41)
- [x] A+B: API-Vertrag (`docs/api.yaml`) und Datenmodell (ADR 0003) entworfen; gemeinsam reviewen
- [x] A+B: Repo-Konventionen, npm workspaces, Lint/Format, PR-Template (#40)

## M1: Login und persönlicher Plan (bis 15.11.)

- [x] B: Modul `auth` (Cognito, Pre-Sign-up-Lambda, Gruppen) (#43)
- [x] B: Modul `data` (DynamoDB), Seed-Skript (Studiengang SEB, Admin-/Dozenten-/Testuser) (#42, #44, #48)
- [x] B: Lambda `catalog` als Publisher statischer JSON-Dateien, Lambda `student` (Abos, signierte URLs; ADR 0013) (#45, #46, #47, #49)
- [ ] A: Sign-up/Sign-in (PR #54), Kurssuche mit Filter, Abonnieren (#15), Tages- und Wochenansicht (#16)

## M2: Pflege, Änderungen, iCal (bis 29.11.)

- [x] B: Lambdas `admin`, `lecturer`, `ical`; Besitzprüfung für Dozierende (#50, #51, #52)
- [ ] A: `/admin`-Bereich (Kurse, Termine, Rollen) (#20), Dozentenansicht (eigene Termine absagen, Raum ändern) (#21)
- [ ] A: Markierung von Ausfällen/Raumänderungen im Plan, iCal-Link kopieren und neu erzeugen (#22)

## M3: Betrieb und prod (bis 13.12.)

- [ ] B: Modul `monitoring` (Dashboard, Alarme inkl. `IteratorAge` des Streams, X-Ray), Log-Retention, PII-freie Logs (#23; Retention 30 Tage und PII-freie Logs schon umgesetzt)
- [ ] B: `envs/prod`, Tag-Deploy mit manueller Freigabe (#24)
- [ ] B: Account löschen (DSGVO) (Backend #53 fertig, UI in PR #54; #25)
- [ ] A: UX-Feinschliff auf echten Geräten, Barrierefreiheit, Dark Mode, Leer- und Fehlerzustände (#26)
- [ ] A+B: erstes Release `v1.0.0` auf prod (#27)

## M4: Lasttest (bis 20.12.)

- [ ] B: Modul `loadtest` (VPC mit öffentlichen Subnetzen, ECR, Fargate-Task), Startskript für N Tasks (#28)
- [ ] A: k6-Szenario „Semesterstart 7:45 Uhr“ + Spike, Testuser-Tokens im Setup (#29)
- [ ] A+B: Testläufe gegen dev, Dashboards und k6-Ergebnisse sichern, Engpässe beheben (#30)

## Puffer (21.12.–06.01.)

Nur Fehlerbehebung. Nice-to-haves (Offline-Cache, Benachrichtigungen) nur, wenn M0–M4 vollständig sind.

## M5: Dokumentation und Präsentation (bis 15.01.)

- [ ] A+B: Pricing-Szenarien mit AWS Pricing Calculator, Kosten des Lasttests (#31)
- [ ] A: Screenshots für User Experience (#32)
- [ ] B: `destroy` → `apply` auf leerem Zustand durchspielen und dokumentieren (#33)
- [ ] A+B: alle README-TODOs schließen, Architekturdiagramm aktualisieren (Stand: `docs/splan-architektur.html`), Präsentation proben (#34)

## 18.01.2027: Abgabe

## Backlog (Nice-to-have)

- Offline-Cache mit `vite-plugin-pwa` (#35)
- Benachrichtigung bei Ausfall abonnierter Kurse (E-Mail via SES oder Web-Push) (#36)
