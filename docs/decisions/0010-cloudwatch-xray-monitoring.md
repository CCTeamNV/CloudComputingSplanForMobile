# 0010: Monitoring mit CloudWatch, X-Ray und SNS-Alarmen

- Status: akzeptiert
- Datum: 2026-10-23

## Kontext

Wir müssen Gesundheit und Verhalten verteilter Komponenten beobachten und Probleme erkennen können,
ohne zusätzliche Kosten oder externe API-Keys.

## Optionen

1. CloudWatch Logs/Metriken/Dashboard + X-Ray + SNS
2. Grafana Cloud oder Datadog: schönere Dashboards, externer Dienst und Secret
3. CloudWatch ohne Tracing

## Entscheidung

Option 1, komplett in Terraform (Modul `monitoring`): strukturierte JSON-Logs mit Powertools, X-Ray-Tracing,
ein Dashboard pro Umgebung, Alarme (5xx-Rate, p95-Latenz, Lambda-Errors/Throttles, AWS Budget) an ein SNS-Topic
mit E-Mail-Subscription.

## Konsequenzen

- Im Free Tier (3 Dashboards, 10 Alarme, 100k Traces/Monat); darüber kleine Beträge.
- E-Mail-Subscription muss einmal bestätigt werden; `apply` wird dadurch nicht blockiert.
