/**
 * Bot Master Power Switch Command
 * .bot on  — Enable all bot features
 * .bot off — Put bot in offline mode
 * .bot     — Check status
 */

const safety = require('../lib/safety');
const config = require('../config');

module.exports = {
  name: 'bot',
  aliases: ['switch', 'power'],
  description: 'Turn the bot on or off (Owner only)',
  usage: '.bot [on/off/mode]',

  async execute({ sock, msg, from, sender, args }) {
    // Check if sender is owner or message is from self
    const isOwner = msg.key.fromMe || safety.isOwner(sender) || safety.isOwner(from);
    if (!isOwner) {
      return safety.safeSend(sock, from, {
        text: '⛔ *Access Denied!*\nOnly the bot owner can configure bot power and security modes.'
      }, { quoted: msg });
    }

    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
      safety.setBotEnabled(true);
      return safety.safeSend(sock, from, {
        text: `✅ *${config.botName} is now ONLINE!*\n🛡️ *Security Shield:* Active (Mode: \`${safety.getMode().toUpperCase()}\`)\nAll features and commands are active.`
      }, { quoted: msg });
    }

    if (action === 'off' || action === 'disable' || action === '0') {
      safety.setBotEnabled(false);
      return safety.safeSend(sock, from, {
        text: `🔴 *${config.botName} is now OFFLINE!*\nBot is sleeping. Send \`.bot on\` to reactivate.`
      }, { quoted: msg });
    }

    if (action === 'mode') {
      const targetMode = args[1]?.toLowerCase();
      if (['public', 'groups', 'self'].includes(targetMode)) {
        safety.setMode(targetMode);
        return safety.safeSend(sock, from, {
          text: `🛡️ *Security Mode Changed:* \`${targetMode.toUpperCase()}\`\n\n• *PUBLIC:* Responds to all users everywhere\n• *GROUPS:* Responds in groups & owner DM only (prevents stranger DMs)\n• *SELF:* Responds ONLY to YOU (100% private, 0% ban risk)`
        }, { quoted: msg });
      }
      return safety.safeSend(sock, from, {
        text: `🛡️ *Current Security Mode:* \`${safety.getMode().toUpperCase()}\`\n\n*Change Mode:*\n• \`.bot mode public\` (All chats)\n• \`.bot mode groups\` (Groups + Owner only)\n• \`.bot mode self\` (Owner only — 100% immune to reports)`
      }, { quoted: msg });
    }

    // Status display
    const isOnline = safety.isBotEnabled();
    const statusText = isOnline ? '🟢 *ONLINE*' : '🔴 *OFFLINE*';
    const currentMode = safety.getMode().toUpperCase();

    await safety.safeSend(sock, from, {
      text: `🤖 *${config.botName} Security & Power Dashboard:*

📊 *Status:* ${statusText}
🛡️ *Anti-Ban Mode:* \`${currentMode}\`
🔒 *Anti-Delete:* 100% Silent Ghost Mode
👁️ *View-Once:* Private Inbox Mode
⏱️ *Human Emulation Delay:* 350ms–750ms
🚫 *Spam Strike Shield:* Enabled

*Commands:*
• \`.bot on\` — Activate bot
• \`.bot off\` — Put bot offline
• \`.bot mode self\` — 100% private (owner only, zero ban risk)
• \`.bot mode groups\` — Groups + Owner only
• \`.bot mode public\` — All chats active`
    }, { quoted: msg });
  }
};
