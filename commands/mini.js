/**
 * Mini WhatsApp Bot Master Power Switch & Security Mode Command
 * .mini on   — Enable all bot features
 * .mini off  — Put bot in offline mode
 * .mini mode — Configure security mode (public / groups / self)
 * .mini      — Check power status & security dashboard
 */

const safety = require('../lib/safety');
const config = require('../config');

module.exports = {
  name: 'mini',
  aliases: ['minibot', 'power', 'switch', 'minion', 'minioff', 'turnon', 'turnoff'],
  description: 'Turn the bot on or off, or configure security mode (Owner only)',
  usage: '.mini [on/off/mode]',

  async execute({ sock, msg, from, sender, args, commandName }) {
    // Check if sender is owner or message is from self
    const isOwner = msg.key.fromMe || 
      safety.isOwner(sender) || 
      safety.isOwner(from) || 
      (safety.lastPowerSender && (sender === safety.lastPowerSender || from === safety.lastPowerSender));

    if (!isOwner) {
      return safety.safeSend(sock, from, {
        text: '⛔ *Access Denied!*\nOnly the bot owner can configure bot power and security modes.'
      });
    }

    let action = args[0]?.toLowerCase();
    if (commandName === 'minion' || commandName === 'turnon') action = 'on';
    if (commandName === 'minioff' || commandName === 'turnoff') action = 'off';

    if (action === 'on' || action === 'enable' || action === '1' || action === 'start' || action === 'activate') {
      safety.setBotEnabled(true);
      safety.lastPowerSender = sender;
      return safety.safeSend(sock, from, {
        text: `✅ *${config.botName} is now ONLINE!*\n🛡️ *Security Shield:* Active (Mode: \`${safety.getMode().toUpperCase()}\`)\nAll features and commands are active.`
      });
    }

    if (action === 'off' || action === 'disable' || action === '0' || action === 'stop' || action === 'sleep') {
      safety.setBotEnabled(false);
      safety.lastPowerSender = sender;
      return safety.safeSend(sock, from, {
        text: `🔴 *${config.botName} is now OFFLINE!*\nBot is sleeping. Send \`.mini on\` or \`mini on\` to reactivate.`
      });
    }

    if (action === 'mode') {
      const targetMode = args[1]?.toLowerCase();
      if (['public', 'groups', 'self'].includes(targetMode)) {
        safety.setMode(targetMode);
        return safety.safeSend(sock, from, {
          text: `🛡️ *Security Mode Changed:* \`${targetMode.toUpperCase()}\`\n\n• *PUBLIC:* Responds to all users everywhere\n• *GROUPS:* Responds in groups & owner DM only (prevents stranger DMs)\n• *SELF:* Responds ONLY to YOU (100% private, 0% ban risk)`
        });
      }
      return safety.safeSend(sock, from, {
        text: `🛡️ *Current Security Mode:* \`${safety.getMode().toUpperCase()}\`\n\n*Change Mode:*\n• \`.mini mode public\` (All chats)\n• \`.mini mode groups\` (Groups + Owner only)\n• \`.mini mode self\` (Owner only — 100% immune to reports)`
      });
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
• \`.mini on\` — Activate bot
• \`.mini off\` — Put bot offline
• \`.mini mode self\` — 100% private (owner only, zero ban risk)
• \`.mini mode groups\` — Groups + Owner only
• \`.mini mode public\` — All chats active`
    });
  }
};
