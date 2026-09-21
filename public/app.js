/**
 * Mini WhatsApp Bot Web Pairing Client
 */

// Global quick country prefix helper
function setPrefix(code) {
  const input = document.getElementById('phoneInput');
  if (!input) return;
  input.value = code;
  input.focus();
}

document.addEventListener('DOMContentLoaded', () => {
  const pairForm = document.getElementById('pairForm');
  const phoneInput = document.getElementById('phoneInput');
  const getPairBtn = document.getElementById('getPairBtn');
  const btnSpinner = document.getElementById('btnSpinner');
  const btnText = document.getElementById('btnText');
  const inlineError = document.getElementById('inlineError');

  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const botTitle = document.getElementById('botTitle');

  const codeDisplayArea = document.getElementById('codeDisplayArea');
  const pairingCodeVal = document.getElementById('pairingCodeVal');
  const copyCodeBtn = document.getElementById('copyCodeBtn');
  const copyNotice = document.getElementById('copyNotice');

  const connectedArea = document.getElementById('connectedArea');
  const connectedNumber = document.getElementById('connectedNumber');

  let pollTimer = null;

  function showError(msg) {
    inlineError.textContent = msg;
    inlineError.classList.remove('hidden');
  }

  function hideError() {
    inlineError.textContent = '';
    inlineError.classList.add('hidden');
  }

  // 1. Poll Bot & Connection Status
  async function checkStatus() {
    try {
      const res = await fetch('/api/status');
      const data = await res.json();

      if (data.botName) {
        botTitle.textContent = `${data.botName.toUpperCase()}`;
      }

      if (data.status === 'connected') {
        statusBadge.className = 'status-pill connected';
        statusText.textContent = 'Connected';

        // Show connected banner
        const phone = data.user?.id || 'Active Device';
        connectedNumber.textContent = `+${phone}`;
        connectedArea.classList.remove('hidden');
        codeDisplayArea.classList.add('hidden');
        pairForm.classList.add('hidden');
      } else if (data.status === 'connecting' || data.status === 'waiting_pair') {
        statusBadge.className = 'status-pill connecting';
        statusText.textContent = 'Connecting...';
      } else {
        statusBadge.className = 'status-pill disconnected';
        statusText.textContent = 'Disconnected';
      }

      if (data.pairingCode && data.status === 'waiting_pair') {
        pairingCodeVal.textContent = data.pairingCode;
        codeDisplayArea.classList.remove('hidden');
      }
    } catch (e) {
      // Ignore network blips
    }
  }

  checkStatus();
  pollTimer = setInterval(checkStatus, 3500);

  // 2. Request Pairing Code
  pairForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideError();

    const clean = phoneInput.value.replace(/[^0-9]/g, '');
    if (!clean || clean.length < 9) {
      showError('Please enter a valid phone number with country code (e.g. 923116469820)');
      return;
    }

    // Set loading state
    getPairBtn.disabled = true;
    btnSpinner.classList.remove('hidden');
    btnText.textContent = 'Generating...';

    try {
      const res = await fetch('/api/pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: clean })
      });

      const data = await res.json();

      if (data.success && data.pairingCode) {
        pairingCodeVal.textContent = data.pairingCode;
        codeDisplayArea.classList.remove('hidden');
        codeDisplayArea.scrollIntoView({ behavior: 'smooth' });
      } else {
        showError(data.message || 'Failed to generate code. Please verify your phone number.');
      }
    } catch (err) {
      showError(`Connection error: ${err.message}`);
    } finally {
      getPairBtn.disabled = false;
      btnSpinner.classList.add('hidden');
      btnText.textContent = 'Get Code';
    }
  });

  // 3. Copy Code to Clipboard
  copyCodeBtn.addEventListener('click', async () => {
    const code = pairingCodeVal.textContent.trim();
    if (!code || code === '---- - ----') return;

    try {
      await navigator.clipboard.writeText(code);
      copyNotice.classList.remove('hidden');
      copyCodeBtn.textContent = '✓ Copied!';
      setTimeout(() => {
        copyNotice.classList.add('hidden');
        copyCodeBtn.textContent = '📋 Copy Code';
      }, 2500);
    } catch (err) {
      prompt('Copy your code:', code);
    }
  });
});
