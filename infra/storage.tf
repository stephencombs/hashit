resource "azurerm_storage_account" "attachments" {
  name                     = "${replace(var.app_name, "-", "")}blobs"
  resource_group_name      = data.azurerm_resource_group.this.name
  location                 = data.azurerm_resource_group.this.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
}

resource "azurerm_storage_container" "attachments" {
  name                  = var.blob_container_name
  storage_account_id    = azurerm_storage_account.attachments.id
  container_access_type = "private"
}
