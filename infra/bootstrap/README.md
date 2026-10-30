# bootstrap

Einmal pro AWS-Account (ADR 0004, 0005). Legt an:

- State-Bucket `splan-tfstate-<account-id>` (versioniert, verschlüsselt, nur TLS, natives Locking)
- GitHub-OIDC-Provider und CI-Rollen:
  - `splan-gha-plan`: ReadOnly + State, für PRs und `main`
  - `splan-gha-apply-<env>`: nur für Jobs im GitHub Environment `<env>`
- Budget `splan-monthly` (50 USD, Alarme bei 20/50/100 %, Kosten vor Abzug der Credits)

State bleibt lokal (`terraform.tfstate`, gitignored).

## Ausführen

```bash
aws login --profile splan && export AWS_PROFILE=splan
cd infra/bootstrap
cp terraform.tfvars.example terraform.tfvars   # E-Mail eintragen
terraform init
terraform apply
```

Die Outputs (`plan_role_arn`, `apply_role_arns`) kommen als Variablen in GitHub (keine Secrets).

## Abbauen

Erst alle `infra/envs/*` zerstören, dann hier `terraform destroy`. Der State-Bucket wird samt Inhalt gelöscht.
