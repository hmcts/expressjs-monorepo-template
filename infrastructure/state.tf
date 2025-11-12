terraform {
  backend "azurerm" {
    resource_group_name  = "terraform-state-rg"
    storage_account_name = "hmctstfstate"
    container_name       = "tfstate"
    key                  = "expressjs-monorepo-template.terraform.tfstate"
  }
}
