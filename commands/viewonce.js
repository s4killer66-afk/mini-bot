/**
 * View Once Media Downloader — 100% PRIVATE & SILENT
 * Unlocks View-Once photos, videos, and voice notes.
 * Delivers EXCLUSIVELY to YOUR private "Message Yourself" inbox.
 * Never notifies or sends into the chat with the other user!
 */

const config = require('../config');
const safety = require('../lib/safety');
const contactStore = require('../lib/contactStore');
const antiDelete = require('../lib/antiDelete');

function deepUnwrap(msgObj) {
  if (!msgObj) return null;
  let m = msgObj.message || msgObj;
  let changed = true;
  while (changed) {
    changed = false;
    if (m?.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
      changed = true;
    } else if (m?.viewOnceMessage?.message) {
      m = m.viewOnceMessage.message;
      changed = true;
    } else if (m?.viewOnceMessageV2?.message) {
      m = m.viewOnceMessageV2.message;
      changed = true;
    } else if (m?.viewOnceMessageV2Extension?.message) {
      m = m.viewOnceMessageV2Extension.message;
      changed = true;
    } else if (m?.documentWithCaptionMessage?.message) {
      m = m.documentWithCaptionMessage.message;
      changed = true;
    } else if (m?.protocolMessage?.editedMessage) {
      m = m.protocolMessage.editedMessage;
      changed = true;
    }
  }
  return m;
}

module.exports = {
  name: 'viewonce',
  aliases: ['videwonce', 'vv', 'rvo', 'readviewonce'],
  description: 'Silently save View-Once media directly to your private self-chat',
  usage: 'Reply to any View-Once message with .viewonce (or .vv)',

  async execute({ sock, msg, from, sender, isGroup, isOwner }) {
    // Only owner can run View-Once unlocker
    const authorized = isOwner || msg.key.fromMe || safety.isOwner(sender) || safety.isOwner(from);
    if (!authorized) return;

    if (!safety.canExecuteCommand(sender)) return;

    // ── TARGET DETERMINATION ──
    // If in a private DM with the bot: send directly to current chat so user sees response instantly
    // If in a group: forward silently to the owner's private inbox
    const selfInboxJid = safety.getOwnerJid(sock);
    let targetInbox = selfInboxJid;
    if (!isGroup && from) {
      targetInbox = safety.normalizeJid(sock, from);
    } else if (sender && safety.isOwner(sender)) {
      targetInbox = safety.normalizeJid(sock, sender);
    }

    // If command was typed in another user's chat or a group, delete the command message
    // Fire in background (non-blocking) so media extraction begins immediately!
    if (from !== targetInbox && msg.key.fromMe) {
      sock.sendMessage(from, { delete: msg.key }).catch(() => {});
    }

    const unwrappedCmd = deepUnwrap(msg);
    const quotedCtx = unwrappedCmd?.extendedTextMessage?.contextInfo;
    const quotedRaw = quotedCtx?.quotedMessage;
    const cachedMsg = quotedCtx?.stanzaId ? antiDelete.getMessage(quotedCtx.stanzaId) : null;

    const unwrappedQuoted = deepUnwrap(quotedRaw);
    const unwrappedCached = deepUnwrap(cachedMsg);
    const unwrappedDirect = unwrappedCmd;

    const imageMsg = unwrappedQuoted?.imageMessage ||
      unwrappedCached?.imageMessage ||
      unwrappedDirect?.imageMessage;

    const videoMsg = unwrappedQuoted?.videoMessage ||
      unwrappedCached?.videoMessage ||
      unwrappedDirect?.videoMessage;

    const audioMsg = unwrappedQuoted?.audioMessage ||
      unwrappedCached?.audioMessage ||
      unwrappedDirect?.audioMessage;

    if (!imageMsg && !videoMsg && !audioMsg) {
      return safety.safeSend(sock, targetInbox, {
        text: '❌ *Usage Error!*\nPlease reply to a *View Once* photo, video, or voice note with `.viewonce` or `.vv`.'
      });
    }

    // Determine the actual sender who posted the View-Once media (NOT the person running the command!)
    const targetKey = cachedMsg?.key || {};
    const candidateParticipant = quotedCtx?.participant || targetKey.participant;
    const candidateParticipantPn = quotedCtx?.participantPn || targetKey.participantPn;
    const candidateSenderPn = targetKey.senderPn;
    const candidatePushName = cachedMsg?.pushName || null;

    let sourceChat = isGroup ? 'Group Chat' : `Private Chat`;
    if (isGroup) {
      try {
        const groupMeta = await contactStore.getGroupMetadata(sock, from);
        if (groupMeta?.subject) sourceChat = `Group: ${groupMeta.subject}`;
      } catch (e) {}
    }

    const senderInfo = await contactStore.resolveSender(sock, {
      jid: candidateParticipant || (isGroup ? '' : from),
      participant: candidateParticipant,
      participantPn: candidateParticipantPn,
      senderPn: candidateSenderPn,
      from,
      isGroup,
      pushName: candidatePushName
    });

    if (!isGroup) {
      sourceChat = `Private Chat with ${senderInfo.display}`;
    }

    try {
      const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');

      const getBuffer = async (stream) => {
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      };

      console.log(`[ViewOnce] Silently unlocking media from ${senderInfo.display} in ${sourceChat} -> forwarding to ${targetInbox}`);

      // 1. View-Once Image
      if (imageMsg) {
        const stream = await downloadContentFromMessage(imageMsg, 'image');
        const buffer = await getBuffer(stream);
        const caption = `🔓 *View-Once Photo Saved Silently*\n📍 *Source:* ${sourceChat}\n👤 *From:* ${senderInfo.display}${imageMsg.caption ? `\n📸 *Caption:* ${imageMsg.caption}` : ''}`;

        await safety.safeSend(sock, targetInbox, {
          image: buffer,
          caption
        });
        return;
      }

      // 2. View-Once Video
      if (videoMsg) {
        const stream = await downloadContentFromMessage(videoMsg, 'video');
        const buffer = await getBuffer(stream);
        const caption = `🔓 *View-Once Video Saved Silently*\n📍 *Source:* ${sourceChat}\n👤 *From:* ${senderInfo.display}${videoMsg.caption ? `\n🎬 *Caption:* ${videoMsg.caption}` : ''}`;

        await safety.safeSend(sock, targetInbox, {
          video: buffer,
          caption
        });
        return;
      }

      // 3. View-Once Audio / Voice Note
      if (audioMsg) {
        const stream = await downloadContentFromMessage(audioMsg, 'audio');
        const buffer = await getBuffer(stream);

        await safety.safeSend(sock, targetInbox, {
          text: `🔓 *View-Once Voice Note Saved Silently*\n📍 *Source:* ${sourceChat}\n👤 *From:* ${senderInfo.display}`
        });

        await safety.safeSend(sock, targetInbox, {
          audio: buffer,
          mimetype: audioMsg.mimetype || 'audio/mp4',
          ptt: true
        });
        return;
      }

    } catch (err) {
      console.error('[ViewOnce] Error downloading media:', err);
      await safety.safeSend(sock, targetInbox, {
        text: `❌ *Failed to download View-Once media:* ${err.message}`
      });
    }
  }
};
