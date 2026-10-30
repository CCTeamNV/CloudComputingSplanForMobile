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

Die Rollennamen sind fest (`splan-gha-plan`, `splan-gha-apply-<env>`); die CI baut die ARNs aus der Repo-Variable
`AWS_ACCOUNT_IDS` (JSON-Liste, z. B. `["048861330600"]`). Nach dem Bootstrap eines weiteren Accounts dessen ID dort ergänzen.

## Abbauen

Erst alle `infra/envs/*` zerstören, dann hier `terraform destroy`. Der State-Bucket wird samt Inhalt gelöscht.

## GitHub einrichten (einmalig, nur Repo-Admin)

Das Repo ist öffentlich, damit Environments mit Schutzregeln kostenlos verfügbar sind (bei privaten Repos fehlen
Required Reviewers). Die Apply-Rollen vertrauen nur Jobs im jeweiligen Environment; die Regeln hier begrenzen, wer
dorthin deployen darf.

```bash
REPO=CCTeamNV/CloudComputingSplanForMobile
gh repo edit $REPO --visibility public --accept-visibility-change-consequences

# dev: nur Branch main
gh api -X PUT repos/$REPO/environments/dev --input - <<'JSON'
{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true}}
JSON
gh api -X POST repos/$REPO/environments/dev/deployment-branch-policies -f name=main -f type=branch

# prod: nur Tags v*, Freigabe durch eine der beiden Personen (IDs: noakaehling, Bronterrzel)
gh api -X PUT repos/$REPO/environments/prod --input - <<'JSON'
{"deployment_branch_policy": {"protected_branches": false, "custom_branch_policies": true},
 "reviewers": [{"type": "User", "id": 163006316}, {"type": "User", "id": 44360497}]}
JSON
gh api -X POST repos/$REPO/environments/prod/deployment-branch-policies -f name='v*' -f type=tag
```
