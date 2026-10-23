# infra

Terraform für die gesamte Infrastruktur (ADR 0004).

- `bootstrap/`: State-Bucket + GitHub-OIDC-Rolle, lokaler State, einmal pro Account
- `modules/`: auth, api, data, frontend, monitoring, loadtest
- `envs/dev`, `envs/prod`: Root-Module mit eigenem State-Key
