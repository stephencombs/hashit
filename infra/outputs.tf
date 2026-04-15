output "app_url" {
  description = "Public FQDN of the Container App"
  value       = "https://${azurerm_container_app.this.ingress[0].fqdn}"
}

output "acr_login_server" {
  description = "ACR login server for docker push"
  value       = azurerm_container_registry.this.login_server
}
