/**
 * Mini WhatsApp Bot Anti-Delete Engine — 100% SILENT GHOST MODE
 * Catches deleted messages & media and forwards them directly and silently
 * to YOUR private inbox (DM). Other users in the chat receive NO notifications!
 * Backed by persistent disk storage so messages are never lost across restarts!
 */

const NodeCache = require('node-cache');
const config = require('../config');
const safety = require('./safety');
const contactStore = require('./contactStore');
const messageStore = require('./messageStore');
const { miniBox, formatTime } = require('./utils');

// Cache recently processed revokes to avoid duplicate sends across upsert/update/delete events
const handledRevokes = new NodeCache({
  stdTTL: 300, // 5 minutes
  checkperiod: 60,
});

/**
 * Deep-unwrap message wrappers (ephemeral, view-once, document-with-caption)
 */
function unwrapMessage(msg) {
  if (!msg) return null;
  let m = msg.message || msg;
  let unwrapped = true;
  while (unwrapped) {
    unwrapped = false;
    if (m?.ephemeralMessage?.message) {
      m = m.ephemeralMessage.message;
      unwrapped = true;
    } else if (m?.viewOnceMessage?.message) {
      m = m.viewOnceMessage.message;
      unwrapped = true;
    } else if (m?.viewOnceMessageV2?.message) {
      m = m.viewOnceMessageV2.message;
      unwrapped = true;
    } else if (m?.viewOnceMessageV2Extension?.message) {
      m = m.viewOnceMessageV2Extension.message;
      unwrapped = true;
    } else if (m?.documentWithCaptionMessage?.message) {
      m = m.documentWithCaptionMessage.message;
      unwrapped = true;
    }
  }
  return m;
}

class AntiDeleteManager {
  constructor() {
    this.enabled = config.antiDelete?.enabled !== false;
    this.unwrapMessage = unwrapMessage;
  }

  /**
   * Store incoming message in persistent storage
   * @param {object} msg 
   */
  storeMessage(msg) {
    if (!msg || !msg.key || !msg.key.id || !msg.message) return;

    const inner = unwrapMessage(msg);
    // Don't store protocol messages (revokes) as cached content
    if (inner?.protocolMessage) return;

    // Cache the message under its unique ID (memory + disk)
    messageStore.set(msg.key.id, msg);

    // If contact pushName is present, index it
    if (msg.pushName) {
      const sender = msg.key.participant || msg.key.remoteJid;
      contactStore.setPushName(sender, msg.pushName);
    }
  }

  /**
   * Get cached message by ID
   * @param {string} id
   * @returns {object|null}
   */
  getMessage(id) {
    if (!id) return null;
    return messageStore.get(id) || null;
  }

  /**
   * Handle when a message is deleted / revoked
   * Supports raw message events or normalized revocation descriptor
   * @param {object} sock Baileys socket
   * @param {object} event Raw message or { key, revokedId, participant, fromMe, chatJid }
   */
  async handleRevoke(sock, event) {
    if (!this.enabled || !safety.isBotEnabled()) return;
    if (!event) return;

    let revokedId = null;
    let chatJid = null;
    let participant = null;
    let fromMe = false;

    // Format A: Normalized event object
    if (event.revokedId) {
      revokedId = event.revokedId;
      chatJid = event.chatJid || event.key?.remoteJid;
      participant = event.participant || event.key?.participant;
      fromMe = Boolean(event.fromMe ?? event.key?.fromMe);
    }
    // Format B: Raw Baileys message
    else if (event.message) {
      const inner = unwrapMessage(event);
      const protocolMsg = inner?.protocolMessage;
      // Type 0 is REVOKE in Baileys protocol
      if (!protocolMsg || (protocolMsg.type !== 0 && protocolMsg.type !== 'REVOKE' && !protocolMsg.key?.id)) {
        return;
      }

      revokedId = protocolMsg.key?.id;
      chatJid = event.key?.remoteJid;
      participant = protocolMsg.key?.participant || event.key?.participant;
      fromMe = Boolean(protocolMsg.key?.fromMe ?? event.key?.fromMe);
    }

    if (!revokedId || !chatJid) return;

    // Check if already handled
    if (handledRevokes.has(revokedId)) return;

    const originalMsg = messageStore.get(revokedId);
    if (!originalMsg) {
      console.log(`[AntiDelete] Revoke detected for ${revokedId} but message was not cached yet.`);
      return;
    }

    // Mark as handled now that we confirmed we have the cached message
    handledRevokes.set(revokedId, true);

    // ── 100% SILENT MODE: DELIVER TO ALL OWNER INBOXES SO BOTH PHONE AND WEB RECEIVE IT ──
    const primaryOwner = safety.getOwnerJid(sock);
    const targetJids = safety.getOwnerJids ? safety.getOwnerJids(sock) : [primaryOwner];

    // Skip messages sent by the bot's own automated sends to avoid loops
    if (safety.isBotSent(revokedId)) return;

    // Anti-Ban Flood Shield: Throttle rapid bursts in chat
    if (!safety.canRecoverAntiDelete(chatJid)) return;

    const isGroup = chatJid.endsWith('@g.us');
    const isSelfChat = chatJid === primaryOwner || safety.isOwner(chatJid);
    let chatName = 'Direct Message';

    if (isSelfChat) {
      chatName = 'Self Chat ("Message Yourself")';
    } else if (isGroup) {
      try {
        const groupMeta = await contactStore.getGroupMetadata(sock, chatJid);
        if (groupMeta?.subject) chatName = `Group: ${groupMeta.subject}`;
        else chatName = 'Group Chat';
      } catch (e) {
        chatName = 'Group Chat';
      }
    } else {
      const partnerPhone = chatJid.split('@')[0].split(':')[0];
      chatName = `Private Chat with +${partnerPhone}`;
    }

    // Resolve sender true phone number and name using WhatsApp participantPn / senderPn
    const candidateSender = participant || originalMsg.key?.participant || (isGroup ? '' : chatJid);
    const senderInfo = await contactStore.resolveSender(sock, {
      jid: candidateSender,
      participant: participant || originalMsg.key?.participant,
      participantPn: originalMsg.key?.participantPn,
      senderPn: originalMsg.key?.senderPn,
      from: chatJid,
      isGroup,
      pushName: originalMsg.pushName
    });

    const timeStr = formatTime();
    console.log(`[AntiDelete] Silently recovered deleted message from ${senderInfo.display} in ${chatName} -> forwarding to inboxes (${targetJids.join(', ')})`);

    // Unwrap cached message content
    const innerMsg = unwrapMessage(originalMsg);
    if (!innerMsg) return;

    // Helper to broadcast to all owner inboxes (phone + linked web)
    const broadcastToOwners = async (content) => {
      let lastSent = null;
      for (const targetJid of targetJids) {
        const res = await safety.safeSend(sock, targetJid, content);
        if (res) lastSent = res;
      }
      return lastSent;
    };

    // 1. Text Message Recovery
    const text = innerMsg.conversation ||
      innerMsg.extendedTextMessage?.text;

    if (text) {
      const body = `📍 *Source:* ${chatName}\n👤 *Deleted By:* ${senderInfo.display}\n🕒 *Time:* ${timeStr}\n\n💬 *Deleted Message:*\n${text}`;
      const output = miniBox('SILENT ANTI-DELETE', body, config.botName || 'MINI BOT');

      console.log(`[AntiDelete] Sending recovered text to owner inboxes...`);
      const sent = await broadcastToOwners({ text: output });
      console.log(`[AntiDelete] Text delivery result:`, sent ? `SUCCESS ✅ (id: ${sent.key?.id})` : 'FAILED ❌');
      return;
    }

    // 2. Media Recovery (Image, Video, Audio, Sticker, Document)
    try {
      const { downloadContentFromMessage } = await import('@whiskeysockets/baileys');

      const getBuffer = async (stream) => {
        const chunks = [];
        for await (const chunk of stream) {
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      };

      // A. Image
      if (innerMsg.imageMessage) {
        const stream = await downloadContentFromMessage(innerMsg.imageMessage, 'image');
        const buffer = await getBuffer(stream);
        const caption = innerMsg.imageMessage.caption || '';
        const body = `📍 *Source:* ${chatName}\n👤 *Deleted By:* ${senderInfo.display}\n🕒 *Time:* ${timeStr}${caption ? `\n💬 *Caption:* ${caption}` : ''}`;
        const output = miniBox('RECOVERED PHOTO', body, config.botName || 'MINI BOT');

        console.log(`[AntiDelete] Sending recovered photo to owner inboxes...`);
        const sent = await broadcastToOwners({
          image: buffer,
          caption: output
        });
        console.log(`[AntiDelete] Photo delivery result:`, sent ? `SUCCESS ✅ (id: ${sent.key?.id})` : 'FAILED ❌');
        return;
      }

      // B. Video
      if (innerMsg.videoMessage) {
        const stream = await downloadContentFromMessage(innerMsg.videoMessage, 'video');
        const buffer = await getBuffer(stream);
        const caption = innerMsg.videoMessage.caption || '';
        const body = `📍 *Source:* ${chatName}\n👤 *Deleted By:* ${senderInfo.display}\n🕒 *Time:* ${timeStr}${caption ? `\n💬 *Caption:* ${caption}` : ''}`;
        const output = miniBox('RECOVERED VIDEO', body, config.botName || 'MINI BOT');

        console.log(`[AntiDelete] Sending recovered video to owner inboxes...`);
        const sent = await broadcastToOwners({
          video: buffer,
          caption: output
        });
        console.log(`[AntiDelete] Video delivery result:`, sent ? `SUCCESS ✅ (id: ${sent.key?.id})` : 'FAILED ❌');
        return;
      }

      // C. Sticker
      if (innerMsg.stickerMessage) {
        const stream = await downloadContentFromMessage(innerMsg.stickerMessage, 'sticker');
        const buffer = await getBuffer(stream);
        await broadcastToOwners({
          text: `🛡️ *[SILENT ANTI-DELETE]*\n📍 *Source:* ${chatName}\n👤 *${senderInfo.display} deleted a sticker at ${timeStr}:*`
        });
        const sent = await broadcastToOwners({ sticker: buffer });
        console.log(`[AntiDelete] Sticker delivery result:`, sent ? `SUCCESS ✅` : 'FAILED ❌');
        return;
      }

      // D. Audio / Voice Note
      if (innerMsg.audioMessage) {
        const stream = await downloadContentFromMessage(innerMsg.audioMessage, 'audio');
        const buffer = await getBuffer(stream);
        await broadcastToOwners({
          text: `🎵 *[SILENT ANTI-DELETE]*\n📍 *Source:* ${chatName}\n👤 *${senderInfo.display} deleted voice note at ${timeStr}:*`
        });
        const sent = await broadcastToOwners({
          audio: buffer,
          mimetype: innerMsg.audioMessage.mimetype || 'audio/mp4',
          ptt: Boolean(innerMsg.audioMessage.ptt)
        });
        console.log(`[AntiDelete] Audio delivery result:`, sent ? `SUCCESS ✅` : 'FAILED ❌');
        return;
      }

      // E. Document
      if (innerMsg.documentMessage) {
        const doc = innerMsg.documentMessage;
        const stream = await downloadContentFromMessage(doc, 'document');
        const buffer = await getBuffer(stream);
        const fileName = doc.fileName || 'recovered_file';
        await broadcastToOwners({
          text: `📄 *[SILENT ANTI-DELETE]*\n📍 *Source:* ${chatName}\n👤 *${senderInfo.display} deleted file:* ${fileName} at ${timeStr}`
        });
        const sent = await broadcastToOwners({
          document: buffer,
          mimetype: doc.mimetype || 'application/octet-stream',
          fileName
        });
        console.log(`[AntiDelete] Document delivery result:`, sent ? `SUCCESS ✅` : 'FAILED ❌');
        return;
      }

    } catch (err) {
      console.error('[AntiDelete] Error recovering media:', err.message);
    }
  }
}

module.exports = new AntiDeleteManager();
