resource "azurerm_container_registry" "this" {
  name                = replace(var.app_name, "-", "")
  resource_group_name = data.azurerm_resource_group.this.name
  location            = data.azurerm_resource_group.this.location
  sku                 = "Basic"
  admin_enabled       = true
}
