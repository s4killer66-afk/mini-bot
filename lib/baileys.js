/**
 * Baileys WhatsApp Connection Manager
 * Clean, stable connection with pairing code support and full message event routing
 */

const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const commandHandler = require('./commandHandler');
const antiDelete = require('./antiDelete');
const contactStore = require('./contactStore');
const safety = require('./safety');
const NodeCache = require('node-cache');

let baileysModule = null;
async function loadBaileys() {
  if (!baileysModule) {
    baileysModule = await import('@whiskeysockets/baileys');
  }
  return baileysModule;
}

/**
 * Ensure any cached or sent message object translates into a decodable proto.Message
 */
function toProtoMessage(raw) {
  if (!raw) return null;
  if (raw.message) return toProtoMessage(raw.message);
  if (raw.conversation && typeof raw.conversation === 'string' && raw.conversation.trim()) {
    return raw;
  }
  if (raw.extendedTextMessage && raw.extendedTextMessage.text && typeof raw.extendedTextMessage.text === 'string' && raw.extendedTextMessage.text.trim()) {
    return raw;
  }
  if (raw.imageMessage || raw.videoMessage || raw.audioMessage || raw.documentMessage || raw.stickerMessage) {
    return raw;
  }
  if (typeof raw.text === 'string' && raw.text.trim()) {
    return { extendedTextMessage: { text: raw.text } };
  }
  if (raw.image) {
    return { imageMessage: { caption: typeof raw.caption === 'string' ? raw.caption : '' } };
  }
  if (raw.video) {
    return { videoMessage: { caption: typeof raw.caption === 'string' ? raw.caption : '' } };
  }
  if (raw.audio) {
    return { audioMessage: { mimetype: raw.mimetype || 'audio/mp4', ptt: Boolean(raw.ptt) } };
  }
  return null;
}

class WhatsAppClient {
  constructor() {
    this.sock = null;
    this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'waiting_pair' | 'connected'
    this.pairingCode = null;
    this.qrCodeBase64 = null;
    this.connectedUser = null;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.isStarting = false;
  }

  /**
   * Start or restart the Baileys socket connection
   */
  async start() {
    if (this.isStarting) {
      console.log('[Baileys] Socket connection already initializing, skipping duplicate start.');
      return this.sock;
    }
    this.isStarting = true;

    // Clean up existing socket
    if (this.sock) {
      try {
        this.sock.ev.removeAllListeners();
        this.sock.end(undefined);
      } catch (e) {}
      this.sock = null;
    }

    try {
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
        Browsers,
        makeCacheableSignalKeyStore,
      } = await loadBaileys();

      const authFolder = path.resolve(config.sessionDir);
      if (!fs.existsSync(authFolder)) {
        fs.mkdirSync(authFolder, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(authFolder);
      let version = [2, 3000, 1015901307];
      try {
        const v = await fetchLatestBaileysVersion();
        version = v.version;
      } catch (e) {}

      console.log(`[Baileys] Connecting to WhatsApp Web (v${version.join('.')})...`);

      const browserConfig = Browsers ? Browsers.ubuntu('Chrome') : ['Ubuntu', 'Chrome', '20.0.04'];

      const logger = pino({ level: 'silent' });
      const msgRetryCounterCache = new NodeCache({ stdTTL: 3600, useClones: false });

      this.sock = makeWASocket({
        version,
        logger,
        printQRInTerminal: false,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, logger)
        },
        browser: browserConfig,
        msgRetryCounterCache,
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 60000,
        keepAliveIntervalMs: 30000,
        retryRequestDelayMs: 250,
        maxMsgRetryCount: 5,
        patchMessageBeforeSending: async (msg) => {
          try {
            if (this.sock?.uploadPreKeysToServerIfRequired) {
              await this.sock.uploadPreKeysToServerIfRequired();
            }
          } catch (e) {}
          return msg;
        },
        getMessage: async (key) => {
          if (key?.id) {
            // 1. Check in safety manager sent messages cache (in-memory)
            const sentMsg = safety.getSentMessage(key.id);
            if (sentMsg) {
              const proto = toProtoMessage(sentMsg);
              if (proto) return proto;
            }

            // 2. Check in persistent messageStore (disk + memory)
            try {
              const messageStore = require('./messageStore');
              const stored = messageStore.get(key.id);
              if (stored) {
                const proto = toProtoMessage(stored);
                if (proto) return proto;
              }
            } catch (e) {}

            // 3. Check in antiDelete cache
            try {
              const antiDelete = require('./antiDelete');
              const cached = antiDelete.getMessage(key.id);
              if (cached) {
                const proto = toProtoMessage(cached);
                if (proto) return proto;
              }
            } catch (e) {}
          }
          // Never return an empty { conversation: '' } because Baileys will relay an empty string,
          // which corrupts the message bubble on the phone and causes permanent "Waiting for this message".
          return undefined;
        }
      });

      this.sock.ev.on('creds.update', saveCreds);

      // Connection lifecycle updates
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrCodeBase64 = await QRCode.toDataURL(qr);
          } catch (e) {}

          // Auto-generate pairing code in terminal for cloud hosts (e.g. KataBump, VPS)
          const targetPairNum = (process.env.PAIRING_NUMBER || config.pairingNumber || config.ownerNumbers[0] || '').replace(/[^0-9]/g, '');
          if (targetPairNum && !this.pairingCode && !this._isAutoPairing) {
            this._isAutoPairing = true;
            this.status = 'waiting_pair';
            setTimeout(async () => {
              try {
                if (this.status !== 'connected' && this.sock?.requestPairingCode) {
                  console.log(`[Baileys] Generating 8-digit pairing code for +${targetPairNum}...`);
                  const code = await this.sock.requestPairingCode(targetPairNum);
                  this.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
                  console.log(`\n======================================================`);
                  console.log(`🔑 WHATSAPP PAIRING CODE FOR +${targetPairNum}:`);
                  console.log(`👉 ${this.pairingCode}`);
                  console.log(`Enter this code in WhatsApp: Linked Devices > Link with phone number`);
                  console.log(`======================================================\n`);
                }
              } catch (err) {
                console.log(`[Baileys] Terminal pairing error: ${err.message}`);
              } finally {
                this._isAutoPairing = false;
              }
            }, 2500);
          }
        }

        if (connection === 'connecting') {
          this.status = 'connecting';
          console.log('[Baileys] Connection status: Connecting...');
        }

        if (connection === 'open') {
          this.status = 'connected';
          this.pairingCode = null;
          this.qrCodeBase64 = null;
          this.connectedUser = this.sock.user;
          this.reconnectAttempts = 0;

          const rawId = this.sock.user?.id || '';
          const userNum = rawId.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
          const rawLid = this.sock.user?.lid || '';
          const userLid = rawLid.split(':')[0].split('@')[0].replace(/[^0-9]/g, '');
          const displayName = this.sock.user?.name || userNum || 'Bot';

          // Automatically register the connected account as an authorized owner
          if (userNum && !config.ownerNumbers.includes(userNum)) {
            config.ownerNumbers.push(userNum);
            console.log(`[Baileys] Registered linked phone +${userNum} as bot owner.`);
          }
          if (userLid && !config.ownerNumbers.includes(userLid)) {
            config.ownerNumbers.push(userLid);
            console.log(`[Baileys] Registered linked LID ${userLid} as bot owner.`);
          }
          if (userLid && userNum) {
            contactStore.registerLidMapping(userLid, userNum, displayName);
          }

          console.log(`[Baileys] ✅ Connected successfully as: ${displayName} (+${userNum})`);

          // Sync pre-keys with WhatsApp servers to guarantee mobile devices can decrypt messages immediately
          try {
            if (this.sock?.uploadPreKeysToServerIfRequired) {
              await this.sock.uploadPreKeysToServerIfRequired();
              console.log('[Baileys] 🔐 Pre-keys verified and synced with WhatsApp server.');
            }
          } catch (e) {}

          // Background prime: Index participating groups to resolve LIDs to Phone numbers instantly
          setTimeout(async () => {
            try {
              if (this.sock?.groupFetchAllParticipating) {
                const groups = await this.sock.groupFetchAllParticipating();
                if (groups) {
                  let count = 0;
                  for (const [gid, meta] of Object.entries(groups)) {
                    contactStore.indexGroupMetadata(gid, meta);
                    count++;
                  }
                  console.log(`[Baileys] Pre-indexed ${count} groups for instant LID-to-Phone resolution.`);
                }
              }
            } catch (e) {}
          }, 3000);
        }

        if (connection === 'close') {
          this.status = 'disconnected';
          const statusCode = (lastDisconnect?.error)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason?.loggedOut;
          console.log(`[Baileys] Connection closed (code: ${statusCode}, loggedOut: ${isLoggedOut})`);

          if (!isLoggedOut) {
            if (!this.reconnectTimer) {
              this.reconnectAttempts = Math.min(this.reconnectAttempts + 1, 5);
              const delay = Math.min(8000 + (this.reconnectAttempts * 3000), 25000);
              console.log(`[Baileys] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempts})...`);

              this.reconnectTimer = setTimeout(() => {
                this.reconnectTimer = null;
                this.start().catch(err => console.error('[Baileys] Reconnect error:', err.message));
              }, delay);
            }
          } else {
            console.log('[Baileys] Session logged out. Session files cleared for re-pairing.');
            try {
              fs.rmSync(authFolder, { recursive: true, force: true });
            } catch (e) {}
          }
        }
      });

      // ── Event 1: Contact & Identity Updates ──
      this.sock.ev.on('contacts.upsert', (contacts) => {
        if (!Array.isArray(contacts)) return;
        for (const c of contacts) {
          if (c.lid && (c.jid || c.id)) {
            contactStore.registerLidMapping(c.lid, c.jid || c.id, c.name || c.notify);
          } else if (c.name || c.notify) {
            contactStore.setPushName(c.jid || c.id || c.lid, c.name || c.notify);
          }
        }
      });

      this.sock.ev.on('contacts.update', (updates) => {
        if (!Array.isArray(updates)) return;
        for (const u of updates) {
          if (u.id && (u.notify || u.name)) {
            contactStore.setPushName(u.id, u.notify || u.name);
          }
        }
      });

      this.sock.ev.on('groups.update', async (groupUpdates) => {
        if (!Array.isArray(groupUpdates)) return;
        for (const g of groupUpdates) {
          if (g.id) {
            contactStore.getGroupMetadata(this.sock, g.id).catch(() => {});
          }
        }
      });

      // ── Event 2: Message Updates (Revokes / Stub Deletions) ──
      this.sock.ev.on('messages.update', async (updates) => {
        try {
          if (!Array.isArray(updates)) return;
          for (const item of updates) {
            const isRevoke = item.update?.messageStubType === 68 || // WAMessageStubType.REVOKE
              item.update?.messageStubType === 'REVOKE' ||
              item.update?.message === null;

            if (isRevoke && item.key?.id) {
              console.log(`[Baileys] Revoke detected in messages.update for ID: ${item.key.id}`);
              await antiDelete.handleRevoke(this.sock, {
                key: item.key,
                revokedId: item.key.id,
                participant: item.update?.key?.participant || item.key?.participant || item.key?.remoteJid,
                fromMe: item.update?.key?.fromMe ?? item.key?.fromMe,
                chatJid: item.key?.remoteJid
              });
            }
          }
        } catch (err) {
          console.error('[Baileys] messages.update error:', err.message);
        }
      });

      // ── Event 3: Message Deletes ──
      this.sock.ev.on('messages.delete', async (item) => {
        try {
          if (!item || !Array.isArray(item.keys)) return;
          for (const k of item.keys) {
            if (k?.id) {
              console.log(`[Baileys] Revoke detected in messages.delete for ID: ${k.id}`);
              await antiDelete.handleRevoke(this.sock, {
                key: k,
                revokedId: k.id,
                participant: k.participant || k.remoteJid,
                fromMe: k.fromMe,
                chatJid: k.remoteJid
              });
            }
          }
        } catch (err) {
          console.error('[Baileys] messages.delete error:', err.message);
        }
      });

      // ── Event 4: Incoming Messages & Revocation Protocol Messages ──
      this.sock.ev.on('messages.upsert', async (chatUpdate) => {
        try {
          if (!chatUpdate.messages || !Array.isArray(chatUpdate.messages)) return;

          for (const msg of chatUpdate.messages) {
            if (!msg || !msg.message) continue;

            // 1. Anti-Delete: Store all incoming content in cache FIRST (before dropping duplicates)
            antiDelete.storeMessage(msg);

            // 2. Index contact and phone mappings
            contactStore.indexMessage(msg);

            // 3. Anti-Delete: Check for message revocation protocol messages (with deep unwrap)
            const inner = antiDelete.unwrapMessage(msg);
            const protocolMsg = inner?.protocolMessage;
            if (protocolMsg && (protocolMsg.type === 0 || protocolMsg.type === 'REVOKE' || protocolMsg.key?.id)) {
              console.log(`[Baileys] Revoke detected in messages.upsert for ID: ${protocolMsg.key?.id || 'unknown'}`);
              await antiDelete.handleRevoke(this.sock, msg);
              continue;
            }

            // 4. Ignore junk messages (status broadcasts, newsletters)
            if (safety.shouldIgnoreMessage(msg)) continue;

            // Ignore messages sent by the bot itself to prevent self-trigger loops
            if (msg.key.id && safety.isBotSent(msg.key.id)) continue;

            // 5. Message deduplication (prevents double replies & feedback loops)
            if (safety.isDuplicate(msg.key.id)) continue;

            // 6. Process commands
            await commandHandler.handleMessage(this.sock, msg);
          }
        } catch (err) {
          console.error('[Baileys] Message handling error:', err.message);
        }
      });

      return this.sock;
    } finally {
      this.isStarting = false;
    }
  }

  /**
   * Request an 8-character pairing code for a phone number
   * @param {string} phoneNumber 
   * @returns {Promise<string>}
   */
  async requestNewPairingCode(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    this.pairingCode = null;

    const authFolder = path.resolve(config.sessionDir);
    try {
      if (fs.existsSync(authFolder)) {
        fs.rmSync(authFolder, { recursive: true, force: true });
      }
    } catch (e) {}

    await this.start();
    await new Promise(r => setTimeout(r, 2000));

    try {
      console.log(`[Baileys] Requesting pairing code for +${cleanNumber}...`);
      const code = await this.sock.requestPairingCode(cleanNumber);
      this.pairingCode = code?.match(/.{1,4}/g)?.join('-') || code;
      this.status = 'waiting_pair';
      console.log(`[Baileys] Pairing code generated: ${this.pairingCode}`);
      return this.pairingCode;
    } catch (err) {
      console.error('[Baileys] Pairing code generation error:', err.message);
      throw err;
    }
  }
}

module.exports = new WhatsAppClient();
