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

resource "azurerm_storage_share" "durable_streams" {
  name               = var.durable_streams_file_share_name
  storage_account_id = azurerm_storage_account.attachments.id
  quota              = var.durable_streams_file_share_quota_gb
}

resource "azurerm_container_app_environment_storage" "durable_streams" {
  name                         = "durable-streams-storage"
  container_app_environment_id = azurerm_container_app_environment.this.id
  account_name                 = azurerm_storage_account.attachments.name
  share_name                   = azurerm_storage_share.durable_streams.name
  access_key                   = azurerm_storage_account.attachments.primary_access_key
  access_mode                  = "ReadWrite"
}
