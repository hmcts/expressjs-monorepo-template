provider "azurerm" {
  features {}
}

locals {
  vault_name = "${var.product}-${var.env}"
}

data "azurerm_key_vault" "key_vault" {
  name                = local.vault_name
  resource_group_name = local.vault_name
}

module "redis" {
  source                  = "git::https://github.com/hmcts/cnp-module-redis.git?ref=master"
  product                 = var.product
  location                = var.location
  env                     = var.env
  common_tags             = var.common_tags
  redis_version           = "6"
  business_area           = "CFT"
  public_network_access_enabled = false
  private_endpoint_enabled      = true

  sku_name  = var.redis_sku_name
  family    = var.redis_family
  capacity  = var.redis_capacity
}

resource "azurerm_key_vault_secret" "redis_access_key" {
  name         = "redis-access-key"
  value        = module.redis.access_key
  key_vault_id = data.azurerm_key_vault.key_vault.id
}
