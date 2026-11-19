import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

function configPath() {
  if (process.platform === "win32" && process.env.APPDATA) return join(process.env.APPDATA, "Pairpoll", "config.json");
  return join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "pairpoll", "config.json");
}

export async function readConfig() {
  try {
    return JSON.parse(await readFile(configPath(), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return {};
    throw error;
  }
}

export async function writeConfig(config) {
  const file = configPath();
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  await chmod(file, 0o600);
}

export async function clearConfig() {
  await rm(configPath(), { force: true });
}
