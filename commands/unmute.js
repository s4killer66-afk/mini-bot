/**
 * Mini WhatsApp Bot Group Unmute Command
 * Command: .unmute
 * Only group admins and bot owner can execute.
 * Requires bot to be group admin.
 */

const safety = require('../lib/safety');
const contactStore = require('../lib/contactStore');
const { miniBox } = require('../lib/utils');

module.exports = {
  name: 'unmute',
  aliases: ['opengroup', 'unmutechat', 'unlockgroup', 'open'],
  description: 'Unmute group so all participants can send messages',
  usage: '.unmute',

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
          text: '❌ *Permission Denied:*\nOnly group admins and the bot owner can unmute this group.'
        });
      }

      // Unmute group (all participants can message)
      await sock.groupSettingUpdate(from, 'not_announcement');

      const body = `
🔓 *GROUP UNMUTED*
All participants can now send messages.

👤 *Action by:* Admin (${senderClean})
`.trim();

      const output = miniBox('GROUP SETTINGS', body, 'MINI BOT');
      return safety.safeSend(sock, from, {
        text: output
      });

    } catch (err) {
      console.error('[Unmute Command Error]:', err.message);
      return safety.safeSend(sock, from, {
        text: `⚠️ *Error unmuting group:* ${err.message}`
      });
    }
  }
};
