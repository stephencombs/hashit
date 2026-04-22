#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

RESOURCE_GROUP="${RESOURCE_GROUP:-scombs-dev}"
APP_NAME="${APP_NAME:-hashit}"
DURABLE_APP_NAME="${DURABLE_APP_NAME:-${APP_NAME}-durable-streams}"
ACR_NAME="${ACR_NAME:-hashit}"
ACR_SERVER="${ACR_SERVER:-${ACR_NAME}.azurecr.io}"
PLATFORM="${PLATFORM:-linux/amd64}"
INFRA_DIR="${INFRA_DIR:-${REPO_ROOT}/infra}"
TERRAFORM_MODE="${TERRAFORM_MODE:-auto}" # auto|apply|plan|skip
TFVARS_FILE="${TFVARS_FILE:-terraform.tfvars}"
DURABLE_IMAGE_NAME="${DURABLE_IMAGE_NAME:-durable-streams}"
DURABLE_STREAMS_REF="${DURABLE_STREAMS_REF:-main}"
DRY_RUN=false
ASSUME_YES=false
SKIP_BUILD=false
SKIP_PUSH=false

usage() {
  cat <<'EOF'
Usage:
  scripts/deploy.sh [options]

Options:
  --resource-group <name>          Azure resource group (default: scombs-dev)
  --app-name <name>                Main app container app name (default: hashit)
  --durable-app-name <name>        Durable streams app name (default: <app-name>-durable-streams)
  --acr-name <name>                Azure Container Registry name (default: hashit)
  --acr-server <server>            ACR login server (default: <acr-name>.azurecr.io)
  --platform <platform>            Docker platform (default: linux/amd64)
  --image-tag <tag>                Main app image tag (default: git sha or timestamp)
  --durable-image-tag <tag>        Durable image tag (default: --image-tag)
  --durable-image-name <name>      Durable image repo name (default: durable-streams)
  --durable-streams-ref <ref>      Durable Streams caddy ref for go install (default: main)
  --terraform <mode>               auto|apply|plan|skip (default: auto)
  --infra-dir <path>               Terraform directory (default: ./infra)
  --tfvars-file <path>             Tfvars file under infra dir (default: terraform.tfvars)
  --skip-build                     Skip docker build
  --skip-push                      Skip docker push
  --dry-run                        Print commands without executing
  --yes                            Skip confirmation prompts
  -h, --help                       Show this help

Examples:
  scripts/deploy.sh --terraform auto
  scripts/deploy.sh --image-tag v1.2.3 --durable-image-tag v1.2.3 --terraform apply --yes
  scripts/deploy.sh --skip-build --skip-push --terraform plan
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --resource-group) RESOURCE_GROUP="$2"; shift 2 ;;
    --app-name) APP_NAME="$2"; shift 2 ;;
    --durable-app-name) DURABLE_APP_NAME="$2"; shift 2 ;;
    --acr-name) ACR_NAME="$2"; shift 2 ;;
    --acr-server) ACR_SERVER="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --image-tag) IMAGE_TAG="$2"; shift 2 ;;
    --durable-image-tag) DURABLE_IMAGE_TAG="$2"; shift 2 ;;
    --durable-image-name) DURABLE_IMAGE_NAME="$2"; shift 2 ;;
    --durable-streams-ref) DURABLE_STREAMS_REF="$2"; shift 2 ;;
    --terraform) TERRAFORM_MODE="$2"; shift 2 ;;
    --infra-dir) INFRA_DIR="$2"; shift 2 ;;
    --tfvars-file) TFVARS_FILE="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --skip-push) SKIP_PUSH=true; shift ;;
    --dry-run) DRY_RUN=true; shift ;;
    --yes) ASSUME_YES=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Error: Unknown option '$1'" >&2
      usage
      exit 1
      ;;
  esac
done

case "${TERRAFORM_MODE}" in
  auto|apply|plan|skip) ;;
  *)
    echo "Error: --terraform must be one of: auto, apply, plan, skip" >&2
    exit 1
    ;;
esac

if [[ -z "${IMAGE_TAG:-}" ]]; then
  if git -C "${REPO_ROOT}" rev-parse --short HEAD >/dev/null 2>&1; then
    IMAGE_TAG="$(git -C "${REPO_ROOT}" rev-parse --short HEAD)"
    if ! git -C "${REPO_ROOT}" diff-index --quiet HEAD -- 2>/dev/null; then
      IMAGE_TAG="${IMAGE_TAG}-dirty-$(date +%s)"
    fi
  else
    IMAGE_TAG="$(date +%s)"
  fi
fi

DURABLE_IMAGE_TAG="${DURABLE_IMAGE_TAG:-${IMAGE_TAG}}"

APP_IMAGE="${ACR_SERVER}/${APP_NAME}:${IMAGE_TAG}"
APP_IMAGE_LATEST="${ACR_SERVER}/${APP_NAME}:latest"
DURABLE_IMAGE="${ACR_SERVER}/${DURABLE_IMAGE_NAME}:${DURABLE_IMAGE_TAG}"
DURABLE_IMAGE_LATEST="${ACR_SERVER}/${DURABLE_IMAGE_NAME}:latest"

run() {
  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "[dry-run] $*"
  else
    "$@"
  fi
}

tfvars_declares_var() {
  local key="$1"
  local file="$2"
  [[ -f "${file}" ]] || return 1
  grep -Eq "^[[:space:]]*${key}[[:space:]]*=" "${file}"
}

platform_goos() {
  local platform="$1"
  echo "${platform%%/*}"
}

platform_goarch() {
  local platform="$1"
  local rest="${platform#*/}"
  echo "${rest%%/*}"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Error: Missing required command '$1'" >&2
    exit 1
  fi
}

container_app_exists() {
  az containerapp show -g "${RESOURCE_GROUP}" -n "$1" --query "name" -o tsv >/dev/null 2>&1
}

main_app_has_durable_env() {
  local value
  value="$(az containerapp show -g "${RESOURCE_GROUP}" -n "${APP_NAME}" --query "properties.template.containers[0].env[?name=='DURABLE_STREAMS_URL'] | [0].value" -o tsv 2>/dev/null || true)"
  [[ -n "${value}" && "${value}" != "None" ]]
}

confirm() {
  local prompt="$1"
  if [[ "${ASSUME_YES}" == "true" ]]; then
    return 0
  fi
  read -r -p "${prompt} [y/N]: " answer
  [[ "${answer}" == "y" || "${answer}" == "Y" ]]
}

durable_build_ctx=""
durable_gopath=""
cleanup() {
  if [[ -n "${durable_build_ctx}" && -d "${durable_build_ctx}" ]]; then
    chmod -R u+w "${durable_build_ctx}" 2>/dev/null || true
    rm -rf "${durable_build_ctx}" 2>/dev/null || true
  fi
  if [[ -n "${durable_gopath}" && -d "${durable_gopath}" ]]; then
    chmod -R u+w "${durable_gopath}" 2>/dev/null || true
    rm -rf "${durable_gopath}" 2>/dev/null || true
  fi
}
trap cleanup EXIT

terraform_var_args=(
  -var "resource_group_name=${RESOURCE_GROUP}"
  -var "app_name=${APP_NAME}"
  -var "image_tag=${IMAGE_TAG}"
  -var "durable_streams_image_name=${DURABLE_IMAGE_NAME}"
  -var "durable_streams_image_tag=${DURABLE_IMAGE_TAG}"
)

if [[ "${TFVARS_FILE}" = /* ]]; then
  tfvars_path="${TFVARS_FILE}"
else
  tfvars_path="${INFRA_DIR}/${TFVARS_FILE}"
fi

if [[ -f "${tfvars_path}" ]]; then
  terraform_var_args+=(-var-file="${tfvars_path}")
fi

require_cmd az
require_cmd docker
require_cmd terraform
if [[ "${SKIP_BUILD}" == "false" ]]; then
  require_cmd go
fi

echo "==> Deploy config"
echo "resource_group: ${RESOURCE_GROUP}"
echo "app_name: ${APP_NAME}"
echo "durable_app_name: ${DURABLE_APP_NAME}"
echo "app_image: ${APP_IMAGE}"
echo "durable_image: ${DURABLE_IMAGE}"
echo "durable_streams_ref: ${DURABLE_STREAMS_REF}"
echo "terraform_mode: ${TERRAFORM_MODE}"
echo "infra_dir: ${INFRA_DIR}"

if [[ "${DRY_RUN}" == "false" ]]; then
  az account show --query "{name:name,id:id}" -o json >/dev/null
fi

echo "==> Logging in to ACR (${ACR_NAME})"
run az acr login --name "${ACR_NAME}"

resolved_terraform_mode="${TERRAFORM_MODE}"
if [[ "${TERRAFORM_MODE}" == "auto" ]]; then
  if container_app_exists "${DURABLE_APP_NAME}" && main_app_has_durable_env; then
    resolved_terraform_mode="skip"
    echo "==> Durable infra already present; skipping Terraform apply (auto mode)."
  else
    resolved_terraform_mode="apply"
    echo "==> Durable infra missing/incomplete; will run Terraform apply (auto mode)."
  fi
fi

if [[ -z "${TF_VAR_postgres_admin_password:-}" && -n "${POSTGRES_ADMIN_PASSWORD:-}" ]]; then
  export TF_VAR_postgres_admin_password="${POSTGRES_ADMIN_PASSWORD}"
fi

if [[ "${resolved_terraform_mode}" != "skip" && "${DRY_RUN}" == "false" ]]; then
  if [[ -z "${TF_VAR_postgres_admin_password:-}" ]] && ! tfvars_declares_var "postgres_admin_password" "${tfvars_path}"; then
    echo "Error: postgres_admin_password is required for Terraform but not set." >&2
    echo "Set TF_VAR_postgres_admin_password (or POSTGRES_ADMIN_PASSWORD), or add postgres_admin_password to ${tfvars_path}." >&2
    exit 1
  fi
fi

if [[ "${SKIP_BUILD}" == "false" ]]; then
  durable_goos="$(platform_goos "${PLATFORM}")"
  durable_goarch="$(platform_goarch "${PLATFORM}")"
  if [[ "${durable_goos}" != "linux" ]]; then
    echo "Error: --platform must target linux for Azure Container Apps (got: ${PLATFORM})" >&2
    exit 1
  fi
  case "${durable_goarch}" in
    amd64|arm64) ;;
    *)
      echo "Error: Unsupported Go architecture '${durable_goarch}' derived from --platform ${PLATFORM}" >&2
      exit 1
      ;;
  esac

  durable_build_ctx="$(mktemp -d)"
  durable_gopath="$(mktemp -d)"
  cp "${REPO_ROOT}/infra/durable-streams/Caddyfile" "${durable_build_ctx}/Caddyfile"
  echo "==> Building durable-streams-server binary (${DURABLE_STREAMS_REF}) for ${durable_goos}/${durable_goarch}"
  run env CGO_ENABLED=0 GOOS="${durable_goos}" GOARCH="${durable_goarch}" GOPATH="${durable_gopath}" \
    go install "github.com/durable-streams/durable-streams/packages/caddy-plugin/cmd/caddy@${DURABLE_STREAMS_REF}"
  if [[ "${DRY_RUN}" == "false" ]]; then
    durable_binary="${durable_gopath}/bin/${durable_goos}_${durable_goarch}/caddy"
    if [[ ! -f "${durable_binary}" ]]; then
      durable_binary="${durable_gopath}/bin/caddy"
    fi
    if [[ ! -f "${durable_binary}" ]]; then
      echo "Error: Expected caddy binary was not produced under ${durable_gopath}/bin" >&2
      exit 1
    fi
    cp "${durable_binary}" "${durable_build_ctx}/durable-streams-server"
  fi

  echo "==> Building ${APP_IMAGE}"
  run docker build --platform "${PLATFORM}" -t "${APP_IMAGE}" -t "${APP_IMAGE_LATEST}" "${REPO_ROOT}"

  echo "==> Building ${DURABLE_IMAGE}"
  run docker build --platform "${PLATFORM}" -f "${REPO_ROOT}/Dockerfile.durable-streams" -t "${DURABLE_IMAGE}" -t "${DURABLE_IMAGE_LATEST}" "${durable_build_ctx}"
fi

if [[ "${SKIP_PUSH}" == "false" ]]; then
  echo "==> Pushing ${APP_IMAGE}"
  run docker push "${APP_IMAGE}"
  echo "==> Pushing ${APP_IMAGE_LATEST}"
  run docker push "${APP_IMAGE_LATEST}"

  echo "==> Pushing ${DURABLE_IMAGE}"
  run docker push "${DURABLE_IMAGE}"
  echo "==> Pushing ${DURABLE_IMAGE_LATEST}"
  run docker push "${DURABLE_IMAGE_LATEST}"
fi

pushd "${INFRA_DIR}" >/dev/null
echo "==> Terraform init"
run terraform init -reconfigure -no-color

case "${resolved_terraform_mode}" in
  apply)
    if confirm "Run terraform apply to provision/update Container Apps and env wiring?"; then
      run terraform apply -no-color -input=false -auto-approve "${terraform_var_args[@]}"
    else
      echo "Error: Terraform apply skipped by user, deployment cannot ensure durable streams wiring." >&2
      exit 1
    fi
    ;;
  plan)
    run terraform plan -no-color -input=false "${terraform_var_args[@]}"
    ;;
  skip)
    echo "==> Skipping Terraform as requested."
    ;;
esac
popd >/dev/null

if [[ "${resolved_terraform_mode}" == "skip" ]]; then
  echo "==> Rolling main app image without Terraform"
  run az containerapp update -n "${APP_NAME}" -g "${RESOURCE_GROUP}" --image "${APP_IMAGE}"

  if [[ "${DRY_RUN}" == "true" ]]; then
    echo "==> Rolling durable streams image without Terraform"
    run az containerapp update -n "${DURABLE_APP_NAME}" -g "${RESOURCE_GROUP}" --image "${DURABLE_IMAGE}"
  elif container_app_exists "${DURABLE_APP_NAME}"; then
    echo "==> Rolling durable streams image without Terraform"
    run az containerapp update -n "${DURABLE_APP_NAME}" -g "${RESOURCE_GROUP}" --image "${DURABLE_IMAGE}"
  else
    echo "Error: ${DURABLE_APP_NAME} does not exist. Re-run with --terraform apply." >&2
    exit 1
  fi
fi

if [[ "${DRY_RUN}" == "false" ]]; then
  app_fqdn="$(az containerapp show -n "${APP_NAME}" -g "${RESOURCE_GROUP}" --query properties.configuration.ingress.fqdn -o tsv)"
  durable_fqdn="$(az containerapp show -n "${DURABLE_APP_NAME}" -g "${RESOURCE_GROUP}" --query properties.configuration.ingress.fqdn -o tsv 2>/dev/null || true)"
  durable_env="$(az containerapp show -n "${APP_NAME}" -g "${RESOURCE_GROUP}" --query "properties.template.containers[0].env[?name=='DURABLE_STREAMS_URL'] | [0].value" -o tsv 2>/dev/null || true)"

  echo "==> Deployment complete"
  echo "app_url: https://${app_fqdn}"
  echo "app_image: ${APP_IMAGE}"
  echo "durable_app: ${DURABLE_APP_NAME}"
  echo "durable_fqdn: ${durable_fqdn:-<none>}"
  echo "durable_image: ${DURABLE_IMAGE}"
  echo "durable_streams_url_env: ${durable_env:-<missing>}"
fi
