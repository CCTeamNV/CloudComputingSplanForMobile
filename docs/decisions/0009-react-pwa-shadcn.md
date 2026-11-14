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
Auth im Frontend: siehe Nachtrag vom 2026-11-14.

## Konsequenzen

- Installierbar, ein Codebase für alle Geräte; Push auf iOS nur bei installierter PWA (Nice-to-have).
- Offline-Cache ist mit `vite-plugin-pwa` später günstig nachrüstbar.
- Ausblenden im UI ist kein Schutz; die Autorisierung liegt im Backend (ADR 0006).

## Nachtrag 2026-11-14: Login ohne Auth-Bibliothek

Zur Wahl standen `aws-amplify` (nur Auth), `oidc-client-ts` und eigener Code für den Code-Flow.

Entscheidung: **Cognito Managed Login** (gehostete Seiten, Version 2, auf Deutsch per `lang=de`) mit Authorization
Code Flow und PKCE, implementiert in `frontend/src/auth.ts` (rund 150 Zeilen, getestet), ohne Bibliothek.

- Registrierung, Bestätigungscode und „Passwort vergessen“ liefert Cognito fertig; die App braucht nur Login-Start,
  Rückkehr mit `?code=`, Token-Refresh und Abmelden.
- `aws-amplify` bringt für diese vier Aufgaben viel Code mit; `oidc-client-ts` deckt die Cognito-Abmeldung
  (`/logout` mit `logout_uri`) nicht ab und müsste ohnehin ergänzt werden.
- Tokens liegen im `localStorage` (Refresh-Token 30 Tage, Access-Token 60 Minuten). Das ist bei SPAs üblich, macht
  XSS aber zum Risiko für die Sitzung: keine fremden Skripte, kein `dangerouslySetInnerHTML`, Security-Header über
  CloudFront.
- Grenze: Aussehen der Login-Seite und Text der Fehlermeldungen bestimmt Cognito. Der Fehler der Pre-Sign-up-Lambda
  erscheint dort als „PreSignUp failed with error …“; kommt er per Redirect zur App zurück, entfernt die App den Präfix.
