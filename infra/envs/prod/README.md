# envs/prod

Root-Modul der prod-Umgebung: dasselbe `modules/app` wie dev, nur andere Variablen (Cognito-Löschschutz,
DynamoDB-PITR, kein localhost, nur `hs-heilbronn.de` bei der Registrierung).

Deploy normalerweise per Release-Tag: `git tag v1.0.0 && git push origin v1.0.0`, dann im GitHub-Environment `prod`
freigeben. Lokal nur im Notfall:

```bash
export AWS_PROFILE=splan
npm ci && npm run build -w backend

cd infra/envs/prod
terraform init -backend-config="bucket=splan-tfstate-$(aws sts get-caller-identity --query Account --output text)"
terraform apply
```

Abbauen: Cognito-Löschschutz steht in prod an. Vor `terraform destroy` `deletion_protection = false` setzen und
`apply`, dann `destroy`.
