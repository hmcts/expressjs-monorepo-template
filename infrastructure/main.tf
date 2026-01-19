provider "azurerm" {
  features {
  }
  subscription_id = var.subscription
}

data "azurerm_resource_group" "rg" {
  name = "${var.product}-${var.env}"
}
