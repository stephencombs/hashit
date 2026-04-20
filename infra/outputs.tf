output "app_url" {
  description = "Public FQDN of the Container App"
  value       = "https://${azurerm_container_app.this.ingress[0].fqdn}"
}

output "acr_login_server" {
  description = "ACR login server for docker push"
  value       = azurerm_container_registry.this.login_server
}

output "postgres_fqdn" {
  description = "PostgreSQL Flexible Server FQDN"
  value       = azurerm_postgresql_flexible_server.this.fqdn
}

output "blob_storage_account_name" {
  description = "Name of the Azure Storage account for prompt attachments"
  value       = azurerm_storage_account.attachments.name
}

output "blob_endpoint" {
  description = "Primary blob service endpoint for prompt attachments"
  value       = azurerm_storage_account.attachments.primary_blob_endpoint
}

output "blob_container_name" {
  description = "Name of the blob container for prompt attachments"
  value       = azurerm_storage_container.attachments.name
}
