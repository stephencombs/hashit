resource "azurerm_log_analytics_workspace" "this" {
  name                = "${var.app_name}-logs"
  resource_group_name = data.azurerm_resource_group.this.name
  location            = data.azurerm_resource_group.this.location
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_container_app_environment" "this" {
  name                       = "${var.app_name}-env"
  resource_group_name        = data.azurerm_resource_group.this.name
  location                   = data.azurerm_resource_group.this.location
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
}

resource "azurerm_container_app" "this" {
  name                         = var.app_name
  resource_group_name          = data.azurerm_resource_group.this.name
  container_app_environment_id = azurerm_container_app_environment.this.id
  revision_mode                = "Single"

  registry {
    server               = azurerm_container_registry.this.login_server
    username             = azurerm_container_registry.this.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.this.admin_password
  }

  secret {
    name  = "azure-openai-api-key"
    value = var.azure_openai_api_key
  }

  secret {
    name  = "azure-openai-endpoint"
    value = var.azure_openai_endpoint
  }

  secret {
    name  = "azure-openai-deployment"
    value = var.azure_openai_deployment
  }

  secret {
    name  = "mcp-subscription-key"
    value = var.mcp_subscription_key
  }

  secret {
    name  = "mcp-client-id"
    value = var.mcp_client_id
  }

  secret {
    name  = "mcp-client-secret"
    value = var.mcp_client_secret
  }

  secret {
    name  = "database-url"
    value = "postgresql://${var.postgres_admin_login}:${urlencode(var.postgres_admin_password)}@${azurerm_postgresql_flexible_server.this.fqdn}:5432/${azurerm_postgresql_flexible_server_database.this.name}?sslmode=require"
  }

  secret {
    name  = "azure-blob-account-key"
    value = azurerm_storage_account.attachments.primary_access_key
  }

  ingress {
    external_enabled = true
    target_port      = 3000

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = 1
    max_replicas = 1

    container {
      name   = var.app_name
      image  = "${azurerm_container_registry.this.login_server}/${var.app_name}:${var.image_tag}"
      cpu    = 0.5
      memory = "1Gi"

      env {
        name        = "DATABASE_URL"
        secret_name = "database-url"
      }

      env {
        name        = "AZURE_OPENAI_API_KEY"
        secret_name = "azure-openai-api-key"
      }

      env {
        name        = "AZURE_OPENAI_ENDPOINT"
        secret_name = "azure-openai-endpoint"
      }

      env {
        name        = "AZURE_OPENAI_DEPLOYMENT"
        secret_name = "azure-openai-deployment"
      }

      env {
        name        = "MCP_SUBSCRIPTION_KEY"
        secret_name = "mcp-subscription-key"
      }

      env {
        name        = "MCP_CLIENT_ID"
        secret_name = "mcp-client-id"
      }

      env {
        name        = "MCP_CLIENT_SECRET"
        secret_name = "mcp-client-secret"
      }

      env {
        name  = "APP_URL"
        value = "https://${var.app_name}.${azurerm_container_app_environment.this.default_domain}"
      }

      env {
        name  = "AZURE_BLOB_ACCOUNT_NAME"
        value = azurerm_storage_account.attachments.name
      }

      env {
        name  = "AZURE_BLOB_ENDPOINT"
        value = azurerm_storage_account.attachments.primary_blob_endpoint
      }

      env {
        name  = "AZURE_BLOB_CONTAINER"
        value = azurerm_storage_container.attachments.name
      }

      env {
        name        = "AZURE_BLOB_ACCOUNT_KEY"
        secret_name = "azure-blob-account-key"
      }

      liveness_probe {
        transport               = "HTTP"
        path                    = "/health"
        port                    = 3000
        initial_delay           = 10
        interval_seconds        = 30
        timeout                 = 5
        failure_count_threshold = 3
      }

      startup_probe {
        transport               = "HTTP"
        path                    = "/health"
        port                    = 3000
        interval_seconds        = 5
        timeout                 = 3
        failure_count_threshold = 10
      }
    }
  }
}
