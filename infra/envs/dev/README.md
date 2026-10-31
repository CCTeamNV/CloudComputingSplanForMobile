# envs/dev

Root-Modul der dev-Umgebung. Voraussetzung: `infra/bootstrap` wurde im Account angewendet.

```bash
export AWS_PROFILE=splan
npm ci && npm run build -w backend        # Lambdas nach backend/dist bündeln

cd infra/envs/dev
terraform init -backend-config="bucket=splan-tfstate-$(aws sts get-caller-identity --query Account --output text)"
terraform apply
curl "$(terraform output -raw api_url)/health"
open "$(terraform output -raw frontend_url)"   # Frontend kommt per CI-Deploy (s3 sync) in den Bucket
```

Abbauen: `terraform destroy` (keine manuellen Schritte).
