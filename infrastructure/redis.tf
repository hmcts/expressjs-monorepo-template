module "redis" {
  source = "git::https://github.com/hmcts/cnp-module-redis?ref=master"

  product       = var.product
  name          = "${var.product}-${var.component}-${var.env}"
  location      = var.location
  env           = var.env
  common_tags   = var.common_tags
  business_area = "cft"

  private_endpoint_enabled      = true
  public_network_access_enabled = false

  redis_version = "6"
  sku_name      = "Basic"
  family        = "C"
  capacity      = 0
}

resource "azurerm_key_vault_secret" "redis_host" {
  name         = "redis-host"
  value        = module.redis.host_name
  key_vault_id = data.azurerm_key_vault.key_vault.id
}

resource "azurerm_key_vault_secret" "redis_port" {
  name         = "redis-port"
  value        = tostring(module.redis.redis_port)
  key_vault_id = data.azurerm_key_vault.key_vault.id
}

resource "azurerm_key_vault_secret" "redis_access_key" {
  name         = "redis-access-key"
  value        = module.redis.access_key
  key_vault_id = data.azurerm_key_vault.key_vault.id
}

resource "azurerm_key_vault_secret" "redis_url" {
  name         = "redis-url"
  value        = "rediss://:${module.redis.access_key}@${module.redis.host_name}:${module.redis.redis_port}"
  key_vault_id = data.azurerm_key_vault.key_vault.id
}
