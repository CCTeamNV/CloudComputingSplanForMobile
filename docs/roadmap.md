# Roadmap bis zur Abgabe am 18.01.2027

Rollen: **A** = Frontend/UX, **B** = Infra/Backend. Jeder PR wird von der anderen Person reviewt.
Grundsatz: früh deployen, jede Woche läuft `main` auf dev.

## M0: Fundament (bis 01.11.)

- [ ] B: Lambda-Concurrency-Quota-Erhöhung beantragen (neue Accounts haben oft nur 10)
- [ ] B: AWS Budget mit Alarmen 10/25/50 € (zuerst, noch vor allem anderen)
- [ ] B: `infra/bootstrap` (State-Bucket, OIDC-Rolle), `envs/dev`, CI-Workflow plan/apply
- [ ] B: Walking Skeleton: `GET /health`-Lambda hinter API Gateway
- [ ] A: Vite-React-App mit Tailwind und shadcn/ui, auf S3/CloudFront deployt
- [ ] A+B: API-Vertrag (OpenAPI) und Datenmodell festlegen (ADR 0003)
- [ ] A+B: Repo-Konventionen, npm workspaces, Lint/Format, PR-Template

## M1: Login und persönlicher Plan (bis 15.11.)

- [ ] B: Modul `auth` (Cognito, Pre-Sign-up-Lambda, Gruppen)
- [ ] B: Modul `data` (DynamoDB), Seed-Skript (Studiengang SEB, Admin-/Dozenten-/Testuser)
- [ ] B: Lambdas `catalog` und `student` (Abos, persönlicher Plan)
- [ ] A: Sign-up/Sign-in, Kurssuche mit Filter, Abonnieren, Tages- und Wochenansicht

## M2: Pflege, Änderungen, iCal (bis 29.11.)

- [ ] B: Lambdas `admin`, `lecturer`, `ical`; Besitzprüfung für Dozierende
- [ ] A: `/admin`-Bereich (Kurse, Termine, Rollen), Dozentenansicht (eigene Termine absagen, Raum ändern)
- [ ] A: Markierung von Ausfällen/Raumänderungen im Plan, iCal-Link kopieren und neu erzeugen

## M3: Betrieb und prod (bis 13.12.)

- [ ] B: Modul `monitoring` (Dashboard, Alarme, X-Ray), Log-Retention, PII-freie Logs
- [ ] B: `envs/prod`, Tag-Deploy mit manueller Freigabe
- [ ] B: Account löschen (DSGVO)
- [ ] A: UX-Feinschliff auf echten Geräten, Barrierefreiheit, Dark Mode, Leer- und Fehlerzustände
- [ ] A+B: erstes Release `v1.0.0` auf prod

## M4: Lasttest (bis 20.12.)

- [ ] B: Modul `loadtest` (VPC mit öffentlichen Subnetzen, ECR, Fargate-Task), Startskript für N Tasks
- [ ] A: k6-Szenario „Semesterstart 7:45 Uhr“ + Spike, Testuser-Tokens im Setup
- [ ] A+B: Testläufe gegen dev, Dashboards und k6-Ergebnisse sichern, Engpässe beheben

## Puffer (21.12.–06.01.)

Nur Fehlerbehebung. Nice-to-haves (Offline-Cache, Benachrichtigungen) nur, wenn M0–M4 vollständig sind.

## M5: Dokumentation und Präsentation (bis 15.01.)

- [ ] A+B: Pricing-Szenarien mit AWS Pricing Calculator, Kosten des Lasttests
- [ ] A: Screenshots für User Experience
- [ ] B: `destroy` → `apply` auf leerem Zustand durchspielen und dokumentieren
- [ ] A+B: alle README-TODOs schließen, Architekturdiagramm aktualisieren, Präsentation proben

## 18.01.2027: Abgabe

## Backlog (Nice-to-have)

- Offline-Cache mit `vite-plugin-pwa`
- Benachrichtigung bei Ausfall abonnierter Kurse (E-Mail via SES oder Web-Push)
- Öffentliche Planansicht ohne Login
