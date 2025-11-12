output "redis_hostname" {
  description = "Redis hostname"
  value       = module.redis.hostname
}

output "redis_ssl_port" {
  description = "Redis SSL port"
  value       = module.redis.ssl_port
}

output "redis_connection_string" {
  description = "Redis connection string"
  value       = module.redis.connection_string
  sensitive   = true
}
