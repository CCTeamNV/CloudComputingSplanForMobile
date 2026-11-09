# scripts

## Seed

Legt den gleichen Ausgangsstand in einer Umgebung an (ADR 0012), ohne echte Personendaten:

- Studiengänge SEB und WIB, Kurse mit Dozent, wöchentliche Termine des laufenden Semesters (ohne Weihnachtspause)
- Cognito-User per `AdminCreateUser` ohne E-Mail-Versand: `admin@loadtest.example.com` (Gruppe `admin`),
  `dozent.beispiel@…` und `dozent.muster@…` (Gruppe `lecturer`), `k6-001@…` bis `k6-<N>@…` (Studierende,
  abonnieren alle SEB-7-Kurse)

```bash
export AWS_PROFILE=splan
SEED_PASSWORD='...' npm run seed -- --env dev --users 10
```

- Liest `table_name` und `user_pool_id` aus `terraform output` in `infra/envs/<env>`.
- `SEED_PASSWORD` gilt für alle Seed-User (Policy: ≥ 12 Zeichen, Groß-/Kleinbuchstaben, Ziffer). Nicht ins Repo.
- Idempotent: Items werden nur geschrieben, wenn ihr Key fehlt (Termin-IDs sind aus Kurs + Start abgeleitet),
  bestehende User werden wiederverwendet. Ein zweiter Lauf meldet `created 0` und überschreibt keine Absagen oder
  Raumänderungen aus der App.
