/**
 * Contact & Identity Resolver for MiniBot
 * Bridges WhatsApp LIDs (Linked Identifiers) to real Phone Numbers
 * and resolves Contact / Push Names across Groups and Direct Chats.
 */

class ContactStore {
  constructor() {
    this.lidToPhone = new Map(); // Map<cleanLid, cleanPhone>
    this.phoneToLid = new Map(); // Map<cleanPhone, cleanLid>
    this.phoneToName = new Map(); // Map<cleanPhone, name>
    this.lidToName = new Map();   // Map<cleanLid, name>

    // Cache group metadata to avoid spamming the socket
    this.groupMetaCache = new Map(); // Map<groupJid, { data, timestamp }>
    this.GROUP_CACHE_TTL = 300000;   // 5 minutes
  }

  /**
   * Clean JID/LID/Phone to pure digits
   */
  cleanNumber(input) {
    if (!input || typeof input !== 'string') return '';
    return input.split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
  }

  /**
   * Record an LID to Phone mapping
   */
  registerLidMapping(lid, phone, name = null) {
    const cleanL = this.cleanNumber(lid);
    const cleanP = this.cleanNumber(phone);

    if (cleanL && cleanP && cleanL !== cleanP) {
      this.lidToPhone.set(cleanL, cleanP);
      this.phoneToLid.set(cleanP, cleanL);
    }

    if (name && typeof name === 'string' && name.trim()) {
      const trimmed = name.trim();
      if (cleanP) this.phoneToName.set(cleanP, trimmed);
      if (cleanL) this.lidToName.set(cleanL, trimmed);
    }
  }

  /**
   * Record a PushName or Contact Name
   */
  setPushName(jidOrPhone, name) {
    if (!name || typeof name !== 'string' || !name.trim()) return;
    const clean = this.cleanNumber(jidOrPhone);
    if (!clean) return;

    const trimmed = name.trim();
    if (this.lidToPhone.has(clean)) {
      const phone = this.lidToPhone.get(clean);
      this.phoneToName.set(phone, trimmed);
      this.lidToName.set(clean, trimmed);
    } else {
      this.phoneToName.set(clean, trimmed);
    }
  }

  /**
   * Sync participants from group metadata into store
   */
  indexGroupMetadata(groupJid, meta) {
    if (!meta || !Array.isArray(meta.participants)) return;
    this.groupMetaCache.set(groupJid, { data: meta, timestamp: Date.now() });

    for (const p of meta.participants) {
      const jid = p.jid || p.id || '';
      const lid = p.lid || '';
      const name = p.name || p.notify || null;

      // In Baileys, p.jid is the phone JID (e.g. 92301...@s.whatsapp.net)
      // and p.lid is the LID JID (e.g. 23038...@lid)
      if (lid && jid && !lid.includes('@s.whatsapp.net')) {
        this.registerLidMapping(lid, jid, name);
      }
    }
  }

  /**
   * Retrieve cached or fresh group metadata
   */
  async getGroupMetadata(sock, groupJid) {
    if (!sock || !groupJid || !groupJid.endsWith('@g.us')) return null;

    const cached = this.groupMetaCache.get(groupJid);
    if (cached && Date.now() - cached.timestamp < this.GROUP_CACHE_TTL) {
      return cached.data;
    }

    try {
      const meta = await sock.groupMetadata(groupJid);
      if (meta) {
        this.indexGroupMetadata(groupJid, meta);
        return meta;
      }
    } catch (err) {
      // Fallback to stale cache if request fails
      if (cached) return cached.data;
    }
    return null;
  }

  /**
   * Automatically index phone and contact info from any message object
   */
  indexMessage(msg) {
    if (!msg || !msg.key) return;
    const k = msg.key;
    const pushName = msg.pushName || null;

    if (k.participant && k.participantPn) {
      this.registerLidMapping(k.participant, k.participantPn, pushName);
    }
    if (k.remoteJid && k.senderPn) {
      this.registerLidMapping(k.remoteJid, k.senderPn, pushName);
    }
    if (pushName) {
      this.setPushName(k.participantPn || k.senderPn || k.participant || k.remoteJid, pushName);
    }
  }

  /**
   * Resolve true sender phone number and display name
   * @param {object} sock Baileys socket
   * @param {object} options
   * @param {string} [options.jid] Direct candidate JID/phone
   * @param {string} [options.participant] Quoted or revoke participant JID
   * @param {string} [options.participantPn] Direct participant phone JID if available
   * @param {string} [options.senderPn] Direct sender phone JID if available
   * @param {string} [options.from] Chat remoteJid
   * @param {boolean} [options.isGroup]
   * @param {string} [options.pushName] Direct pushName if provided
   * @returns {Promise<{ phone: string, name: string|null, display: string }>}
   */
  async resolveSender(sock, { jid = '', participant = '', participantPn = '', senderPn = '', from = '', isGroup = false, pushName = null }) {
    const rawTarget = participant || jid || (isGroup ? '' : from);
    const cleanRaw = this.cleanNumber(rawTarget);

    let realPhone = '';
    let contactName = pushName || null;

    // 1. Direct phone number from WhatsApp protocol (participantPn / senderPn)
    if (participantPn) {
      const p = this.cleanNumber(participantPn);
      if (p && p.length >= 7 && p.length <= 14) {
        realPhone = p;
        if (cleanRaw && cleanRaw !== realPhone) {
          this.registerLidMapping(cleanRaw, realPhone, contactName);
        }
      }
    }
    if (!realPhone && senderPn) {
      const p = this.cleanNumber(senderPn);
      if (p && p.length >= 7 && p.length <= 14) {
        realPhone = p;
        if (cleanRaw && cleanRaw !== realPhone) {
          this.registerLidMapping(cleanRaw, realPhone, contactName);
        }
      }
    }

    // 2. If in a group, lookup the participant in group metadata
    if (!realPhone && isGroup && from) {
      const meta = await this.getGroupMetadata(sock, from);
      if (meta?.participants) {
        // Find matching member by ID, JID, or LID
        const member = meta.participants.find(p => {
          const pJid = this.cleanNumber(p.jid || p.id);
          const pLid = this.cleanNumber(p.lid);
          return (cleanRaw && (pJid === cleanRaw || pLid === cleanRaw)) ||
            (rawTarget && (p.id === rawTarget || p.jid === rawTarget || p.lid === rawTarget));
        });

        if (member) {
          // member.jid or member.id contains the real phone number
          const candidatePhone = this.cleanNumber(member.jid || member.id);
          if (candidatePhone && candidatePhone.length >= 7 && candidatePhone.length <= 14) {
            realPhone = candidatePhone;
            if (member.lid) {
              this.registerLidMapping(member.lid, realPhone, member.name || member.notify);
            }
          }
          if (member.name || member.notify) {
            contactName = contactName || member.name || member.notify;
          }
        }
      }
    }

    // 3. Check LID-to-Phone mapping in memory
    if (!realPhone && cleanRaw) {
      if (this.lidToPhone.has(cleanRaw)) {
        realPhone = this.lidToPhone.get(cleanRaw);
      }
    }

    // 4. Standard Phone Number (10-14 digits, not a 15+ digit LID or 18+ digit group)
    const isLid = rawTarget.endsWith('@lid') || (cleanRaw.length >= 15 && !rawTarget.endsWith('@s.whatsapp.net'));
    if (!realPhone && cleanRaw && !isLid && cleanRaw.length >= 7 && cleanRaw.length <= 14) {
      realPhone = cleanRaw;
    }

    // 5. Resolve name from store
    if (!contactName && realPhone && this.phoneToName.has(realPhone)) {
      contactName = this.phoneToName.get(realPhone);
    }
    if (!contactName && cleanRaw && this.lidToName.has(cleanRaw)) {
      contactName = this.lidToName.get(cleanRaw);
    }

    // 6. Format display string cleanly
    let display = 'Unknown Sender';
    if (realPhone) {
      display = contactName ? `+${realPhone} (${contactName})` : `+${realPhone}`;
    } else if (contactName) {
      display = contactName;
    } else if (cleanRaw) {
      // Unmapped LID — do NOT prepend '+' as it is not a phone number
      display = `User ${cleanRaw.slice(-4)}`;
    }

    return {
      phone: realPhone,
      name: contactName,
      display
    };
  }
}

module.exports = new ContactStore();
