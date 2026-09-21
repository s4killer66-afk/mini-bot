/**
 * Anti-Delete Toggle Command
 * Controls automatic recovery of deleted messages & media
 */

const antiDelete = require('../lib/antiDelete');
const safety = require('../lib/safety');

module.exports = {
  name: 'antidelet',
  aliases: ['antidelete', 'antidel', 'antirevoke'],
  description: 'Enable or disable Anti-Delete message recovery',
  usage: '.antidelet [on/off]',

  async execute({ sock, msg, from, sender, args, isOwner }) {
    const authorized = isOwner || msg.key.fromMe || safety.isOwner(sender) || safety.isOwner(from);
    if (!authorized) {
      return safety.safeSend(sock, from, {
        text: '⛔ *Access Denied!*\nOnly the bot owner can configure Anti-Delete settings.'
      }, { quoted: msg });
    }

    if (!safety.canExecuteCommand(sender)) return;

    const action = args[0]?.toLowerCase();

    if (action === 'on' || action === 'enable' || action === '1') {
      antiDelete.enabled = true;
      return safety.safeSend(sock, from, {
        text: '🛡️ *Anti-Delete Enabled!*\nThe bot will now automatically recover deleted messages and media silently to your inbox.'
      }, { quoted: msg });
    }

    if (action === 'off' || action === 'disable' || action === '0') {
      antiDelete.enabled = false;
      return safety.safeSend(sock, from, {
        text: '⚠️ *Anti-Delete Disabled!*\nDeleted messages will not be recovered.'
      }, { quoted: msg });
    }

    // Toggle if no argument provided
    antiDelete.enabled = !antiDelete.enabled;
    const status = antiDelete.enabled ? '🟢 *ENABLED*' : '🔴 *DISABLED*';

    await safety.safeSend(sock, from, {
      text: `🛡️ *Anti-Delete Status:* ${status}\n\n• Use \`.antidelet on\` to activate\n• Use \`.antidelet off\` to deactivate`
    }, { quoted: msg });
  }
};
