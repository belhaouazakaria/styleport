import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { discoverGrowthTelegramPrivateChat } from "@/lib/growth/reporting/pairing";

/**
 * Never print tokens, message updates, pairing codes, chat IDs or response
 * bodies. Save only the numeric verified ID with permissions 0600.
 */
async function main() {
  try {
    const chatId = await discoverGrowthTelegramPrivateChat();
    const directory = join(homedir(), ".config", "saytwist");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const path = join(directory, "telegram-private-chat-id");
    const file = await open(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
    try {
      await file.writeFile(chatId + "\n", { encoding: "utf8" });
    } finally {
      await file.close();
    }
    console.log("[growth-telegram] Private recipient ID saved in the operator's restricted configuration directory.");
    console.log("[growth-telegram] No Telegram message sent. Do not commit or share the private ID file.");
  } catch {
    console.error("[growth-telegram] Pairing discovery blocked. Check the private /start code and an unused bot.");
    process.exitCode = 1;
  }
}

void main();
