terraform {
  backend "azurerm" {
    resource_group_name  = "mgmt-state-store-nonprod"
    storage_account_name = "mgmtstatestorenonprod"
    container_name       = "mgmtstatestorecontaineraat"
    key                  = "expressjs-monorepo-template.terraform.tfstate"
  }
}
