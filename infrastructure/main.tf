provider "azurerm" {
  features {
  }
  subscription_id = "${var.subscription}"
}

resource "azurerm_resource_group" "rg" {
  name     = "${var.product}-${var.env}"
  location = var.location

  tags = var.common_tags
}
