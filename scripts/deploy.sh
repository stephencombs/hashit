#!/usr/bin/env bash
set -euo pipefail

: "${RESOURCE_GROUP:=scombs-dev}"
: "${APP_NAME:=hashit}"
: "${ACR_NAME:=hashit}"
: "${ACR_SERVER:=${ACR_NAME}.azurecr.io}"
: "${PLATFORM:=linux/amd64}"

# Unique tag per deploy so Container Apps always rolls a new revision.
# Azure Container Apps resolves image tags to digests at revision-create time
# and will NOT create a new revision if the image reference string is unchanged.
if [[ -z "${IMAGE_TAG:-}" ]]; then
  if git -C "$(dirname "$0")/.." rev-parse --short HEAD >/dev/null 2>&1; then
    IMAGE_TAG="$(git -C "$(dirname "$0")/.." rev-parse --short HEAD)"
    if ! git -C "$(dirname "$0")/.." diff-index --quiet HEAD -- 2>/dev/null; then
      IMAGE_TAG="${IMAGE_TAG}-dirty-$(date +%s)"
    fi
  else
    IMAGE_TAG="$(date +%s)"
  fi
fi

IMAGE="${ACR_SERVER}/${APP_NAME}:${IMAGE_TAG}"
LATEST="${ACR_SERVER}/${APP_NAME}:latest"

echo "==> Logging in to ACR (${ACR_NAME})"
az acr login --name "${ACR_NAME}" >/dev/null

echo "==> Building ${IMAGE} for ${PLATFORM}"
docker build --platform "${PLATFORM}" -t "${IMAGE}" -t "${LATEST}" .

echo "==> Pushing ${IMAGE}"
docker push "${IMAGE}"
echo "==> Pushing ${LATEST}"
docker push "${LATEST}"

echo "==> Rolling Container App ${APP_NAME} in ${RESOURCE_GROUP} to ${IMAGE_TAG}"
az containerapp update \
  --name "${APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --image "${IMAGE}" >/dev/null

FQDN=$(az containerapp show \
  --name "${APP_NAME}" \
  --resource-group "${RESOURCE_GROUP}" \
  --query properties.configuration.ingress.fqdn -o tsv)

echo "==> Deployed ${IMAGE_TAG}. App URL: https://${FQDN}"
