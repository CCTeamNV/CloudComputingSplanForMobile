output "dashboard_url" {
  value = "https://${data.aws_region.current.region}.console.aws.amazon.com/cloudwatch/home#dashboards/dashboard/${aws_cloudwatch_dashboard.this.dashboard_name}"
}
