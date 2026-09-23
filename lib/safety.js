/**
 * VIRUZ / MiniBot WhatsApp Anti-Ban & Security Safety Layer
 *
 * Implements industry-grade WhatsApp account protection:
 * 1. Emulates human presence ('composing' typing indicator & realistic delays).
 * 2. Strict rate-limiting (per-chat, per-user, and global send quotas).
 * 3. Anti-flood shield on Anti-Delete (prevents spamming when someone mass-deletes).
 * 4. Message deduplication (prevents double-replies & infinite bounce loops).
 * 5. Complete bypass for WhatsApp status broadcasts and newsletter spam.
 * 6. Master bot on/off kill-switch.
 */

const config = require('../config');

class SafetyManager {
  constructor() {
    // ── Master Power Switch ──
    this.botEnabled = true;

    // ── Bot Sent Messages Tracking ──
    this.botSentIds = new Set();

    // ── Message Deduplication ──
    this.processedMessages = new Map();
    this.DEDUP_TTL_MS = 60000; // 60 seconds

    // ── Rate Limiting & Cooldowns ──
    this.chatSendLog = new Map();     // Map<chatJid, number[]>
    this.globalSendLog = [];           // number[]
    this.userCooldowns = new Map();    // Map<userId, number>
    this.userStrikes = new Map();      // Map<userId, { count: number, blockedUntil: number }>
    this.antiDeleteThrottle = new Map(); // Map<chatJid, number[]>

    // Operational Security Mode ('public' | 'groups' | 'self')
    this.mode = config.mode || 'public';

    // Anti-Ban Quotas
    this.MAX_SENDS_PER_CHAT_PER_MIN = 12;   // Max 12 bot messages per chat in 60s
    this.MAX_GLOBAL_SENDS_PER_MIN = 35;     // Max 35 bot messages total in 60s
    this.USER_COOLDOWN_MS = 2000;           // 2s between commands per user
    this.MAX_ANTIDELETE_PER_WINDOW = 4;     // Max 4 anti-delete reposts per chat in 15s
    this.ANTIDELETE_WINDOW_MS = 15000;      // 15 seconds window

    // Human typing simulation delay range (ms)
    this.MIN_TYPING_DELAY = 350;
    this.MAX_TYPING_DELAY = 750;

    // Sent messages cache for Baileys getMessage retry requests (fixes Waiting for this message)
    this.sentMessagesCache = new Map();
    this.MAX_SENT_CACHE = 1000;

    // Cleanup stale records periodically
    this._cleanupInterval = setInterval(() => this._cleanup(), 30000);
  }

  // ── Bot Master Switch & Security Mode ──

  isBotEnabled() {
    return this.botEnabled;
  }

  setBotEnabled(enabled) {
    this.botEnabled = Boolean(enabled);
  }

  getMode() {
    return this.mode || 'public';
  }

  setMode(mode) {
    if (['public', 'groups', 'self'].includes(mode)) {
      this.mode = mode;
    }
  }

  // ── Deduplication ──

  isDuplicate(messageId) {
    if (!messageId) return false;
    if (this.processedMessages.has(messageId)) {
      return true;
    }
    this.processedMessages.set(messageId, Date.now());
    return false;
  }

  // ── Ignore Junk Broadcasts ──

  shouldIgnoreMessage(msg) {
    if (!msg || !msg.key) return true;
    const jid = msg.key.remoteJid || '';

    // Ignore status broadcasts
    if (jid === 'status@broadcast') return true;

    // Ignore WhatsApp official newsletters/channels
    if (jid.endsWith('@newsletter')) return true;

    // Ignore empty messages
    if (!msg.message) return true;

    return false;
  }

  // ── User Rate Limiting & Cooldown ──

  /**
   * Check if user is on cooldown or temporarily muted for spamming
   * @param {string} userId
   * @returns {boolean} true if allowed, false if on cooldown
   */
  canExecuteCommand(userId) {
    if (!userId) return true;
    if (this.isOwner(userId)) return true; // Owner is never throttled

    const now = Date.now();

    // Check if user is on temporary spam penalty
    const strikeInfo = this.userStrikes.get(userId);
    if (strikeInfo && strikeInfo.blockedUntil > now) {
      console.log(`[Safety] User ${userId} is on anti-spam penalty for ${Math.ceil((strikeInfo.blockedUntil - now) / 1000)}s`);
      return false;
    }

    const lastTime = this.userCooldowns.get(userId) || 0;
    if (now - lastTime < this.USER_COOLDOWN_MS) {
      const currentStrikes = (strikeInfo?.count || 0) + 1;
      if (currentStrikes >= 4) {
        this.userStrikes.set(userId, { count: currentStrikes, blockedUntil: now + 60000 });
        console.warn(`[Safety] Flood Shield: User ${userId} blocked for 60s due to spamming.`);
      } else {
        this.userStrikes.set(userId, { count: currentStrikes, blockedUntil: 0 });
      }
      return false;
    }

    // Reset strikes after clean execution
    this.userCooldowns.set(userId, now);
    this.userStrikes.delete(userId);
    return true;
  }

  // ── Anti-Delete Flood Shield ──

  canRecoverAntiDelete(chatJid) {
    const now = Date.now();
    const timestamps = (this.antiDeleteThrottle.get(chatJid) || [])
      .filter(t => now - t < this.ANTIDELETE_WINDOW_MS);

    if (timestamps.length >= this.MAX_ANTIDELETE_PER_WINDOW) {
      console.log(`[Safety] Anti-delete flood detected in ${chatJid}, throttling recovery.`);
      return false;
    }

    timestamps.push(now);
    this.antiDeleteThrottle.set(chatJid, timestamps);
    return true;
  }

  // ── Rate Limiter ──

  canSend(chatJid) {
    const now = Date.now();

    // Global quota check
    this.globalSendLog = this.globalSendLog.filter(t => now - t < 60000);
    if (this.globalSendLog.length >= this.MAX_GLOBAL_SENDS_PER_MIN) {
      console.warn('[Safety] Global rate limit reached. Delaying send to protect account.');
      return false;
    }

    // Per-chat quota check
    const chatLog = (this.chatSendLog.get(chatJid) || []).filter(t => now - t < 60000);
    this.chatSendLog.set(chatJid, chatLog);
    if (chatLog.length >= this.MAX_SENDS_PER_CHAT_PER_MIN) {
      console.warn(`[Safety] Per-chat rate limit reached for ${chatJid}. Skipping to protect account.`);
      return false;
    }

    return true;
  }

  recordSend(chatJid) {
    const now = Date.now();
    this.globalSendLog.push(now);

    const chatLog = this.chatSendLog.get(chatJid) || [];
    chatLog.push(now);
    this.chatSendLog.set(chatJid, chatLog);
  }

  // ── Safe Human Emulation Send ──

  normalizeJid(sock, jid) {
    if (!jid || typeof jid !== 'string') return jid;
    if (jid.endsWith('@lid')) {
      const cleanLid = jid.split('@')[0].split(':')[0];
      const myLid = sock?.user?.lid?.split('@')[0]?.split(':')[0];
      if (cleanLid === myLid || this.isOwner(cleanLid)) {
        return this.getOwnerJid(sock);
      }
      try {
        const contactStore = require('./contactStore');
        if (contactStore.lidToPhone.has(cleanLid)) {
          const phone = contactStore.lidToPhone.get(cleanLid);
          return `${phone}@s.whatsapp.net`;
        }
      } catch (e) {}
      if (this.isOwner(cleanLid)) {
        return this.getOwnerJid(sock);
      }
    }
    return jid;
  }

  /**
   * Record a sent message in memory for Baileys getMessage retry requests
   */
  storeSentMessage(id, message) {
    if (!id || !message) return;
    if (this.sentMessagesCache.size >= this.MAX_SENT_CACHE) {
      const oldest = this.sentMessagesCache.keys().next().value;
      if (oldest) this.sentMessagesCache.delete(oldest);
    }
    this.sentMessagesCache.set(id, message);
  }

  getSentMessage(id) {
    if (!id) return null;
    return this.sentMessagesCache.get(id) || null;
  }

  /**
   * Safe message dispatcher with typing indicator simulation and anti-ban delays
   * @param {object} sock Baileys socket instance
   * @param {string} rawJid Target chat JID
   * @param {object} content Message payload
   * @param {object} [options] Optional Baileys send options (e.g. { quoted: msg })
   */
  async safeSend(sock, rawJid, content, options = {}) {
    if (!sock) return null;

    // Use rawJid directly so phones on LID or group channels decrypt on active session
    const jid = rawJid;

    if (!this.canSend(jid)) {
      return null;
    }

    // Human typing presence & natural delay for third parties to evade automated bot detection
    const isSelfOrOwner = jid === this.getOwnerJid(sock) || this.isOwner(jid) || jid.endsWith('@lid');
    if (!isSelfOrOwner) {
      try {
        const presenceType = (content.audio || content.ptt) ? 'recording' : 'composing';
        if (sock?.sendPresenceUpdate) {
          sock.sendPresenceUpdate(presenceType, jid).catch(() => {});
        }
      } catch (e) {}

      // Randomized natural human delay (350ms to 750ms)
      const delay = Math.floor(Math.random() * (this.MAX_TYPING_DELAY - this.MIN_TYPING_DELAY + 1)) + this.MIN_TYPING_DELAY;
      await new Promise(r => setTimeout(r, delay));
    }

    // CRITICAL: Prevent "Waiting for this message" decryption loop in WhatsApp
    // Quoting messages triggers companion Signal ratchet reconciliation errors on phones
    const cleanOptions = { ...options };
    if (cleanOptions.quoted) {
      if (cleanOptions.quoted.key?.fromMe || isSelfOrOwner) {
        delete cleanOptions.quoted;
      }
    }

    this.recordSend(jid);
    let sent = null;
    try {
      sent = await sock.sendMessage(jid, content, cleanOptions);
    } catch (err) {
      console.warn(`[Safety] Initial send failed (${err.message}), retrying plain send...`);
      try {
        sent = await sock.sendMessage(jid, content);
      } catch (retryErr) {
        console.error(`[Safety] Fatal send error:`, retryErr.message);
        return null;
      }
    }

    console.log(`[Safety] safeSend to ${jid}:`, sent?.key?.id ? `SUCCESS (id: ${sent.key.id})` : 'FAILED');

    // Cache sent message so Baileys can provide it during retry reconciliation
    if (sent?.key?.id) {
      this.botSentIds.add(sent.key.id);
      const msgPayload = sent.message || content;
      this.storeSentMessage(sent.key.id, msgPayload);
      try {
        const antiDelete = require('./antiDelete');
        antiDelete.storeMessage(sent);
      } catch (e) {}
    }

    // Pause presence in background (only if sent to third party)
    if (!isSelfOrOwner) {
      try {
        sock.sendPresenceUpdate('paused', jid).catch(() => {});
      } catch (e) {}
    }

    return sent;
  }

  isBotSent(id) {
    if (!id) return false;
    return this.botSentIds.has(id);
  }

  // ── Owner Verification ──

  isOwner(jid) {
    if (!jid) return false;
    const cleanJid = jid.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    try {
      const contactStore = require('./contactStore');
      if (contactStore.lidToPhone.has(cleanJid)) {
        const resolvedPhone = contactStore.lidToPhone.get(cleanJid);
        if (resolvedPhone && resolvedPhone !== cleanJid && this.isOwner(resolvedPhone)) {
          return true;
        }
      }
    } catch (e) {}
    const owners = (config.ownerNumbers || []).map(n => n.replace(/[^0-9]/g, ''));
    return owners.some(o => cleanJid === o || cleanJid.endsWith(o) || o.endsWith(cleanJid));
  }

  getOwnerJid(sock = null) {
    if (sock?.user?.id) {
      const clean = sock.user.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
      if (clean) return `${clean}@s.whatsapp.net`;
    }
    const owners = config.ownerNumbers || [];
    const primary = owners[0] ? owners[0].replace(/[^0-9]/g, '') : '923056499820';
    return `${primary}@s.whatsapp.net`;
  }

  getOwnerJids(sock = null) {
    const list = new Set();
    if (sock?.user?.id) {
      const clean = sock.user.id.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
      if (clean) list.add(`${clean}@s.whatsapp.net`);
    }
    const owners = config.ownerNumbers || [];
    for (const num of owners) {
      const clean = num.replace(/[^0-9]/g, '');
      if (clean) list.add(`${clean}@s.whatsapp.net`);
    }
    if (list.size === 0) list.add('923056499820@s.whatsapp.net');
    return Array.from(list);
  }


  // ── Periodic Memory Cleanup ──

  _cleanup() {
    const now = Date.now();
    for (const [id, ts] of this.processedMessages) {
      if (now - ts > this.DEDUP_TTL_MS) {
        this.processedMessages.delete(id);
      }
    }
    for (const [uid, ts] of this.userCooldowns) {
      if (now - ts > this.USER_COOLDOWN_MS * 2) {
        this.userCooldowns.delete(uid);
      }
    }
    for (const [chat, timestamps] of this.antiDeleteThrottle) {
      const recent = timestamps.filter(t => now - t < this.ANTIDELETE_WINDOW_MS);
      if (recent.length === 0) {
        this.antiDeleteThrottle.delete(chat);
      } else {
        this.antiDeleteThrottle.set(chat, recent);
      }
    }
  }
}

module.exports = new SafetyManager();
