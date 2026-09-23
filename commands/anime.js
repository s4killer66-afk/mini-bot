/**
 * Mini WhatsApp Bot Anime Search & Streaming Command
 * Commands: .anime <name> [episode]
 * Features:
 * - Direct search on AniKoto (https://anikoto.cz) and Anichi (https://anichi.to)
 * - Episode selector (e.g. .anime solo leveling 3)
 * - English Sub & English Dub status
 * - Instant stream player with full controls (play/pause, fullscreen, server switcher)
 * - ZERO disk and RAM load on hosting (lightweight link generation)
 */

const { miniBox } = require('../lib/utils');
const safety = require('../lib/safety');

/**
 * Search AniKoto for anime results
 */
async function searchAniKoto(query) {
  try {
    const url = `https://anikoto.cz/filter?keyword=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    const items = [];
    const itemBlocks = html.split('<div class="item');
    for (let i = 1; i < itemBlocks.length; i++) {
      const block = itemBlocks[i];
      const titleMatch = block.match(/<a class="name d-title"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
      const imgMatch = block.match(/<img\s+src="([^"]+)"/i);
      const subMatch = block.match(/class="ep-status sub"[^>]*>\s*<span>\s*(\d+)/i);
      const dubMatch = block.match(/class="ep-status dub"[^>]*>\s*<span>\s*(\d+)/i);
      const totalMatch = block.match(/class="ep-status total"[^>]*>\s*<span>\s*(\d+)/i);
      const typeMatch = block.match(/<div class="right">([^<]+)<\/div>/i);

      if (titleMatch) {
        items.push({
          title: titleMatch[2].trim(),
          watchUrl: titleMatch[1].trim(),
          poster: imgMatch ? imgMatch[1].trim() : null,
          sub: subMatch ? parseInt(subMatch[1], 10) : 0,
          dub: dubMatch ? parseInt(dubMatch[1], 10) : 0,
          total: totalMatch ? parseInt(totalMatch[1], 10) : 0,
          type: typeMatch ? typeMatch[1].trim() : 'Anime'
        });
      }
    }
    return items;
  } catch (e) {
    return [];
  }
}

/**
 * Fetch anime poster buffer
 */
async function getPosterBuffer(url) {
  if (!url) return null;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    return null;
  }
}

module.exports = {
  name: 'anime',
  aliases: ['ani', 'animelist', 'watchanime', 'animes'],
  description: 'Search anime and get instant streaming player with Sub/Dub and episode selection',
  usage: '.anime <anime name> [episode number]',

  async execute({ sock, msg, from, sender, args }) {
    if (!safety.canExecuteCommand(sender)) return;

    if (!args || args.length === 0) {
      return safety.safeSend(sock, from, {
        text: '🍙 *Usage:* `.anime <anime name> [episode]`\n\n*Examples:*\n• `.anime solo leveling`\n• `.anime solo leveling 2`\n• `.anime naruto 10`\n• `.anime jujutsu kaisen`'
      }, { quoted: msg });
    }

    let rawQuery = args.join(' ').trim();
    let selectedEp = null;

    // Detect optional episode number at end of query (e.g. "solo leveling 3" or "naruto ep 5")
    const epMatch = rawQuery.match(/(?:(?:ep|episode)\s*(\d+)|\b(\d+))$/i);
    let cleanQuery = rawQuery;
    if (epMatch) {
      const potentialEp = parseInt(epMatch[1] || epMatch[2], 10);
      const remaining = rawQuery.replace(/(?:(?:ep|episode)\s*(\d+)|\b(\d+))$/i, '').trim();
      if (remaining.length > 0 && potentialEp < 1900) {
        selectedEp = potentialEp;
        cleanQuery = remaining;
      }
    }

    try {
      const results = await searchAniKoto(cleanQuery);

      if (!results || results.length === 0) {
        const anichiLink = `https://anichi.to/search?keyword=${encodeURIComponent(cleanQuery)}`;
        const anikotoLink = `https://anikoto.cz/filter?keyword=${encodeURIComponent(cleanQuery)}`;
        return safety.safeSend(sock, from, {
          text: `❌ *Anime Not Found on AniKoto:*\nCould not find anime matching "*${cleanQuery}*".\n\n🌐 *Direct Search Links:*\n• AniKoto: ${anikotoLink}\n• Anichi: ${anichiLink}`
        }, { quoted: msg });
      }

      const anime = results[0];
      const targetEp = selectedEp || 1;
      const baseWatchUrl = anime.watchUrl.replace(/\/ep-\d+$/, '');
      const currentWatchUrl = `${baseWatchUrl}/ep-${targetEp}`;

      // Audio / Sub / Dub status
      let audioStatus = '🇯🇵 Original Japanese (English Sub)';
      if (anime.dub > 0) {
        audioStatus = `🎙️ Dual Audio: English Sub + English Dub Available (${anime.dub} Dub eps)`;
      } else if (anime.sub > 0) {
        audioStatus = `📝 English Subtitles (${anime.sub} Sub eps)`;
      }

      // Quick Episode Links
      const maxQuickEps = Math.min(anime.total || anime.sub || 5, 5);
      let episodeLinks = '';
      for (let i = 1; i <= maxQuickEps; i++) {
        const marker = (i === targetEp) ? '▶️' : '•';
        episodeLinks += `${marker} Ep ${i}: ${baseWatchUrl}/ep-${i}\n`;
      }

      const anichiSearch = `https://anichi.to/search?keyword=${encodeURIComponent(anime.title)}`;

      const body = `
🍙 *${anime.title.toUpperCase()}*
📺 *Format:* ${anime.type} | Total: ${anime.total || anime.sub || 'Ongoing'} Episodes
🔊 *Audio:* ${audioStatus}

==============================
▶️ *NOW PLAYING (EPISODE ${targetEp}):*
Tap to play with Full Controls (Play/Pause, Fullscreen & Server Switch):
👉 ${currentWatchUrl}
==============================

📑 *QUICK EPISODE LINKS:*
${episodeLinks.trim()}

🌐 *Anichi Mirror Search:*
👉 ${anichiSearch}

💡 *Tip:* To jump directly to any episode, type:
\`.anime ${cleanQuery} <ep#>\` (e.g. \`.anime ${cleanQuery} ${targetEp + 1}\`)
`.trim();

      const output = miniBox('ANIME STREAMING', body, 'MINI BOT ANIME');

      // Fetch poster image
      const posterBuffer = await getPosterBuffer(anime.poster);

      if (posterBuffer) {
        return safety.safeSend(sock, from, {
          image: posterBuffer,
          caption: output
        }, { quoted: msg });
      } else {
        return safety.safeSend(sock, from, {
          text: output
        }, { quoted: msg });
      }

    } catch (err) {
      console.error('[Anime Command Error]:', err.message);
      return safety.safeSend(sock, from, {
        text: `⚠️ *Anime Search Error:* ${err.message}`
      }, { quoted: msg });
    }
  }
};
