# 0008: Eine Lambda pro Domäne mit eigener IAM-Rolle

- Status: akzeptiert
- Datum: 2026-10-23

## Kontext

Least Privilege soll nachweisbar sein, ohne in 20+ Funktionen und Rollen Terraform-Boilerplate zu ertrinken.

## Optionen

1. Ein Lambdalith: einfach, aber eine Rolle mit allen Rechten
2. Eine Lambda pro Endpunkt: maximal granular, sehr viel Terraform
3. Eine Lambda pro Rolle/Domäne

## Entscheidung

Option 3:

| Lambda | Routen | Rechte |
|---|---|---|
| `catalog` | `GET /programs`, `GET /courses*` | DynamoDB Query/GetItem |
| `student` | `/me*` (Abos, Plan, iCal-Token, Account löschen) | DynamoDB Read/Write auf eigene Items, `cognito-idp:AdminDeleteUser` |
| `lecturer` | `GET /lecturer/courses`, `PATCH /lecturer/courses/{id}/sessions/{id}` | DynamoDB Query (GSI2)/GetItem/UpdateItem |
| `admin` | `/admin/*` | DynamoDB CRUD, `cognito-idp:AdminAddUserToGroup/RemoveUserFromGroup/ListUsers` |
| `ical` | `GET /ical/{token}` | DynamoDB GetItem/Query |
| `pre-signup` | Cognito-Trigger | keine |

Alle Rechte auf die konkreten ARNs (Tabelle, User Pool) beschränkt. Vollständige Routen: `docs/api.yaml`.

## Konsequenzen

- Überschaubar in Terraform (ein Modul, Map über Funktionen).
- „Nur eigene Items“ lässt sich bei DynamoDB per IAM nur mit Identity-Pool-Credentials erzwingen; wir prüfen es im Code.
