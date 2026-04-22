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

locals {
  durable_streams_app_name = "${var.app_name}-durable-streams"
  durable_streams_base_url = "https://${azurerm_container_app.durable_streams.ingress[0].fqdn}${var.durable_streams_route_prefix}"
}

resource "azurerm_container_app" "this" {
  name                         = var.app_name
  resource_group_name          = data.azurerm_resource_group.this.name
  container_app_environment_id = azurerm_container_app_environment.this.id
  revision_mode                = "Single"
  depends_on                   = [azurerm_storage_account.attachments]

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

      env {
        name  = "DURABLE_STREAMS_URL"
        value = local.durable_streams_base_url
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

resource "azurerm_container_app" "durable_streams" {
  name                         = local.durable_streams_app_name
  resource_group_name          = data.azurerm_resource_group.this.name
  container_app_environment_id = azurerm_container_app_environment.this.id
  revision_mode                = "Single"
  depends_on                   = [azurerm_container_app_environment_storage.durable_streams]

  registry {
    server               = azurerm_container_registry.this.login_server
    username             = azurerm_container_registry.this.admin_username
    password_secret_name = "acr-password"
  }

  secret {
    name  = "acr-password"
    value = azurerm_container_registry.this.admin_password
  }

  ingress {
    external_enabled = false
    target_port      = 4437

    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    min_replicas = var.durable_streams_min_replicas
    max_replicas = var.durable_streams_max_replicas

    volume {
      name         = "durable-streams-data"
      storage_type = "AzureFile"
      storage_name = azurerm_container_app_environment_storage.durable_streams.name
    }

    container {
      name   = "durable-streams"
      image  = "${azurerm_container_registry.this.login_server}/${var.durable_streams_image_name}:${var.durable_streams_image_tag}"
      cpu    = var.durable_streams_cpu
      memory = var.durable_streams_memory

      volume_mounts {
        name = "durable-streams-data"
        path = "/var/lib/durable-streams"
      }

      liveness_probe {
        transport               = "TCP"
        port                    = 4437
        initial_delay           = 10
        interval_seconds        = 30
        timeout                 = 5
        failure_count_threshold = 3
      }

      startup_probe {
        transport               = "TCP"
        port                    = 4437
        interval_seconds        = 5
        timeout                 = 3
        failure_count_threshold = 10
      }
    }
  }
}
