variable "resource_group_name" {
  description = "Name of the Azure resource group"
  type        = string
  default     = "scombs-dev"
}

variable "app_name" {
  description = "Application name used as a prefix for resource names"
  type        = string
  default     = "hashit"
}

variable "image_tag" {
  description = "Container image tag to deploy"
  type        = string
  default     = "latest"
}

# --- PostgreSQL ---

variable "postgres_location" {
  description = "Azure region for PostgreSQL Flexible Server (may differ from resource group location if that region is restricted)"
  type        = string
  default     = "eastus2"
}

variable "postgres_admin_login" {
  description = "Administrator login for PostgreSQL Flexible Server"
  type        = string
  default     = "hashitadmin"
}

variable "postgres_admin_password" {
  description = "Administrator password for PostgreSQL Flexible Server"
  type        = string
  sensitive   = true
}

# --- Secrets ---

variable "azure_openai_api_key" {
  description = "Azure OpenAI API key"
  type        = string
  sensitive   = true
}

variable "azure_openai_endpoint" {
  description = "Azure OpenAI endpoint URL"
  type        = string
  sensitive   = true
}

variable "azure_openai_deployment" {
  description = "Azure OpenAI deployment/model name"
  type        = string
  sensitive   = true
}

variable "mcp_subscription_key" {
  description = "MCP Ocp-Apim-Subscription-Key for STS"
  type        = string
  sensitive   = true
}

variable "mcp_client_id" {
  description = "MCP OAuth client ID"
  type        = string
  sensitive   = true
}

variable "mcp_client_secret" {
  description = "MCP OAuth client secret"
  type        = string
  sensitive   = true
}

# --- Blob Storage ---

variable "blob_container_name" {
  description = "Name of the Azure Blob Storage container for prompt attachments"
  type        = string
  default     = "prompt-attachments"
}

