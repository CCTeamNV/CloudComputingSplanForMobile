# 0005: CI/CD mit GitHub Actions und OIDC

- Status: akzeptiert
- Datum: 2026-10-23

## Kontext

Deployments sollen reproduzierbar sein und keine langlebigen AWS-Access-Keys benötigen.

## Optionen

1. Lokal deployen
2. GitHub Actions mit Access Keys als Repo-Secret
3. GitHub Actions mit OIDC und kurzlebigen Rollen-Credentials

## Entscheidung

Option 3. Ablauf:

- PR: Typecheck, Tests, `terraform plan` (dev) in der Job-Zusammenfassung des Workflows
- Merge auf `main`: `terraform apply` dev, dann Frontend-Deploy (`s3 sync` + Invalidation)
- Tag `v*`: `terraform apply` prod nach manueller Freigabe über ein GitHub Environment

Jeder Schritt läuft per Matrix gegen beide Accounts (ADR 0012). Die Rollennamen sind fest, die CI bildet die ARNs aus
der Repo-Variable `AWS_ACCOUNT_IDS` (keine Secrets). Plan-Rolle (read-only) und Apply-Rollen pro Environment sind
getrennt. Die Trust Policy prüft das unveränderliche OIDC-Subject der Organisation
(`repo:CCTeamNV@<org-id>/CloudComputingSplanForMobile@<repo-id>:…`), damit ein umbenanntes oder neu angelegtes Repo
gleichen Namens keinen Zugriff bekommt.

Das Repo ist **öffentlich**: Bei privaten Repos bietet GitHub Required Reviewers nur im Enterprise-Plan und
Deployment-Branch-Regeln erst ab Pro an. Environment `dev` erlaubt nur Branch `main`, `prod` nur Tags `v*` mit
Freigabe durch eine der beiden Personen. Einrichtung: `infra/bootstrap/README.md`.

## Konsequenzen

- Keine Secrets im Repo oder in GitHub.
- Die Apply-Rolle braucht weitreichende Rechte (sie legt IAM-Rollen an); das begrenzen wir über die Trust Policy
  auf `main`/Environment und dokumentieren es als Restrisiko.
