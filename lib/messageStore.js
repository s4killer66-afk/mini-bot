/**
 * Persistent Message Cache for Anti-Delete & View-Once
 * Keeps messages saved to disk (JSONL) so that even if the bot restarts,
 * any message deleted from the past 48 hours can still be recovered seamlessly!
 */

const fs = require('fs');
const path = require('path');
const contactStore = require('./contactStore');

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const CACHE_FILE = path.join(DATA_DIR, 'messages_cache.jsonl');
const MAX_MESSAGES = 10000;
const MAX_AGE_MS = 48 * 60 * 60 * 1000; // 48 hours

class MessageStore {
  constructor() {
    this.cache = new Map(); // Map<id, { msg, timestamp }>
    this.init();
  }

  init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(CACHE_FILE)) {
        const content = fs.readFileSync(CACHE_FILE, 'utf-8');
        const lines = content.split('\n');
        const now = Date.now();
        let loaded = 0;

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            if (entry.id && entry.msg && now - (entry.timestamp || 0) < MAX_AGE_MS) {
              this.cache.set(entry.id, entry.msg);
              contactStore.indexMessage(entry.msg);
              loaded++;
            }
          } catch (e) {}
        }
        console.log(`[MessageStore] Loaded ${loaded} cached messages from disk.`);
      }
    } catch (err) {
      console.error('[MessageStore] Error initializing message store:', err.message);
    }
  }

  /**
   * Save a message in memory and append to disk
   */
  set(id, msg) {
    if (!id || !msg) return;
    this.cache.set(id, msg);
    contactStore.indexMessage(msg);

    // Append to file asynchronously
    try {
      const entry = JSON.stringify({
        id,
        timestamp: Date.now(),
        msg
      }) + '\n';

      fs.appendFile(CACHE_FILE, entry, (err) => {
        if (err) console.error('[MessageStore] Error appending message:', err.message);
      });
    } catch (e) {}

    // Trim memory if exceeding limit
    if (this.cache.size > MAX_MESSAGES) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Get a cached message by ID
   */
  get(id) {
    if (!id) return null;
    return this.cache.get(id) || null;
  }

  has(id) {
    return this.cache.has(id);
  }
}

module.exports = new MessageStore();
