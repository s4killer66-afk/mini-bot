/**
 * Mini WhatsApp Bot Group Mute Command
 * Command: .mute
 * Only group admins and bot owner can execute.
 * Requires bot to be group admin.
 */

const safety = require('../lib/safety');
const contactStore = require('../lib/contactStore');
const { miniBox } = require('../lib/utils');

module.exports = {
  name: 'mute',
  aliases: ['closegroup', 'mutechat', 'lockgroup', 'close'],
  description: 'Mute group so only admins can send messages',
  usage: '.mute',

  async execute({ sock, msg, from, sender, isGroup, isOwner }) {
    if (!safety.canExecuteCommand(sender)) return;

    if (!isGroup) {
      return safety.safeSend(sock, from, {
        text: '⚠️ This command can only be used in groups.'
      });
    }

    try {
      const meta = await contactStore.getGroupMetadata(sock, from);
      if (!meta) {
        return safety.safeSend(sock, from, {
          text: '⚠️ Failed to retrieve group information. Please try again.'
        });
      }

      // Check bot admin status
      const myId = contactStore.cleanNumber(sock?.user?.id || '');
      const myLid = contactStore.cleanNumber(sock?.user?.lid || '');
      const isBotAdmin = meta.participants.some(p => {
        const pNum = contactStore.cleanNumber(p.jid || p.id || '');
        const pLid = contactStore.cleanNumber(p.lid || '');
        return (pNum === myId || pLid === myLid) && (p.admin === 'admin' || p.admin === 'superadmin');
      });

      if (!isBotAdmin) {
        return safety.safeSend(sock, from, {
          text: '⚠️ *Bot is Not Admin:*\nPlease make the bot an admin of this group first.'
        });
      }

      // Check sender admin status or owner
      const senderClean = contactStore.cleanNumber(sender);
      const isSenderAdmin = isOwner || meta.participants.some(p => {
        const pNum = contactStore.cleanNumber(p.jid || p.id || '');
        const pLid = contactStore.cleanNumber(p.lid || '');
        return (pNum === senderClean || pLid === senderClean) && (p.admin === 'admin' || p.admin === 'superadmin');
      });

      if (!isSenderAdmin) {
        return safety.safeSend(sock, from, {
          text: '❌ *Permission Denied:*\nOnly group admins and the bot owner can mute this group.'
        });
      }

      // Mute group (announcement mode: only admins can message)
      await sock.groupSettingUpdate(from, 'announcement');

      const body = `
🔒 *GROUP MUTED*
Only group admins can send messages now.

👤 *Action by:* @${senderClean}
`.trim();

      const output = miniBox('GROUP SETTINGS', body, 'MINI BOT');
      return safety.safeSend(sock, from, {
        text: output,
        mentions: [sender]
      });

    } catch (err) {
      console.error('[Mute Command Error]:', err.message);
      return safety.safeSend(sock, from, {
        text: `⚠️ *Error muting group:* ${err.message}`
      });
    }
  }
};
