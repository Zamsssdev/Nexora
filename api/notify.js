// Serverless endpoint to send Discord notifications using a Bot token stored in environment
// Expects POST JSON: { gameTitle, appid, action, details, channelId? }

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const { gameTitle, appid, action = 'Updated', details = '', channelId } = req.body || {};
    if (!gameTitle) return res.status(400).json({ error: 'gameTitle is required' });

    const botToken = process.env.BOT_TOKEN;
    const targetChannel = channelId || process.env.DISCORD_NOTIFY_CHANNEL_ID;
    if (!botToken || !targetChannel) {
      return res.status(500).json({ error: 'Bot token or channel id not configured in environment' });
    }

    const embed = {
      title: `Nexora — Game ${action}`,
      description: `**${gameTitle}** (${appid}) telah *${action}* di Nexora.`,
      color: 0xff0055,
      thumbnail: { url: 'https://raw.githubusercontent.com/Zamsssdev/Nexora/main/public/iconapps.png' },
      fields: [
        { name: 'Game', value: gameTitle, inline: true },
        { name: 'AppID', value: String(appid || 'N/A'), inline: true },
        { name: 'Action', value: action, inline: true }
      ],
      footer: { text: 'Nexora', icon_url: 'https://raw.githubusercontent.com/Zamsssdev/Nexora/main/public/iconapps.png' }
    };

    if (details) embed.fields.push({ name: 'Details', value: details, inline: false });

    const payload = {
      content: `Open Nexora: toolsteam://`,
      embeds: [embed]
    };

    const resp = await fetch(`https://discord.com/api/v10/channels/${targetChannel}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const text = await resp.text();
      return res.status(resp.status).json({ error: `Discord API error: ${text}` });
    }

    const body = await resp.json();
    return res.status(200).json({ ok: true, sent: body });
  } catch (err) {
    console.error('[/api/notify] error:', err);
    return res.status(500).json({ error: err.message });
  }
};
