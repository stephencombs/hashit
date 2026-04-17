resource "azurerm_postgresql_flexible_server" "this" {
  name                          = "${var.app_name}-postgres"
  resource_group_name           = data.azurerm_resource_group.this.name
  location                      = var.postgres_location
  version                       = "16"
  administrator_login           = var.postgres_admin_login
  administrator_password        = var.postgres_admin_password
  sku_name                      = "B_Standard_B1ms"
  storage_mb                    = 32768
  public_network_access_enabled = true

  zone = "1"
}

resource "azurerm_postgresql_flexible_server_database" "this" {
  name      = var.app_name
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure" {
  name             = "AllowAzureServices"
  server_id        = azurerm_postgresql_flexible_server.this.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
