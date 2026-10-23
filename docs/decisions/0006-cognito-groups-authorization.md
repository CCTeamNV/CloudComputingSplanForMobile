# 0006: Cognito mit Gruppen, Autorisierung im Backend

- Status: akzeptiert
- Datum: 2026-10-23

## Kontext

Es gibt drei Rollen: Student, Dozent, Admin. Nur Hochschulangehörige sollen sich registrieren können.
Niemand soll Rechte durch Selbstauskunft bekommen.

## Optionen

1. Cognito User Pool mit Gruppen
2. Eigene Benutzerverwaltung: Passwort-Handling selbst bauen, nein
3. Externer IdP (Auth0, Entra): zusätzlicher Dienst, nicht nötig

## Entscheidung

Cognito User Pool, öffentlicher App-Client ohne Secret (PKCE):

- Self-Sign-up; die **Pre-Sign-up-Lambda** erlaubt nur konfigurierte Domains (`hs-heilbronn.de` + Testdomain für den Lasttest).
- Gruppen `lecturer` und `admin`. Jeder authentifizierte User ohne Gruppe ist Student. Das spart einen
  Post-Confirmation-Trigger.
- Gruppen vergibt nur ein Admin (über die Admin-Lambda) oder das Seed-Skript.
- API Gateway prüft das JWT (HTTP API kann nicht nach Gruppen filtern); die Lambda prüft `cognito:groups` und
  bei Dozierenden den Besitz (`course.lecturerId == sub`).

## Konsequenzen

- Rollenwechsel greift erst nach Token-Refresh (max. 1 h Access-Token-Laufzeit).
- Cognito-Standard-E-Mail hat ein niedriges Tageslimit; Testuser legt das Seed-Skript ohne E-Mail an.
