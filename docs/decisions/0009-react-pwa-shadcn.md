# 0009: React-PWA mit Tailwind und shadcn/ui, Admin-Bereich in derselben SPA

- Status: akzeptiert
- Datum: 2026-10-23

## Kontext

Kernproblem ist die schlechte mobile Nutzbarkeit von SPLAN. Wir sind zwei Personen ohne Designer.
Es braucht eine Studierenden- und eine Admin-/Dozentenoberfläche.

## Optionen

1. React-PWA mit Vite, Tailwind, shadcn/ui
2. React mit MUI
3. Native App (React Native/Expo): App-Store-Build, Signing, separate Admin-UI

## Entscheidung

Option 1, gehostet auf S3 (privat) + CloudFront (OAC). Der Admin- und Dozentenbereich ist eine lazy geladene Route
`/admin` in derselben SPA, desktop-optimiert und nur für die Gruppen `admin`/`lecturer` sichtbar.
Laufzeitkonfiguration per `config.json` aus Terraform, damit ein Build für dev und prod reicht.
Auth im Frontend mit `aws-amplify` (nur Auth-Modul) oder `oidc-client-ts`; Wahl beim Setup.

## Konsequenzen

- Installierbar, ein Codebase für alle Geräte; Push auf iOS nur bei installierter PWA (Nice-to-have).
- Offline-Cache ist mit `vite-plugin-pwa` später günstig nachrüstbar.
- Ausblenden im UI ist kein Schutz; die Autorisierung liegt im Backend (ADR 0006).
