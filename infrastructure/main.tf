provider "azurerm" {
  features {}
}

# Reference existing resource group (created by another process)
# Product name (team) is extracted from Chart.yaml annotations
data "azurerm_resource_group" "rg" {
  name = "${var.product}-${var.env}"
}
