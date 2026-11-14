# frontend

React-PWA (Vite, TypeScript, Tailwind, shadcn/ui mit Radix). Studierenden-App mobile-first, Admin-/Dozentenbereich
unter `/admin` als eigener Chunk (ADR 0009).

```bash
# Laufzeitkonfiguration der dev-Umgebung holen (API-URL, Cognito-Domain, Client-ID)
AWS_PROFILE=splan aws s3 cp s3://$(terraform -chdir=../infra/envs/dev output -raw frontend_bucket)/config.json public/config.json
SPLAN_CATALOG_ORIGIN=$(terraform -chdir=../infra/envs/dev output -raw frontend_url) npm run dev -w frontend
npm run build -w frontend                    # -> frontend/dist
npm test -w frontend
npm run gen:api -w frontend                  # API-Typen aus docs/api.yaml neu erzeugen
```

- Laufzeitkonfiguration kommt aus `/config.json` (in AWS von Terraform geschrieben), daher ein Build für alle Umgebungen.
  Vorlage ohne AWS: `config.example.json`.
- Login über Cognito Managed Login mit PKCE in `src/auth.ts` (ADR 0009). `http://localhost:5173/` ist als
  Callback-URL eingetragen, der Login funktioniert also auch lokal gegen dev.
- Kurse und Termine kommen als statische Dateien von CloudFront (`/catalog/…`, ADR 0013). Lokal leitet der Dev-Server
  sie per Proxy weiter, sobald `SPLAN_CATALOG_ORIGIN` gesetzt ist.
- `src/api/schema.d.ts` ist generiert, nicht von Hand ändern. Die CI prüft, dass die Datei zu `docs/api.yaml` passt.
- shadcn-Komponenten hinzufügen: `npx shadcn@latest add <name>` im Ordner `frontend`.
