# 0004: Terraform mit S3-Remote-State, nativem Locking und Bootstrap-Stack

- Status: akzeptiert
- Datum: 2026-10-23

## Kontext

Zwei Personen und CI arbeiten auf denselben Umgebungen. Der State muss geteilt und gesperrt sein.
`apply` auf leerem Account und `destroy` sollen ohne manuelle Schritte funktionieren.

## Optionen

1. Lokaler State: Konflikte, kein CI
2. S3 + DynamoDB-Lock-Tabelle: klassisch, eine Ressource mehr
3. S3 mit nativem Locking (`use_lockfile = true`, Terraform >= 1.10)
4. Terraform Cloud: externer Dienst, zusätzlicher Account

## Entscheidung

Option 3. Ein kleiner Stack `infra/bootstrap/` mit lokalem State legt den versionierten, verschlüsselten
State-Bucket und die GitHub-OIDC-Rolle an. Danach nutzen `infra/envs/dev` und `infra/envs/prod` denselben Bucket mit
eigenem Key. Gemeinsame Logik liegt in `infra/modules/` (auth, api, data, frontend, monitoring, loadtest).

## Konsequenzen

- Der Bootstrap-State liegt lokal; er ist klein und kann bei Verlust per `terraform import` wiederhergestellt werden.
- dev und prod sind identisch aufgebaut, Unterschiede nur über tfvars (z. B. Throttling, `deletion_protection`).
- Für ein sauberes `destroy`: `force_destroy` für Buckets, `force_delete` für ECR.
