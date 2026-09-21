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
  usage: '.bot [on/off]',

  async execute({ sock, msg, from, sender, args }) {
    // Check if sender is owner or message is from self
    const isOwner = msg.key.fromMe || safety.isOwner(sender);
    if (!isOwner) {
      return safety.safeSend(sock, from, {
        text: '⛔ *Access Denied!*\nOnly the bot owner can turn the bot on or off.'
      }, { quoted: msg });
    }

    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
      safety.setBotEnabled(true);
      return safety.safeSend(sock, from, {
        text: `✅ *${config.botName} is now ONLINE!*\nAll features and commands are active.`
      }, { quoted: msg });
    }

    if (action === 'off' || action === 'disable' || action === '0') {
      safety.setBotEnabled(false);
      return safety.safeSend(sock, from, {
        text: `🔴 *${config.botName} is now OFFLINE!*\nBot is sleeping. Send \`.bot on\` to reactivate.`
      }, { quoted: msg });
    }

    // Toggle if no arguments
    const currentState = safety.isBotEnabled();
    const newState = !currentState;
    safety.setBotEnabled(newState);
    const statusText = newState ? '🟢 *ONLINE*' : '🔴 *OFFLINE*';

    await safety.safeSend(sock, from, {
      text: `🤖 *${config.botName} Status:* ${statusText}\n\n• Use \`.bot on\` to activate\n• Use \`.bot off\` to deactivate\n\n_Restricted to bot owner._`
    }, { quoted: msg });
  }
};
