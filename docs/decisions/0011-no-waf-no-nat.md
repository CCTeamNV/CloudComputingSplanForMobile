# 0011: Bewusst weggelassene Dienste mit Grundgebühr

- Status: akzeptiert
- Datum: 2026-10-23

## Kontext

Die Plattform soll im Idle fast nichts kosten. Einige übliche Bausteine kosten auch ohne Last Geld.

## Optionen und Entscheidung

| Dienst | Grundkosten (ca.) | Entscheidung | Ersatz |
|---|---|---|---|
| NAT Gateway | ~35 €/Monat + Traffic | weglassen | Lambdas ohne VPC; Fargate-Tasks in öffentlichem Subnetz |
| Application Load Balancer | ~18 €/Monat | weglassen | API Gateway HTTP API |
| AWS WAF | ~6 €/Monat + Regeln | weglassen | API-Gateway-Throttling, Cognito, Domain-Beschränkung |
| Secrets Manager | 0,40 $/Secret/Monat | weglassen | keine Secrets nötig; sonst SSM Parameter Store |
| Route-53-Hosted-Zone | 0,50 $/Monat | weglassen | CloudFront-Standarddomain |
| Dauerhafte DB/Tasks | variabel | weglassen | DynamoDB on-demand, Fargate nur im Lasttest |

Preise vor der Präsentation mit dem AWS Pricing Calculator prüfen.

## Konsequenzen

- Kein Schutz durch WAF-Regeln (z. B. Bot-Abwehr); im README als Trade-off und als Ausbaustufe für Produktion genannt.
- Keine eigene Domain; die URL ist eine `*.cloudfront.net`-Adresse.
