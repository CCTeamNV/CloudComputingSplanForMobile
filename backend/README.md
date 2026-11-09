# backend

Lambda-Handler in TypeScript, gebündelt mit esbuild.

- `functions/<name>/`: je eine Lambda pro Domäne: catalog, student, lecturer, admin, ical, pre-signup (ADR 0008)
- `shared/`: Datenmodell-Typen und DynamoDB-Zugriff (ADR 0003)

## Katalog-Dateien neu erzeugen

Die Lambda `catalog` schreibt `/catalog/*.json` bei jeder Änderung über den DynamoDB Stream (ADR 0013). Nach dem
ersten Deploy, nach einem Seed oder wenn ein Stream-Batch ausgefallen ist, erzeugt dieser Aufruf alle Dateien neu:

```bash
aws lambda invoke --function-name splan-dev-catalog --cli-binary-format raw-in-base64-out \
  --payload '{"rebuild":true}' /dev/stdout
```
