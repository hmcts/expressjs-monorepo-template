# Application Insights configuration
# Creates App Insights and stores connection string in Key Vault

resource "azurerm_application_insights" "ai" {
  name                = "expressjs-appinsights-${var.env}"
  location            = var.location
  resource_group_name = data.azurerm_resource_group.rg.name
  application_type    = "web"

  tags = var.common_tags
}

# Store App Insights connection string in Key Vault
# Secret name must match Helm values (apps/*/helm/values.yaml)
resource "azurerm_key_vault_secret" "app_insights_connection_string" {
  name         = "AppInsightsConnectionString"
  value        = azurerm_application_insights.ai.connection_string
  key_vault_id = data.azurerm_key_vault.key_vault.id
}
