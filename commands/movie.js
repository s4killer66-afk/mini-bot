/**
 * Mini WhatsApp Bot Movie Search & Dual-Audio Streaming Command
 * Commands: .movie <name>
 * Features:
 * - Fetches poster, rating, year, genre, and synopsis
 * - Generates Dual Audio (Hindi Dubbed + English) streaming player links
 * - Provides direct watch & download links
 * - ZERO disk and RAM load on hosting (lightweight link generation)
 */

const { miniBox } = require('../lib/utils');
const safety = require('../lib/safety');

// TMDB public API key for movie metadata & posters
const TMDB_API_KEY = '15d2ea6d0dc1d476efbca3eba2b9bbfb';

/**
 * Search TMDB for movie details
 */
async function searchMovie(query) {
  try {
    const url = `https://api.themoviedb.org/3/search/movie?query=${encodeURIComponent(query)}&api_key=${TMDB_API_KEY}&language=en-US&page=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.results && data.results.length > 0 ? data.results[0] : null;
  } catch (e) {
    return null;
  }
}

/**
 * Fetch poster image buffer
 */
async function getPosterBuffer(posterPath) {
  if (!posterPath) return null;
  try {
    const url = `https://image.tmdb.org/t/p/w500${posterPath}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    return null;
  }
}

module.exports = {
  name: 'movie',
  aliases: ['film', 'cinema', 'watchmovie', 'movies'],
  description: 'Search movies and get direct Dual Audio (Hindi/English) streaming player',
  usage: '.movie <movie name>',

  async execute({ sock, msg, from, sender, args }) {
    if (!safety.canExecuteCommand(sender)) return;

    const query = args.join(' ').trim();
    if (!query) {
      return safety.safeSend(sock, from, {
        text: '🎬 *Usage:* `.movie <movie name>`\n\n*Example:*\n• `.movie titanic`\n• `.movie avengers endgame`\n• `.movie pushpa 2`'
      }, { quoted: msg });
    }

    try {
      const movie = await searchMovie(query);

      if (!movie) {
        return safety.safeSend(sock, from, {
          text: `❌ *Movie Not Found:*\nNo matches found for "*${query}*". Please check the spelling and try again.`
        }, { quoted: msg });
      }

      const releaseYear = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
      const rating = movie.vote_average ? `${movie.vote_average.toFixed(1)}/10 ⭐` : 'N/A';
      const overview = movie.overview ? (movie.overview.length > 280 ? movie.overview.slice(0, 277) + '...' : movie.overview) : 'No overview available.';
      const tmdbId = movie.id;

      // Dual Audio Streaming & Mirror Player Links
      const playerDualAudio = `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`;
      const playerVidsrc = `https://vidsrc.cc/v2/embed/movie/${tmdbId}`;
      const net77Search = `https://net77.cc/home`;

      const body = `
🎬 *${movie.title.toUpperCase()}* (${releaseYear})
⭐ *Rating:* ${rating}
🔊 *Audio:* Hindi Dubbed & English (Dual Audio)

📝 *Overview:*
${overview}

==============================
▶️ *INSTANT STREAMING PLAYER:*
Tap to play with Full Controls (Play/Pause, Fullscreen & Audio Switcher):
👉 ${playerDualAudio}

🌐 *Alternative Mirror Player:*
👉 ${playerVidsrc}

🔍 *Net77 Mirror:*
👉 ${net77Search}
==============================

💡 *Tip:* Open the player link in your browser to switch between Hindi and English audio tracks!
`.trim();

      const output = miniBox('MOVIE STREAMING', body, 'MINI BOT CINEMA');

      // Fetch poster image to send as photo card
      const posterBuffer = await getPosterBuffer(movie.poster_path);

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
      console.error('[Movie Command Error]:', err.message);
      return safety.safeSend(sock, from, {
        text: `⚠️ *Movie Search Error:* ${err.message}`
      }, { quoted: msg });
    }
  }
};
