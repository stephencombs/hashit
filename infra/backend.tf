terraform {
  backend "azurerm" {
    resource_group_name  = "rg-hashit-tfstate"
    storage_account_name = "hashittfstate"
    container_name       = "tfstate"
    key                  = "hashit.terraform.tfstate"
  }
}
