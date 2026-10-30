# 0012: Zwei AWS-Accounts mit je dev und prod, Zugriff ohne langlebige Keys

- Status: akzeptiert
- Datum: 2026-10-25

## Kontext

Beide Teammitglieder haben je einen eigenen AWS-Account im **Free Plan** (Guthaben ~100 $, kein geteilter Zugriff).
Eine AWS Organization würde den Free Plan beenden und das Guthaben sofort verfallen lassen, daher ist IAM Identity
Center keine Option. Root-Access-Keys sollen nicht genutzt werden.

## Optionen

1. Ein gemeinsamer Account, der Partner bekommt dort einen IAM-User
2. dev in einem, prod im anderen Account
3. Jeder Account betreibt eine vollständige Instanz mit dev und prod

## Entscheidung

Option 3. Die Terraform-Konfiguration ist account-neutral; jeder Account wird mit `infra/bootstrap` vorbereitet und
hat eigenen State-Bucket, eigene OIDC-Rolle, eigenes Budget. CI deployt per Matrix in beide Accounts.

**Referenz-Account** für Lasttest, Screenshots und Präsentation ist der Account `048861330600` (Noa), weil dort die
Lambda-Quota-Erhöhung bereits beantragt ist. Der Lasttest läuft nur dort.

**Menschlicher Zugriff:** je Account ein IAM-User in der Gruppe `admins` (AdministratorAccess) mit Konsolen-Passwort
und MFA. Die CLI nutzt `aws login` (Browser-Login, kurzlebige Credentials, keine Access Keys).
Root-Access-Keys werden gelöscht, Root nur mit MFA und nur für Account-Aufgaben.

## Konsequenzen

- Doppeltes Guthaben; `apply` auf leerem Account wird zweimal bewiesen.
- Jede Person sieht Logs und Dashboards nur im eigenen Account; Fehler in der Instanz des anderen werden gemeinsam
  am Bildschirm untersucht.
- Die Instanzen haben getrennte Cognito-User und Daten; das Seed-Skript sorgt für denselben Ausgangsstand.
- CI braucht pro Account eine Rollen-ARN (GitHub-Variable, kein Secret).
- AdministratorAccess für Menschen ist bewusst grob; Least Privilege gilt für alle Maschinenrollen (Lambdas, CI).
