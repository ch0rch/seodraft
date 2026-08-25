/**
 * Provider registry. The skill content is identical across providers —
 * only the harness wrapper folder differs (conventions per impeccable).
 * Renaming the product touches package.json, folder names, and this
 * constant; nothing else hardcodes it.
 */
export const PRODUCT_NAME = "seodraft";

export const PROVIDERS = {
  claude: { harnessDir: ".claude", label: "Claude Code" },
  codex: { harnessDir: ".agents", label: "Codex" },
  cursor: { harnessDir: ".cursor", label: "Cursor" },
  gemini: { harnessDir: ".gemini", label: "Gemini CLI" },
  opencode: { harnessDir: ".opencode", label: "OpenCode" },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

/** Path of the installed skill inside a harness dir. */
export function skillDirFor(providerId) {
  return `${PROVIDERS[providerId].harnessDir}/skills/${PRODUCT_NAME}`;
}
