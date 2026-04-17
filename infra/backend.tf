terraform {
  backend "azurerm" {
    resource_group_name  = "scombs-dev"
    storage_account_name = "hashittfstate"
    container_name       = "tfstate"
    key                  = "hashit.terraform.tfstate"
  }
}
