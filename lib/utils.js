/**
 * Mini WhatsApp Bot Utility Functions
 */

/**
 * Format clean box wrapper for WhatsApp messages
 * @param {string} title 
 * @param {string} body 
 * @param {string} footer 
 * @returns {string}
 */
function miniBox(title, body, footer = 'MINI BOT') {
  return `╭───『 *${title.toUpperCase()}* 』───╮\n${body}\n╰───『 *${footer}* 』───╯`;
}

/**
 * Format timestamp to 12-hour format with AM/PM
 * @param {Date|number} [date]
 * @returns {string}
 */
function formatTime(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

module.exports = {
  miniBox,
  formatTime,
};
