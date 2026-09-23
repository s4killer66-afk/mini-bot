/**
 * Mini WhatsApp Bot Integration Test Suite
 */

const assert = require('assert');
const commandHandler = require('../lib/commandHandler');
const antiDelete = require('../lib/antiDelete');
const contactStore = require('../lib/contactStore');
const safety = require('../lib/safety');
const config = require('../config');

console.log('🧪 Starting Mini WhatsApp Bot Integration Tests...\n');

let passedTests = 0;
let totalTests = 0;

function it(name, testFn) {
  totalTests++;
  try {
    testFn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
  }
}

async function runAsyncTests() {
  // Test 1: Check commands loaded
  it('Loads the core commands: viewonce, antidelet, bot, menu, movie, anime, series, mute, unmute', () => {
    assert.strictEqual(commandHandler.commands.size, 9, 'Expected 9 commands loaded');
    assert.ok(commandHandler.commands.has('viewonce'), 'Missing viewonce command');
    assert.ok(commandHandler.commands.has('antidelet'), 'Missing antidelet command');
    assert.ok(commandHandler.commands.has('bot'), 'Missing bot command');
    assert.ok(commandHandler.commands.has('menu'), 'Missing menu command');
    assert.ok(commandHandler.commands.has('movie'), 'Missing movie command');
    assert.ok(commandHandler.commands.has('anime'), 'Missing anime command');
    assert.ok(commandHandler.commands.has('series'), 'Missing series command');
    assert.ok(commandHandler.commands.has('mute'), 'Missing mute command');
    assert.ok(commandHandler.commands.has('unmute'), 'Missing unmute command');
  });

  // Test 2: Check aliases resolution
  it('Resolves command aliases correctly', () => {
    assert.strictEqual(commandHandler.getCommand('vv')?.name, 'viewonce');
    assert.strictEqual(commandHandler.getCommand('videwonce')?.name, 'viewonce');
    assert.strictEqual(commandHandler.getCommand('rvo')?.name, 'viewonce');
    assert.strictEqual(commandHandler.getCommand('antidelete')?.name, 'antidelet');
    assert.strictEqual(commandHandler.getCommand('antidel')?.name, 'antidelet');
    assert.strictEqual(commandHandler.getCommand('antirevoke')?.name, 'antidelet');
    assert.strictEqual(commandHandler.getCommand('switch')?.name, 'bot');
    assert.strictEqual(commandHandler.getCommand('power')?.name, 'bot');
    assert.strictEqual(commandHandler.getCommand('help')?.name, 'menu');
    assert.strictEqual(commandHandler.getCommand('ping')?.name, 'menu');
    assert.strictEqual(commandHandler.getCommand('film')?.name, 'movie');
    assert.strictEqual(commandHandler.getCommand('cinema')?.name, 'movie');
    assert.strictEqual(commandHandler.getCommand('ani')?.name, 'anime');
    assert.strictEqual(commandHandler.getCommand('watchanime')?.name, 'anime');
    assert.strictEqual(commandHandler.getCommand('tv')?.name, 'series');
    assert.strictEqual(commandHandler.getCommand('kdrama')?.name, 'series');
    assert.strictEqual(commandHandler.getCommand('closegroup')?.name, 'mute');
    assert.strictEqual(commandHandler.getCommand('opengroup')?.name, 'unmute');
  });

  // Test 3: Prefix parsing & standalone keywords
  it('Detects prefixes and standalone menu keywords', () => {
    assert.strictEqual(commandHandler.getPrefix('.viewonce'), '.');
    assert.strictEqual(commandHandler.getPrefix('!antidelet'), '!');
    assert.strictEqual(commandHandler.getPrefix('#bot'), '#');
    assert.strictEqual(commandHandler.getPrefix('/vv'), '/');
    assert.strictEqual(commandHandler.getPrefix('hello world'), null);
  });

  // Test 4: Bot power switch functionality
  it('Manages Bot Master Power Switch (bot on/off)', async () => {
    safety.setBotEnabled(true);
    assert.strictEqual(safety.isBotEnabled(), true);

    // Turn off
    safety.setBotEnabled(false);
    assert.strictEqual(safety.isBotEnabled(), false);

    // While offline, commands from non-owners should be ignored
    const mockSock = {
      sendMessage: async (jid, content) => content
    };
    const nonOwnerMsg = {
      key: { remoteJid: '12345678@s.whatsapp.net', fromMe: false },
      message: { conversation: '.viewonce' }
    };
    const handled = await commandHandler.handleMessage(mockSock, nonOwnerMsg);
    assert.strictEqual(handled, false, 'Non-owner command should be blocked when bot is offline');

    // While offline, owner waking it up with .bot on should succeed
    const ownerMsg = {
      key: { remoteJid: '923116469820@s.whatsapp.net', fromMe: false },
      message: { conversation: '.bot on' }
    };
    const wakeHandled = await commandHandler.handleMessage(mockSock, ownerMsg);
    assert.strictEqual(wakeHandled, true, 'Owner .bot on command should be processed');
    assert.strictEqual(safety.isBotEnabled(), true, 'Bot should now be re-enabled');
  });

  // Test 5: ContactStore resolves group participant LIDs to Phone numbers
  it('Resolves participant LIDs to real phone numbers and names', async () => {
    const mockSock = {
      groupMetadata: async (gid) => ({
        id: gid,
        subject: 'Gaming Squad 🎮',
        participants: [
          {
            id: '923019876543@s.whatsapp.net',
            jid: '923019876543@s.whatsapp.net',
            lid: '230382129692888@lid',
            name: 'Ali Gamer'
          }
        ]
      })
    };

    const resolved = await contactStore.resolveSender(mockSock, {
      participant: '230382129692888@lid',
      from: '120363159007450337@g.us',
      isGroup: true
    });

    assert.strictEqual(resolved.phone, '923019876543', 'Should map LID to real phone number');
    assert.strictEqual(resolved.name, 'Ali Gamer', 'Should map name from participant');
    assert.strictEqual(resolved.display, '+923019876543 (Ali Gamer)', 'Display should format cleanly');
  });

  // Test 6: Anti-Delete recovers ephemeral wrapped messages silently
  it('Recovers ephemeral/disappearing messages silently to owner inbox', async () => {
    antiDelete.enabled = true;

    // Ephemeral message structure (disappearing messages on)
    const ephemeralSample = {
      key: {
        id: 'EPHEMERAL_MSG_101',
        remoteJid: '120363159007450337@g.us',
        participant: '230382129692888@lid',
        fromMe: false
      },
      message: {
        ephemeralMessage: {
          message: {
            conversation: 'This is a secret ephemeral message!'
          }
        }
      }
    };

    antiDelete.storeMessage(ephemeralSample);

    let sentToJid = null;
    let sentContent = null;

    const mockSock = {
      groupMetadata: async (gid) => ({
        id: gid,
        subject: 'Secret Club 🤫',
        participants: [
          {
            id: '923019876543@s.whatsapp.net',
            jid: '923019876543@s.whatsapp.net',
            lid: '230382129692888@lid',
            notify: 'Ahmed'
          }
        ]
      }),
      sendMessage: async (jid, content) => {
        sentToJid = jid;
        sentContent = content;
        return { key: { id: 'RESP_EPHEMERAL' } };
      }
    };

    // Ephemeral revoke structure
    const revokeMsg = {
      key: { remoteJid: '120363159007450337@g.us' },
      message: {
        ephemeralMessage: {
          message: {
            protocolMessage: {
              type: 0, // REVOKE
              key: { id: 'EPHEMERAL_MSG_101', participant: '230382129692888@lid' }
            }
          }
        }
      }
    };

    await antiDelete.handleRevoke(mockSock, revokeMsg);

    const expectedOwnerJid = safety.getOwnerJid();
    assert.strictEqual(sentToJid, expectedOwnerJid, 'Should silently send to owner inbox only');
    assert.ok(sentContent?.text?.includes('This is a secret ephemeral message!'), 'Recovered text should match');
    assert.ok(sentContent?.text?.includes('923019876543'), 'Should identify the actual phone number, not LID or group ID');
    assert.ok(sentContent?.text?.includes('Secret Club'), 'Should display source group name');
  });

  // Test 7: View-Once resolves the quoted sender instead of command executor
  it('Resolves quoted author in View-Once command instead of group ID or executor', async () => {
    const viewonceCmd = commandHandler.getCommand('viewonce');
    assert.ok(viewonceCmd, 'Missing viewonce command');

    // Store a View-Once image in memory cache as if received earlier
    const originalViewOnce = {
      key: {
        id: 'VO_IMG_777',
        remoteJid: '120363159007450337@g.us',
        participant: '230382129692888@lid',
        fromMe: false
      },
      pushName: 'Zainab',
      message: {
        viewOnceMessageV2: {
          message: {
            imageMessage: {
              mimetype: 'image/jpeg',
              caption: 'My private photo'
            }
          }
        }
      }
    };
    antiDelete.storeMessage(originalViewOnce);

    let sentToJid = null;
    let sentOptions = null;
    let deletedKey = null;

    const mockSock = {
      groupMetadata: async (gid) => ({
        id: gid,
        subject: 'Best Friends 🌟',
        participants: [
          {
            id: '923098887776@s.whatsapp.net',
            jid: '923098887776@s.whatsapp.net',
            lid: '230382129692888@lid',
            name: 'Zainab'
          }
        ]
      }),
      sendMessage: async (jid, content, options) => {
        if (content.delete) {
          deletedKey = content.delete;
          return;
        }
        sentToJid = jid;
        sentOptions = content;
        return { key: { id: 'SENT_VO_777' } };
      }
    };

    // User executes .vv as reply to the view-once image in the group
    const userCommandMsg = {
      key: {
        id: 'CMD_VV_1',
        remoteJid: '120363159007450337@g.us',
        participant: '923056499820@s.whatsapp.net', // The bot owner typing .vv
        fromMe: true
      },
      message: {
        extendedTextMessage: {
          text: '.vv',
          contextInfo: {
            stanzaId: 'VO_IMG_777',
            participant: '230382129692888@lid',
            quotedMessage: originalViewOnce.message.viewOnceMessageV2.message
          }
        }
      }
    };

    await viewonceCmd.execute({
      sock: mockSock,
      msg: userCommandMsg,
      from: '120363159007450337@g.us',
      sender: '923056499820@s.whatsapp.net',
      isGroup: true
    });

    const expectedOwnerJid = safety.getOwnerJid();
    assert.strictEqual(sentToJid, expectedOwnerJid, 'Must deliver silently to user private inbox');
    assert.strictEqual(deletedKey?.id, 'CMD_VV_1', 'Must self-delete the command message from group');
    assert.ok(sentOptions?.caption?.includes('923098887776'), 'Caption must contain the true sender phone number');
    assert.ok(!sentOptions?.caption?.includes('120363159007450337'), 'Caption must NOT show the group ID as sender');
    assert.ok(sentOptions?.caption?.includes('Best Friends'), 'Caption must show source group name');
  });

  // Test 8: Status API endpoint
  it('Serves valid status endpoint through Express', async () => {
    const { app } = require('../index');
    const req = {};
    let statusResult = null;
    const res = {
      json: (data) => {
        statusResult = data;
      }
    };

    const routes = app._router.stack.filter(r => r.route?.path === '/api/status');
    assert.ok(routes.length > 0, 'Status route should exist');
    routes[0].route.stack[0].handle(req, res);

    assert.ok(statusResult !== null, 'Status should return JSON');
    assert.strictEqual(typeof statusResult.botEnabled, 'boolean');
    assert.strictEqual(typeof statusResult.status, 'string');
    assert.strictEqual(statusResult.botName, config.botName);
  });

  // Test 9: WhatsApp participantPn / senderPn resolution
  it('Resolves real phone numbers directly via participantPn and senderPn', async () => {
    // 1. participantPn in group
    const resolvedGroup = await contactStore.resolveSender(null, {
      participant: '219305375465508@lid',
      participantPn: '923336610087@s.whatsapp.net',
      pushName: 'Zam Online Shop',
      isGroup: true
    });
    assert.strictEqual(resolvedGroup.phone, '923336610087');
    assert.strictEqual(resolvedGroup.display, '+923336610087 (Zam Online Shop)');

    // 2. senderPn in DM
    const resolvedDm = await contactStore.resolveSender(null, {
      from: '153678577160378@lid',
      senderPn: '639363881585@s.whatsapp.net',
      pushName: 'ELL TRI',
      isGroup: false
    });
    assert.strictEqual(resolvedDm.phone, '639363881585');
    assert.strictEqual(resolvedDm.display, '+639363881585 (ELL TRI)');
  });

  // Test 10: Self-chat anti-delete recovery
  it('Recovers self-chat deleted messages so users can verify anti-delete directly', async () => {
    const selfMsgId = 'SELF_TEST_DELETE_99';
    const ownerJid = safety.getOwnerJid();

    antiDelete.storeMessage({
      key: {
        id: selfMsgId,
        remoteJid: ownerJid,
        fromMe: true
      },
      message: {
        conversation: 'Testing anti-delete in self chat'
      }
    });

    let sentTarget = null;
    let sentPayload = null;

    const mockSock = {
      sendMessage: async (jid, content) => {
        sentTarget = jid;
        sentPayload = content;
        return { key: { id: 'RESP_SELF' } };
      }
    };

    await antiDelete.handleRevoke(mockSock, {
      revokedId: selfMsgId,
      chatJid: ownerJid,
      fromMe: true
    });

    assert.strictEqual(sentTarget, ownerJid, 'Must deliver recovered message to owner inbox');
    assert.ok(sentPayload?.text?.includes('Testing anti-delete in self chat'), 'Recovered text must match');
    assert.ok(sentPayload?.text?.includes('Self Chat'), 'Source should be Self Chat');
  });

  // Test 11: Movie Search and Dual Audio streaming link generation
  it('Searches movie metadata and generates Dual Audio streaming player links', async () => {
    const movieCmd = commandHandler.getCommand('movie');
    assert.ok(movieCmd, 'Missing movie command');

    let sentPayload = null;
    const mockSock = {
      sendMessage: async (jid, content) => {
        sentPayload = content;
        return { key: { id: 'RESP_MOVIE' } };
      }
    };

    const mockMsg = {
      key: { remoteJid: '923056499820@s.whatsapp.net', fromMe: true },
      message: { conversation: '.movie titanic' }
    };

    await movieCmd.execute({
      sock: mockSock,
      msg: mockMsg,
      from: '923056499820@s.whatsapp.net',
      sender: '923056499820@s.whatsapp.net',
      args: ['titanic']
    });

    assert.ok(sentPayload !== null, 'Should send response for movie search');
    const responseText = sentPayload.caption || sentPayload.text || '';
    assert.ok(responseText.toUpperCase().includes('TITANIC'), 'Response should mention Titanic');
    assert.ok(responseText.includes('vidsrc.to'), 'Response should contain verified vidsrc streaming link');
    assert.ok(responseText.includes('Hindi Dubbed'), 'Response should mention Dual Audio / Hindi Dubbed');
    assert.ok(responseText.includes('vegamovies.im'), 'Response should mention Hindi Dubbed streaming portal');
    assert.ok(responseText.includes('PLAY DIRECTLY IN WHATSAPP'), 'Response should include direct in-WhatsApp player');
  });

  // Test 12: Anime Search and Episode extraction
  it('Searches anime on AniKoto and generates Episode streaming player links with Sub/Dub', async () => {
    const animeCmd = commandHandler.getCommand('anime');
    assert.ok(animeCmd, 'Missing anime command');

    let sentPayload = null;
    const mockSock = {
      sendMessage: async (jid, content) => {
        sentPayload = content;
        return { key: { id: 'RESP_ANIME' } };
      }
    };

    const mockMsg = {
      key: { remoteJid: '923056499820@s.whatsapp.net', fromMe: true },
      message: { conversation: '.anime solo leveling 2' }
    };

    await animeCmd.execute({
      sock: mockSock,
      msg: mockMsg,
      from: '923056499820@s.whatsapp.net',
      sender: '923056499820@s.whatsapp.net',
      args: ['solo', 'leveling', '2']
    });

    assert.ok(sentPayload !== null, 'Should send response for anime search');
    const responseText = sentPayload.caption || sentPayload.text || '';
    assert.ok(responseText.toUpperCase().includes('SOLO LEVELING'), 'Response should mention Solo Leveling');
    assert.ok(responseText.includes('EPISODE 2'), 'Response should indicate selected Episode 2');
    assert.ok(responseText.includes('anikoto.cz/watch/'), 'Response should contain AniKoto watch URL');
  });

  // Test 13: Series Search and Season/Episode parsing (Hollywood / Bollywood / K-Drama)
  it('Searches TV series and generates Season/Episode streaming links with Dual Audio', async () => {
    const seriesCmd = commandHandler.getCommand('series');
    assert.ok(seriesCmd, 'Missing series command');

    let sentPayload = null;
    const mockSock = {
      sendMessage: async (jid, content) => {
        sentPayload = content;
        return { key: { id: 'RESP_SERIES' } };
      }
    };

    const mockMsg = {
      key: { remoteJid: '923056499820@s.whatsapp.net', fromMe: true },
      message: { conversation: '.series squid game 2 1' }
    };

    await seriesCmd.execute({
      sock: mockSock,
      msg: mockMsg,
      from: '923056499820@s.whatsapp.net',
      sender: '923056499820@s.whatsapp.net',
      args: ['squid', 'game', '2', '1']
    });

    assert.ok(sentPayload !== null, 'Should send response for series search');
    const responseText = sentPayload.text || sentPayload.caption || '';
    assert.ok(responseText.toUpperCase().includes('SQUID GAME'), 'Response should mention Squid Game');
    assert.ok(responseText.includes('Season 2, Episode 1'), 'Response should show Season 2, Episode 1');
    assert.ok(responseText.includes('vidsrc.to/embed/tv/'), 'Response should contain vidsrc TV streaming link');
    assert.ok(responseText.includes('Hindi Dubbed'), 'Response should mention Dual Audio / Hindi Dubbed');
    assert.ok(responseText.includes('vegamovies.im'), 'Response should link to Hindi Dubbed series portal');
  });

  // Test 14: Group Admin Mute and Unmute commands
  it('Enforces group admin permissions and updates group settings for .mute and .unmute', async () => {
    const muteCmd = commandHandler.getCommand('mute');
    const unmuteCmd = commandHandler.getCommand('unmute');
    assert.ok(muteCmd && unmuteCmd, 'Missing mute or unmute command');

    let settingUpdated = null;
    let sentPayload = null;

    const mockSock = {
      user: { id: '923999999999:1@s.whatsapp.net' }, // Bot account
      groupMetadata: async (gid) => ({
        id: gid,
        participants: [
          { id: '923999999999@s.whatsapp.net', admin: 'admin' }, // Bot is admin
          { id: '923001112233@s.whatsapp.net', admin: 'admin' }, // Group Admin
          { id: '923004445566@s.whatsapp.net', admin: null },    // Regular member
        ]
      }),
      groupSettingUpdate: async (gid, setting) => {
        settingUpdated = setting;
      },
      sendMessage: async (jid, content) => {
        sentPayload = content;
        return { key: { id: 'RESP_GRP' } };
      }
    };

    // 1. Regular member tries to mute -> denied
    sentPayload = null;
    await muteCmd.execute({
      sock: mockSock,
      msg: { key: {} },
      from: '120363999@g.us',
      sender: '923004445566@s.whatsapp.net',
      isGroup: true,
      isOwner: false
    });
    assert.ok(sentPayload?.text?.includes('Permission Denied'), 'Non-admin member must be denied');

    // 2. Group Admin mutes -> succeeds
    sentPayload = null;
    settingUpdated = null;
    await muteCmd.execute({
      sock: mockSock,
      msg: { key: {} },
      from: '120363999@g.us',
      sender: '923001112233@s.whatsapp.net',
      isGroup: true,
      isOwner: false
    });
    assert.strictEqual(settingUpdated, 'announcement', 'Mute must set group to announcement mode');
    assert.ok(sentPayload?.text?.includes('GROUP MUTED'), 'Confirmation must be sent');

    // 3. Bot Owner unmutes -> succeeds
    sentPayload = null;
    settingUpdated = null;
    await unmuteCmd.execute({
      sock: mockSock,
      msg: { key: {} },
      from: '120363999@g.us',
      sender: '923056499820@s.whatsapp.net',
      isGroup: true,
      isOwner: true
    });
    assert.strictEqual(settingUpdated, 'not_announcement', 'Unmute must set group to not_announcement mode');
    assert.ok(sentPayload?.text?.includes('GROUP UNMUTED'), 'Confirmation must be sent');
  });

  console.log(`\n=========================================`);
  console.log(`Test Results: ${passedTests} / ${totalTests} passed`);
  console.log(`=========================================\n`);

  if (passedTests === totalTests) {
    console.log('🎉 ALL INTEGRATION TESTS PASSED SUCCESSFULLY!\n');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAsyncTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
