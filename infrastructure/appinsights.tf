# Application Insights configuration
# References existing App Insights and stores connection string in Key Vault

data "azurerm_application_insights" "ai" {
  name                = "${var.product}-appinsights-${var.env}"
  resource_group_name = data.azurerm_resource_group.rg.name
}

# Store App Insights connection string in Key Vault
# Secret name must match Helm values (apps/*/helm/values.yaml)
resource "azurerm_key_vault_secret" "app_insights_connection_string" {
  name         = "AppInsightsConnectionString"
  value        = data.azurerm_application_insights.ai.connection_string
  key_vault_id = data.azurerm_key_vault.key_vault.id
}
