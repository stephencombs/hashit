import { defineConfig } from "oxfmt";

export default defineConfig({
  printWidth: 80,
  ignorePatterns: [
    "node_modules",
    ".agents",
    ".claude",
    ".cursor",
    ".tanstack",
    "dist",
    ".output",
    ".vinxi",
    ".tanstack",
    "data",
    "count.txt",
    "infra/.terraform",
    "infra/terraform.tfvars",
    "infra/*.tfstate",
    "infra/*.tfstate.backup",
  ],
  sortTailwindcss: true,
});
