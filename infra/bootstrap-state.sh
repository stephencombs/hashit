#!/usr/bin/env bash
set -euo pipefail

RESOURCE_GROUP="rg-hashit-tfstate"
LOCATION="eastus2"
STORAGE_ACCOUNT="hashittfstate"
CONTAINER="tfstate"

az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"

az storage account create \
  --name "$STORAGE_ACCOUNT" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --sku Standard_LRS \
  --min-tls-version TLS1_2 \
  --allow-blob-public-access false

az storage container create \
  --name "$CONTAINER" \
  --account-name "$STORAGE_ACCOUNT"

echo "Terraform state backend ready."
echo "  Resource Group:  $RESOURCE_GROUP"
echo "  Storage Account: $STORAGE_ACCOUNT"
echo "  Container:       $CONTAINER"
