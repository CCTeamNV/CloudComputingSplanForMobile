# CLAUDE.md

Gemeinsamer Kontext für alle Claude-Code-Sessions im Team. Bei Architekturänderungen: ADR in `docs/decisions/` anlegen und diese Datei aktualisieren.

## Projekt

Semesterprojekt Cloud Computing (Bachelor Software Engineering, HS Heilbronn), 2 Personen, **Abgabe 18.01.2027**.
Stundenplan-App ähnlich SPLAN mit mobile-first UI. Aufgabenstellung: `docs/assignment.md`.
Bewertet werden die 7 Abschnitte in `README.md`: Architecture, Infrastructure as Code, Security, Monitoring,
User Experience, Scalability & Load Testing, Pricing.

**MVP:** mobile Tages-/Wochenansicht, persönlicher Plan (Kurse abonnieren), Ausfälle/Raumänderungen im Plan markiert,
iCal-Abo, Admin-UI (Kurse/Termine/Rollen), Dozent sagt eigene Termine ab bzw. ändert Raum, Account löschen.
**Nice-to-have:** Push/E-Mail-Benachrichtigungen, Offline-Cache.

## Tech-Stack

- AWS `eu-central-1`, Terraform (>= 1.10) für alles
- Zwei AWS-Accounts (je Teammitglied einer, kein geteilter Zugriff), jeder mit eigener dev- und prod-Instanz;
  Referenz für Lasttest und Präsentation ist `048861330600` (ADR 0012)
- Frontend: React-PWA, Vite, TypeScript, Tailwind, shadcn/ui; S3 + CloudFront (OAC)
- Backend: API Gateway HTTP API + Lambda (Node.js, TypeScript, esbuild), Powertools for AWS Lambda (TS)
- Daten: DynamoDB on-demand, Single-Table-Design (`docs/decisions/0003-dynamodb-single-table.md`)
- Auth: Cognito User Pool; Gruppen `lecturer`, `admin`; ohne Gruppe = Student
- Monitoring: CloudWatch Logs/Metrics/Dashboard, X-Ray, SNS-E-Mail-Alarme
- Lasttest: k6 als Container auf ECS Fargate (on-demand)
- CI/CD: GitHub Actions mit OIDC (keine Access Keys)
- Monorepo mit npm workspaces (`frontend`, `backend`)

## Struktur

```
frontend/                React-PWA inkl. /admin-Bereich (lazy geladen)
backend/functions/<name> je eine Lambda pro Domäne: catalog, student, lecturer, admin, ical, pre-signup
backend/shared/          Datenmodell-Typen, DynamoDB-Zugriff
infra/bootstrap/         State-Bucket + GitHub-OIDC-Rolle (lokaler State, 1x pro Account)
infra/modules/           auth, api, data, frontend, monitoring, loadtest
infra/envs/{dev,prod}/   Root-Module, je eigener State-Key
loadtest/                k6-Skripte + Dockerfile
scripts/                 Seed- und Hilfsskripte
docs/decisions/          ADRs
```

## Befehle (geplant, noch nicht implementiert)

```bash
# anmelden (kurzlebige Credentials, keine Access Keys)
aws login --profile splan && export AWS_PROFILE=splan

# einmal pro Account
cd infra/bootstrap && terraform init && terraform apply

# Umgebung deployen / zerstören
cd infra/envs/dev && terraform init && terraform apply
cd infra/envs/dev && terraform destroy

npm ci                      # alle Workspaces
npm run build -w backend    # Lambdas bündeln (esbuild) -> von Terraform gezippt
npm run dev -w frontend     # lokales Frontend gegen dev-API
npm test --workspaces
npm run lint                # oxlint (Warnungen = Fehler) + Prettier-Check
npm run format              # Prettier schreibt
```

Frontend-Deploy macht CI nach `terraform apply`: `aws s3 sync` (ohne `config.json`); `index.html` und `config.json` cacht
CloudFront nicht, daher keine Invalidation nötig. Die Laufzeitkonfiguration
(API-URL, Cognito-IDs) schreibt Terraform als `config.json` in den Bucket, damit ein Build für alle Umgebungen reicht.

## Konventionen

- Code, Bezeichner, Commits: **Englisch**. README, ADRs, Doku: **Deutsch**.
- Trunk-based: kurze Feature-Branches von `main`, PR mit Review durch die andere Person, Conventional Commits
  (`feat:`, `fix:`, `infra:`, `docs:` …).
- CI (`.github/workflows/ci.yml`): PR → Tests + `terraform plan` in der Job-Zusammenfassung; Merge auf `main` → Deploy dev; Release-Tag `v*` → Deploy prod
  (manuelle Freigabe über GitHub Environment). Jeweils per Matrix in beide Accounts.
- API-Vertrag ist `docs/api.yaml` (OpenAPI 3.1). Erst den Vertrag per PR ändern, dann implementieren.
  Prüfen: `npx @redocly/cli lint docs/api.yaml`.
- Autorisierung **immer im Backend**: API Gateway prüft das JWT, die Lambda prüft Gruppe (`cognito:groups`) und
  Besitz (Dozent nur eigene Kurse). Das UI blendet nur aus, es schützt nichts.
- Eine IAM-Rolle pro Lambda, nur die nötigen Aktionen auf konkrete ARNs. Kein `*` bei Actions oder Resources ohne
  Begründung im Code-Kommentar.
- Logs: strukturiertes JSON, **keine personenbezogenen Daten** (keine E-Mails, keine Tokens), Retention 30 Tage.

## Leitplanken

- **Idle-Kosten nahe 0 €.** Kein NAT Gateway, kein Load Balancer, keine dauerhaft laufende DB/Tasks, kein WAF.
  Wer einen Dienst mit Grundgebühr einführen will, schreibt vorher ein ADR.
- `terraform apply` auf leerem Account und `terraform destroy` ohne manuelle Schritte: S3-Buckets mit
  `force_destroy`, ECR mit `force_delete`, Cognito `deletion_protection` nur in prod.
- **Keine Secrets oder Access Keys im Repo.** Falls nötig: SSM Parameter Store (SecureString).
- Lieber klein und sauber als groß und halbfertig.

## Bekannte Stolpersteine

- Die Accounts laufen im **AWS Free Plan** (`048861330600`: Ablauf 05.04.2027). **Keine AWS Organization anlegen**:
  das stellt auf den kostenpflichtigen Tarif um und das Guthaben verfällt. Deshalb kein IAM Identity Center; Menschen
  nutzen IAM-User mit MFA und `aws login`. Root-Access-Keys nicht verwenden.
  Status: `aws freetier get-account-plan-state`.

- Neue AWS-Accounts haben oft nur 10 Lambda-Concurrency: früh Quota-Erhöhung beantragen (Service Quotas).
- Cognito-Standard-E-Mail-Versand ist auf wenige Mails/Tag begrenzt: Testuser per Seed-Skript ohne E-Mail anlegen.
- SNS-E-Mail-Subscriptions müssen einmal per Link bestätigt werden.
