provider "azurerm" {
  features {
  }
  subscription_id = "1c4f0704-a29e-403d-b719-b90c34ef14c9"
}

# Reference existing resource group (created by another process)
# Product name (team) is extracted from Chart.yaml annotations
data "azurerm_resource_group" "rg" {
  name = "${var.product}-${var.env}"
}
