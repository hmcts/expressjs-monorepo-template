variable "product" {
  type        = string
  description = "Product name"
  default     = "expressjs-monorepo-template"
}

variable "component" {
  type        = string
  description = "Component name"
  default     = "shared"
}

variable "env" {
  type        = string
  description = "Environment name (e.g., dev, aat, prod)"
}

variable "location" {
  type        = string
  description = "Azure region"
  default     = "UK South"
}

variable "common_tags" {
  type        = map(string)
  description = "Common tags to apply to all resources"
  default     = {}
}

variable "redis_sku_name" {
  type        = string
  description = "Redis SKU name"
  default     = "Basic"
}

variable "redis_family" {
  type        = string
  description = "Redis family"
  default     = "C"
}

variable "redis_capacity" {
  type        = number
  description = "Redis capacity"
  default     = 1
}
