/**
 * fetch-titles.js
 * Auto-fetch game titles from Steam Store API and inject them into Account.json
 * Usage: node scripts/fetch-titles.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const ACCOUNT_JSON_PATH = path.join(__dirname, '../src/data/Account.json');
const DELAY_MS = 600; // delay between requests to avoid Steam rate-limit

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function fetchSteamTitle(appid) {
  return new Promise((resolve) => {
    const url = `https://store.steampowered.com/api/appdetails?appids=${appid}&filters=basic`;
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json[appid] && json[appid].success && json[appid].data && json[appid].data.name) {
            resolve(json[appid].data.name);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

async function main() {
  console.log('📖 Reading Account.json...');
  const raw = fs.readFileSync(ACCOUNT_JSON_PATH, 'utf8');
  const accounts = JSON.parse(raw);

  // Get unique AppIDs
  const uniqueAppIDs = [...new Set(accounts.map(a => a.AppID))];
  console.log(`🎮 Found ${uniqueAppIDs.length} unique AppIDs\n`);

  // Build a map: appid -> title
  const titleMap = {};
  for (let i = 0; i < uniqueAppIDs.length; i++) {
    const appid = uniqueAppIDs[i];
    process.stdout.write(`[${i + 1}/${uniqueAppIDs.length}] Fetching AppID ${appid}... `);
    const title = await fetchSteamTitle(appid);
    if (title) {
      titleMap[appid] = title;
      console.log(`✅ "${title}"`);
    } else {
      titleMap[appid] = null;
      console.log(`⚠️  Not found (keeping existing or skipping)`);
    }
    if (i < uniqueAppIDs.length - 1) await sleep(DELAY_MS);
  }

  // Inject titles into accounts
  // Merge duplicate AppIDs first
  const merged = new Map();
  for (const entry of accounts) {
    const appid = entry.AppID;
    if (!merged.has(appid)) {
      merged.set(appid, { ...entry });
    } else {
      // Merge accounts from duplicate entries
      const existing = merged.get(appid);
      const existingAccKeys = Object.keys(existing).filter(k => k.toLowerCase().startsWith('account'));
      let nextIdx = existingAccKeys.length + 1;
      Object.keys(entry).forEach(key => {
        if (key.toLowerCase().startsWith('account')) {
          const acc = entry[key];
          const isDuplicate = existingAccKeys.some(k => existing[k].username === acc.username);
          if (!isDuplicate) {
            const newKey = nextIdx === 1 ? 'Account' : `Account${nextIdx}`;
            existing[newKey] = acc;
            nextIdx++;
          }
        }
      });
    }
  }

  // Build final array with Title field
  const updated = Array.from(merged.values()).map(entry => {
    const appid = entry.AppID;
    const fetchedTitle = titleMap[appid];
    // Only set title if we got one from Steam, otherwise keep existing
    const finalTitle = fetchedTitle || entry.Title || undefined;
    if (finalTitle) {
      // Put Title right after AppID for readability
      const { AppID, Title: _old, ...rest } = entry;
      return { AppID, Title: finalTitle, ...rest };
    }
    return entry;
  });

  const output = JSON.stringify(updated, null, 4);
  fs.writeFileSync(ACCOUNT_JSON_PATH, output, 'utf8');

  const withTitle = updated.filter(e => e.Title).length;
  console.log(`\n✅ Done! ${withTitle}/${updated.length} entries have titles.`);
  console.log(`📄 Saved to ${ACCOUNT_JSON_PATH}`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
