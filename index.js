/**
 * Mini WhatsApp Bot Entrypoint & Pairing Dashboard
 * Commands: .viewonce, .antidelet, .bot
 */

process.on('uncaughtException', (err) => {
  console.log('[System Handled Exception]:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.log('[System Handled Rejection]:', reason?.message || reason);
});

const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const waClient = require('./lib/baileys');
const safety = require('./lib/safety');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 1. Connection & Bot Status API
app.get('/api/status', (req, res) => {
  res.json({
    status: waClient.status,
    botEnabled: safety.isBotEnabled(),
    pairingCode: waClient.pairingCode,
    hasQr: Boolean(waClient.qrCodeBase64),
    user: waClient.connectedUser ? {
      name: waClient.connectedUser.name || 'Mini Bot',
      id: waClient.connectedUser.id?.split(':')[0],
    } : null,
    botName: config.botName,
    prefix: config.prefix,
  });
});

// 2. Generate WhatsApp 8-Digit Pairing Code API
app.post('/api/pair', async (req, res) => {
  const { phoneNumber } = req.body;
  if (!phoneNumber) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }

  const cleanNumber = String(phoneNumber).replace(/[^0-9]/g, '');
  if (cleanNumber.length < 8) {
    return res.status(400).json({ success: false, message: 'Phone number too short. Include country code.' });
  }

  try {
    console.log(`[Web API] Requesting pairing code for +${cleanNumber}...`);
    const code = await waClient.requestNewPairingCode(cleanNumber);
    if (code) {
      res.json({ success: true, pairingCode: code });
    } else {
      res.status(500).json({ success: false, message: 'Failed to generate pairing code in time. Please try again.' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Fallback QR Code API
app.get('/api/qr', (req, res) => {
  if (waClient.qrCodeBase64) {
    res.json({ success: true, qr: waClient.qrCodeBase64 });
  } else {
    res.json({ success: false, message: 'No active QR code. Use phone pairing code instead.' });
  }
});

// Start Express Server & Baileys Connection
const server = app.listen(config.port, async () => {
  console.log(`\n======================================================`);
  console.log(`⚡ ${config.botName.toUpperCase()} — MINI WHATSAPP BOT`);
  console.log(`🌐 Local Dashboard: http://localhost:${config.port}`);
  console.log(`📋 Active Commands: ${config.prefix}viewonce, ${config.prefix}antidelet, ${config.prefix}bot, ${config.prefix}movie, ${config.prefix}anime`);

  // Auto-generate public web pairing URL so user can link via any browser
  try {
    const localtunnel = require('localtunnel');
    const tunnel = await localtunnel({ port: config.port });

    // Fetch server external IP for localtunnel friendly verification
    let ipPassword = '';
    try {
      const ipRes = await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(3000) });
      if (ipRes.ok) ipPassword = (await ipRes.text()).trim();
    } catch (e) {}

    console.log(`------------------------------------------------------`);
    console.log(`🌍 PUBLIC PAIRING WEBPAGE:`);
    console.log(`👉 ${tunnel.url}`);
    if (ipPassword) {
      console.log(`🔑 Webpage Password (if prompted): ${ipPassword}`);
    }
    console.log(`Open this link in your browser to link WhatsApp instantly!`);
    console.log(`------------------------------------------------------`);

    tunnel.on('close', () => {
      console.log('[Tunnel] Public pairing webpage closed.');
    });
    tunnel.on('error', (err) => {
      console.log('[Tunnel Info]:', err.message);
    });
  } catch (tunnelErr) {
    console.log('[Tunnel Info]:', tunnelErr.message);
  }

  console.log(`======================================================\n`);

  // Start WhatsApp Client in background
  waClient.start().catch(err => {
    console.log('[Baileys Startup] Ready for pairing code request from web portal or terminal.');
  });
});

module.exports = { app, server };
