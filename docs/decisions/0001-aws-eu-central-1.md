# 0001: AWS in eu-central-1

- Status: akzeptiert
- Datum: 2026-10-23

## Kontext

Wir brauchen einen Cloud-Provider mit Identity Provider, Serverless-Compute, managed DB und Container-Laufzeit.
Daten von Studierenden sollen in der EU bleiben. Budget: je Teammitglied ein eigener Free-Plan-Account mit ~100 $ Guthaben (ADR 0012).

## Optionen

1. AWS: Lambda, DynamoDB on-demand, Cognito, Fargate; größtes Ökosystem, sehr gute Terraform-Unterstützung
2. Azure: Functions, Cosmos DB Serverless, Entra External ID; ähnlich, aber für uns weniger Lernmaterial
3. GCP: Cloud Run, Firestore, Identity Platform; Cloud Run ist stark, Identity Platform weniger verbreitet

## Entscheidung

AWS (Vorgabe) in `eu-central-1` (Frankfurt): DSGVO-Datenhaltung in Deutschland, niedrige Latenz für HHN,
alle benötigten Dienste verfügbar. Echtes Scale-to-Zero bei allen Kerndiensten.

## Konsequenzen

- Alle Ressourcen in einer Region; CloudFront ist global, Zertifikate für eigene Domains müssten in `us-east-1`
  liegen (wir nutzen die CloudFront-Domain, daher nicht nötig).
- Multi-Region ist nicht vorgesehen und wird im README als bewusste Grenze genannt.
