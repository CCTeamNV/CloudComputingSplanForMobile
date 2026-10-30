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

Jeder Schritt läuft per Matrix gegen beide Accounts (ADR 0012); die Rollen-ARNs stehen als GitHub-Variablen
(keine Secrets) im jeweiligen Environment. Die Trust Policy der Rolle erlaubt nur dieses Repo; Plan-Rolle (read-only) und Apply-Rollen pro Environment getrennt.

## Konsequenzen

- Keine Secrets im Repo oder in GitHub.
- Die Apply-Rolle braucht weitreichende Rechte (sie legt IAM-Rollen an); das begrenzen wir über die Trust Policy
  auf `main`/Environment und dokumentieren es als Restrisiko.
