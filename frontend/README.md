# frontend

React-PWA (Vite, TypeScript, Tailwind, shadcn/ui mit Radix). Studierenden-App mobile-first, Admin-/Dozentenbereich
unter `/admin` als eigener Chunk (ADR 0009).

```bash
cp config.example.json public/config.json   # apiUrl der dev-API eintragen
npm run dev -w frontend
npm run build -w frontend                    # -> frontend/dist
npm test -w frontend
npm run gen:api -w frontend                  # API-Typen aus docs/api.yaml neu erzeugen
```

- Laufzeitkonfiguration kommt aus `/config.json` (in AWS von Terraform geschrieben), daher ein Build für alle Umgebungen.
- `src/api/schema.d.ts` ist generiert, nicht von Hand ändern. Die CI prüft, dass die Datei zu `docs/api.yaml` passt.
- shadcn-Komponenten hinzufügen: `npx shadcn@latest add <name>` im Ordner `frontend`.
