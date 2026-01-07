variable "env" {
  description = "Environment name (e.g., aat, prod)"
  type        = string
}

variable "product" {
  description = "Product name"
  type        = string
}

variable "subscription" {
  description = "Azure subscription name (nonprod, prod)"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "uksouth"
}

variable "common_tags" {
  description = "Common tags for resources"
  type        = map(string)
  default     = {}
}
