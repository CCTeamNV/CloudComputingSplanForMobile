# Dashboard and alarms per environment (ADR 0010).
# Free Tier: 10 alarm metrics per account shared by dev and prod, so 5 per env (the 5xx rate counts twice).
# Lambda errors/throttles of the API functions surface as API 5xx; they are on the dashboard, not alarmed separately.

data "aws_region" "current" {}

data "aws_sns_topic" "alerts" {
  name = var.alerts_topic_name
}

locals {
  prefix  = "splan-${var.env}"
  region  = data.aws_region.current.region
  stream  = var.function_names[var.stream_function]
  actions = [data.aws_sns_topic.alerts.arn]
  # Lambda metrics of this env only; the function names start with splan-<env>-.
  search = "{AWS/Lambda,FunctionName} ${local.prefix}"
}

# --- Alarms ---

resource "aws_cloudwatch_metric_alarm" "api_5xx_rate" {
  alarm_name          = "${local.prefix}-api-5xx-rate"
  alarm_description   = "More than 1 % of API requests failed with 5xx in 5 minutes."
  comparison_operator = "GreaterThanThreshold"
  threshold           = 1
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching" # no traffic is no problem
  alarm_actions       = local.actions
  ok_actions          = local.actions

  metric_query {
    id          = "rate"
    expression  = "100 * FILL(errors, 0) / FILL(requests, 1)"
    label       = "5xx in %"
    return_data = true
  }
  metric_query {
    id = "errors"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "5xx"
      dimensions  = { ApiId = var.api_id }
      stat        = "Sum"
      period      = 300
    }
  }
  metric_query {
    id = "requests"
    metric {
      namespace   = "AWS/ApiGateway"
      metric_name = "Count"
      dimensions  = { ApiId = var.api_id }
      stat        = "Sum"
      period      = 300
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "api_p95_latency" {
  alarm_name          = "${local.prefix}-api-p95-latency"
  alarm_description   = "p95 API latency above 1 s in 5 minutes."
  namespace           = "AWS/ApiGateway"
  metric_name         = "Latency"
  dimensions          = { ApiId = var.api_id }
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 1000
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

# The publisher has no API in front of it, so its failures need their own alarm.
resource "aws_cloudwatch_metric_alarm" "catalog_errors" {
  alarm_name          = "${local.prefix}-catalog-errors"
  alarm_description   = "Catalog publisher failed; the static files may be stale."
  namespace           = "AWS/Lambda"
  metric_name         = "Errors"
  dimensions          = { FunctionName = local.stream }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

# Changes normally reach the files in about 2 minutes; older stream records mean the publisher is stuck (ADR 0013).
resource "aws_cloudwatch_metric_alarm" "catalog_iterator_age" {
  alarm_name          = "${local.prefix}-catalog-iterator-age"
  alarm_description   = "DynamoDB stream records wait more than 5 minutes for the catalog publisher."
  namespace           = "AWS/Lambda"
  metric_name         = "IteratorAge"
  dimensions          = { FunctionName = local.stream }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  comparison_operator = "GreaterThanThreshold"
  threshold           = 300000
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

# --- Dashboard ---

locals {
  alarms = [
    aws_cloudwatch_metric_alarm.api_5xx_rate.arn,
    aws_cloudwatch_metric_alarm.api_p95_latency.arn,
    aws_cloudwatch_metric_alarm.catalog_errors.arn,
    aws_cloudwatch_metric_alarm.catalog_iterator_age.arn,
  ]

  # Platform report lines of the JSON log format; an init duration means a cold start.
  cold_starts = join(" | ", concat(
    [for name in values(var.function_names) : "SOURCE '/aws/lambda/${name}'"],
    [
      "filter type = 'platform.report' and ispresent(record.metrics.initDurationMs)",
      "stats count(*) as coldStarts, avg(record.metrics.initDurationMs) as avgInitMs, max(record.metrics.initDurationMs) as maxInitMs by @log",
      "sort coldStarts desc",
    ],
  ))

  widgets = [
    {
      type       = "alarm", width = 24, height = 2
      properties = { title = "Alarme", alarms = local.alarms }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title  = "API: Requests, 4xx, 5xx"
        region = local.region
        stat   = "Sum"
        period = 60
        metrics = [
          ["AWS/ApiGateway", "Count", "ApiId", var.api_id, { label = "Requests" }],
          ["AWS/ApiGateway", "4xx", "ApiId", var.api_id, { label = "4xx" }],
          ["AWS/ApiGateway", "5xx", "ApiId", var.api_id, { label = "5xx" }],
        ]
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title  = "API: Latenz (ms)"
        region = local.region
        period = 60
        metrics = [
          for p in ["p50", "p95", "p99"] : ["AWS/ApiGateway", "Latency", "ApiId", var.api_id, { stat = p, label = p }]
        ]
        annotations = { horizontal = [{ label = "Alarm p95", value = 1000 }] }
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title   = "Lambda: gleichzeitige Ausführungen"
        region  = local.region
        period  = 60
        metrics = [[{ expression = "SEARCH('${local.search} MetricName=\"ConcurrentExecutions\"', 'Maximum', 60)", id = "c" }]]
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title  = "Lambda: Errors und Throttles"
        region = local.region
        period = 60
        metrics = [
          [{ expression = "SEARCH('${local.search} MetricName=\"Errors\"', 'Sum', 60)", id = "e" }],
          [{ expression = "SEARCH('${local.search} MetricName=\"Throttles\"', 'Sum', 60)", id = "t" }],
        ]
      }
    },
    {
      type = "log", width = 12, height = 6
      properties = {
        title  = "Lambda: Cold Starts (Init-Dauer in ms)"
        region = local.region
        view   = "table"
        query  = local.cold_starts
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title  = "Catalog-Publisher: IteratorAge (ms)"
        region = local.region
        stat   = "Maximum"
        period = 60
        metrics = [
          ["AWS/Lambda", "IteratorAge", "FunctionName", local.stream],
        ]
        annotations = { horizontal = [{ label = "Alarm", value = 300000 }] }
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title  = "DynamoDB: verbrauchte Kapazität und Throttles"
        region = local.region
        stat   = "Sum"
        period = 60
        metrics = [
          ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", var.table_name, { label = "Read" }],
          ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", var.table_name, { label = "Write" }],
          ["AWS/DynamoDB", "ReadThrottleEvents", "TableName", var.table_name, { label = "Read-Throttles" }],
          ["AWS/DynamoDB", "WriteThrottleEvents", "TableName", var.table_name, { label = "Write-Throttles" }],
        ]
      }
    },
    {
      type = "metric", width = 12, height = 6
      properties = {
        title  = "Fachlich: Abos und Absagen"
        region = local.region
        stat   = "Sum"
        period = 3600
        metrics = [
          [var.metrics_namespace, "subscriptionAdded", "service", "student", { label = "neue Abos" }],
          [var.metrics_namespace, "sessionCancelled", "service", "lecturer", { label = "abgesagte Termine" }],
        ]
      }
    },
  ]
}

resource "aws_cloudwatch_dashboard" "this" {
  dashboard_name = local.prefix
  dashboard_body = jsonencode({ widgets = local.widgets })
}
