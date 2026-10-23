# 0002: Serverless-Kern, Container für den Lastgenerator

- Status: akzeptiert
- Datum: 2026-10-23

## Kontext

Die Aufgabe verlangt bewusste Entscheidungen, wo Container und wo Managed Services eingesetzt werden.
Die Last ist stark zeitabhängig (Spitzen vor Vorlesungsbeginn, Semesterstart, nachts nahezu null).
Die Idle-Kosten sollen minimal sein.

## Optionen

1. API auf ECS Fargate hinter einem ALB: sichtbare Autoscaling-Events, aber ALB (~18 €/Monat) und mindestens ein Task
   laufen dauerhaft
2. API Gateway + Lambda, kein Container
3. API Gateway + Lambda für die App, Fargate gezielt für den k6-Lastgenerator

## Entscheidung

Option 3. Anfragegetriebene, sporadische Last → Lambda (0 € im Idle, skaliert pro Request).
Lang laufende, CPU-lastige Batch-Arbeit (Lastgenerierung) → Container auf Fargate, nur während eines Tests,
in öffentlichen Subnetzen mit öffentlicher IP (kein NAT Gateway, kein Load Balancer).

## Konsequenzen

- Idle-Kosten nahe 0 €.
- Lambda-Skalierung ist „unsichtbar“; wir machen sie über `ConcurrentExecutions` im Dashboard sichtbar.
- Account-Quota für Lambda-Concurrency kann der Engpass sein → früh Erhöhung beantragen.
- Für den Lastgenerator brauchen wir eine minimale VPC (Subnetze, Internet Gateway: kostenlos) und ECR.
