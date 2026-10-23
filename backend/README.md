# backend

Lambda-Handler in TypeScript, gebündelt mit esbuild.

- `functions/<name>/`: je eine Lambda pro Domäne: catalog, student, lecturer, admin, ical, pre-signup (ADR 0008)
- `shared/`: Datenmodell-Typen und DynamoDB-Zugriff (ADR 0003)
