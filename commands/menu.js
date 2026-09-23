/**
 * Mini WhatsApp Bot Menu & Help Command
 */

const { miniBox } = require('../lib/utils');
const config = require('../config');
const safety = require('../lib/safety');
const antiDelete = require('../lib/antiDelete');

module.exports = {
  name: 'menu',
  aliases: ['help', 'commands', 'alive', 'ping', 'info'],
  description: 'Show bot commands and operational status',
  usage: '.menu',

  async execute({ sock, msg, from, sender, isGroup }) {
    const p = config.prefix || '.';
    const botStatus = safety.isBotEnabled() ? '🟢 ONLINE' : '🔴 OFFLINE';
    const antiDelStatus = antiDelete.enabled ? '🟢 ACTIVE' : '🔴 DISABLED';

    const body = `
⚡ *MINI WHATSAPP BOT*
Status: ${botStatus} | Anti-Delete: ${antiDelStatus}

📋 *AVAILABLE COMMANDS:*

🎬 *CINEMA & MOVIES (DUAL AUDIO & HINDI)*
• \`${p}movie <name>\`
  Hollywood & Bollywood movies with Dual Audio (Hindi/English) & Full Controls.
  _Example:_ \`${p}movie pushpa 2\` or \`${p}movie titanic\`

🇰🇷 *KOREAN MOVIES (ENG SUBS & DUAL AUDIO)*
• \`${p}kmovie <name>\` (or \`${p}kmovies\`)
  Dedicated Korean Cinema with English Subtitles, English Dub & HD streaming.
  _Example:_ \`${p}kmovie parasite\` or \`${p}kmovie train to busan\`

📺 *WEB SERIES (HOLLYWOOD & BOLLYWOOD)*
• \`${p}series <name> [season] [episode]\`
  Hollywood, Bollywood web series with Dual Audio & season/episode streaming.
  _Example:_ \`${p}series mirzapur 3\` or \`${p}series stranger things 4 1\`

🇰🇷 *K-DRAMAS & KOREAN SERIES (ENG SUBS & DUB)*
• \`${p}kseries <name> [season] [episode]\` (or \`${p}kdrama\`)
  Korean Dramas & Series with Episode Select, English Subtitles & Dual Language.
  _Example:_ \`${p}kseries squid game 2 1\` or \`${p}kdrama queen of tears\`

🍙 *ANIME STREAMING (SUB & DUB)*
• \`${p}anime <name> [episode]\`
  Universal anime search with Episode Select, English Sub & Dub.
  _Example:_ \`${p}anime solo leveling 2\`

👥 *GROUP MANAGEMENT (ADMIN ONLY)*
• \`${p}mute\` — Mute group so only admins can send messages
• \`${p}unmute\` — Unmute group so all participants can send messages

🔓 *VIEW-ONCE DOWNLOADER*
• \`${p}viewonce\` (or \`${p}vv\`)
  Reply to any View-Once photo, video, or voice note to unlock it silently.

🛡️ *ANTI-DELETE RECOVERY*
• \`${p}antidelet on\` — Enable message recovery
• \`${p}antidelet off\` — Disable message recovery
• \`${p}antidelet\` — Check status

🤖 *BOT MASTER POWER SWITCH (OWNER ONLY)*
• \`${p}mini on\` — Bring bot online
• \`${p}mini off\` — Put bot to sleep
• \`${p}mini mode [public/groups/self]\` — Set who can use commands
• \`${p}mini\` — Check power status & diagnostics

ℹ️ *UTILITIES*
• \`${p}menu\` / \`${p}ping\` — Show this menu
`.trim();

    const output = miniBox('BOT MENU', body, config.botName || 'MINI BOT');
    await safety.safeSend(sock, from, { text: output });
  }
};
