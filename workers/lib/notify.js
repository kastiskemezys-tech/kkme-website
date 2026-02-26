// KKME — Telegram alerting helper.
// Never throws — alert failure must never break the signal pipeline.

/**
 * @param {object} env - Cloudflare Worker env bindings
 * @param {string} message
 */
export async function notifyTelegram(env, message) {
  try {
    const token = env.TELEGRAM_BOT_TOKEN;
    const chat  = env.TELEGRAM_CHAT_ID;
    if (!token || !chat) return;

    await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          chat_id:    chat,
          text:       `KKME Alert\n${message}`,
          parse_mode: 'HTML',
        }),
      },
    );
  } catch (e) {
    console.error('[Telegram] notify failed:', e);
  }
}
