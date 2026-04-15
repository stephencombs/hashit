resource "azurerm_storage_account" "this" {
  name                     = replace("${var.app_name}store", "-", "")
  resource_group_name      = azurerm_resource_group.this.name
  location                 = azurerm_resource_group.this.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_storage_share" "data" {
  name               = "${var.app_name}-data"
  storage_account_id = azurerm_storage_account.this.id
  quota              = 1
}
