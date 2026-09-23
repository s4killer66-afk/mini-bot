/**
 * Mini WhatsApp Bot Configuration
 */
require('dotenv').config();

module.exports = {
  // Bot Identity
  botName: process.env.BOT_NAME || 'MiniBot',
  ownerName: process.env.OWNER_NAME || 'Owner',

  // Owner WhatsApp phone numbers (numbers with country code, no + or spaces)
  ownerNumbers: (process.env.OWNER_NUMBERS || '923056499820,923116469820').split(',').map(n => n.trim()),

  // Auto-request pairing code in terminal on cloud hosts (e.g. KataBump)
  pairingNumber: process.env.PAIRING_NUMBER || '923056499820',

  // Supported command prefixes
  prefix: process.env.PREFIX || '.',
  prefixes: ['.', ',', '!', '#', '/'],

  // Authentication session directory
  sessionDir: process.env.SESSION_DIR || './auth_info_baileys',

  // Web Pairing Dashboard Port
  port: parseInt(process.env.PORT || '8080', 10),

  // Feature Options
  antiDelete: {
    enabled: true,          // Enabled by default
    silentMode: true,       // 100% Silent Ghost Mode: Sends deleted chats directly to YOUR inbox only
    cacheTtlSeconds: 86400, // Keep messages cached for up to 24 hours
    maxCachedMessages: 5000,
  },

  viewOnce: {
    silentMode: true,       // 100% Silent Mode: Sends view-once media directly to YOUR inbox only
    deliveryMode: 'dm',     // Always private DM
  }
};
