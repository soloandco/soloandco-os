import fs from "node:fs";
import path from "node:path";

const REQUIRED_SECTIONS = ["pricing", "contacts", "counterparties", "issuer", "output"];

export function loadConfig(configPath) {
  const raw = fs.readFileSync(configPath, "utf8");
  const config = JSON.parse(raw);

  if (!config.workspace_root) {
    throw new Error("config: workspace_root 가 비어 있다");
  }
  if (!fs.existsSync(config.workspace_root)) {
    throw new Error("config: workspace_root 경로가 없다");
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!config[section]) {
      throw new Error(`config: ${section} 절이 없다`);
    }
  }

  config.workspace_root = path.resolve(config.workspace_root);
  config.brand = config.brand ?? {};
  return config;
}

export function resolveInWorkspace(config, relativePath) {
  const root = config.workspace_root;
  const target = path.resolve(root, relativePath);
  const inside = target === root || target.startsWith(root + path.sep);
  if (!inside) {
    throw new Error("경로가 워크스페이스 밖을 가리킨다");
  }
  return target;
}
