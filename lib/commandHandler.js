/**
 * Mini WhatsApp Bot Command Loader and Dispatcher
 */

const fs = require('fs');
const path = require('path');
const config = require('../config');
const safety = require('./safety');

class CommandHandler {
  constructor() {
    this.commands = new Map();
    this.aliases = new Map();
    this.loadCommands();
  }

  /**
   * Load all command modules from commands directory
   */
  loadCommands() {
    this.commands.clear();
    this.aliases.clear();
    const commandsDir = path.join(__dirname, '..', 'commands');
    if (!fs.existsSync(commandsDir)) return;

    const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      try {
        const command = require(path.join(commandsDir, file));
        if (command.name && typeof command.execute === 'function') {
          this.commands.set(command.name.toLowerCase(), command);
          if (Array.isArray(command.aliases)) {
            for (const alias of command.aliases) {
              this.aliases.set(alias.toLowerCase(), command.name.toLowerCase());
            }
          }
        }
      } catch (err) {
        console.error(`[CommandHandler] Error loading command ${file}:`, err);
      }
    }
    console.log(`[CommandHandler] Registered ${this.commands.size} commands (${this.aliases.size} aliases).`);
  }

  /**
   * Find command by name or alias
   * @param {string} cmdName 
   * @returns {object|null}
   */
  getCommand(cmdName) {
    const clean = (cmdName || '').toLowerCase();
    if (this.commands.has(clean)) {
      return this.commands.get(clean);
    }
    if (this.aliases.has(clean)) {
      const realName = this.aliases.get(clean);
      return this.commands.get(realName);
    }
    return null;
  }

  /**
   * Determine matching prefix from incoming message
   * @param {string} text 
   * @returns {string|null}
   */
  getPrefix(text) {
    const prefixes = config.prefixes || ['.', ',', '!', '#', '/'];
    for (const p of prefixes) {
      if (text.startsWith(p)) {
        return p;
      }
    }
    return null;
  }

  /**
   * Deep unwrap modern WhatsApp wrappers (ephemeral, view-once, document-with-caption, edited)
   */
  unwrapMessage(msg) {
    if (!msg) return null;
    let m = msg.message || msg;
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

  /**
   * Process message and execute command
   * @param {object} sock Baileys socket
   * @param {object} msg Incoming message object
   */
  async handleMessage(sock, msg) {
    const innerMsg = this.unwrapMessage(msg);
    if (!innerMsg) return false;

    const from = msg.key.remoteJid;
    const isGroup = from.endsWith('@g.us');
    const sender = isGroup ? (msg.key.participant || from) : from;

    // Extract text from regular conversation, extended text, or media captions
    const text = (
      innerMsg.conversation ||
      innerMsg.extendedTextMessage?.text ||
      innerMsg.imageMessage?.caption ||
      innerMsg.videoMessage?.caption ||
      innerMsg.documentMessage?.caption ||
      ''
    ).trim();

    if (!text) return false;

    let cmdName = null;
    let args = [];

    const matchedPrefix = this.getPrefix(text);
    if (matchedPrefix) {
      args = text.slice(matchedPrefix.length).trim().split(/\s+/);
      cmdName = args.shift().toLowerCase();
    } else {
      // Also match standalone keywords without prefix
      const words = text.split(/\s+/);
      const firstWord = words[0].toLowerCase();
      const standaloneKeywords = [
        'menu', 'help', 'ping', 'alive', 'commands',
        'vv', 'viewonce', 'videwonce', 'rvo',
        'antidelet', 'antidelete', 'antidel',
        'bot',
        'movie', 'film', 'movies', 'cinema',
        'series', 'tv', 'show', 'drama', 'kdrama',
        'anime', 'ani',
        'mute', 'unmute'
      ];
      if (standaloneKeywords.includes(firstWord)) {
        cmdName = firstWord;
        args = words.slice(1);
      } else {
        return false;
      }
    }

    const command = this.getCommand(cmdName);
    if (!command) return false;

    const isOwner = msg.key.fromMe || safety.isOwner(sender) || safety.isOwner(from);

    // If bot is turned OFF, only allow owner to run 'bot' command to wake it up
    if (!safety.isBotEnabled()) {
      if (command.name !== 'bot' || !isOwner) {
        return false;
      }
    }

    console.log(`[CommandHandler] Executing .${cmdName} from ${sender.split('@')[0]} (fromMe: ${msg.key.fromMe}, isOwner: ${isOwner})`);

    try {
      await command.execute({
        sock,
        msg,
        from,
        sender,
        isGroup,
        isOwner,
        args,
        text,
        commandName: cmdName,
      });
      return true;
    } catch (err) {
      console.error(`[CommandHandler] Error executing command ${cmdName}:`, err);
      try {
        await sock.sendMessage(from, {
          text: `⚠️ *Command Error (${cmdName}):* ${err.message}`
        }, { quoted: msg });
      } catch (sendErr) {
        // Retry without quote in case quote failed
        await sock.sendMessage(from, {
          text: `⚠️ *Command Error (${cmdName}):* ${err.message}`
        });
      }
      return true;
    }
  }
}

module.exports = new CommandHandler();
