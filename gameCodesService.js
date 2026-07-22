const axios = require('axios');
const { Markup } = require('telegraf');
const i18n = require('./i18n');

const GITHUB_CODES_URL = 'https://raw.githubusercontent.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>/main/game_codes.json';
const CPA_SMARTLINK_BASE = 'https://offers.cpagrip.com/show.php?l=0&u=YOUR_ACCOUNT_ID&id=YOUR_LOCKER_ID';

// Fetch dynamic codes from GitHub JSON Raw File
async function fetchDatabase() {
    try {
        const response = await axios.get(GITHUB_CODES_URL, { timeout: 6000 });
        return response.data;
    } catch (error) {
        console.error("Failed fetching game_codes.json from GitHub:", error.message);
        return { pubg: [], freefire: [], roblox: [] };
    }
}

// Display free codes to user
async function sendWelcomeAndFreeCodes(ctx) {
    const userLang = ctx.from.language_code || 'en';
    const t = i18n.get(userLang);
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');

    const db = await fetchDatabase();
    
    const pubgList = db.pubg && db.pubg.length > 0 ? db.pubg.slice(0, 2).join('\n🔑 ') : t.noCodes;
    const ffList = db.freefire && db.freefire.length > 0 ? db.freefire.slice(0, 2).join('\n🔑 ') : t.noCodes;
    const robloxList = db.roblox && db.roblox.length > 0 ? db.roblox.slice(0, 2).join('\n🔑 ') : t.noCodes;

    const message = `${t.welcome}\n\n` +
                    `${t.freeCodesHeader}` +
                    `${t.pubgLabel}${pubgList}\n\n` +
                    `${t.ffLabel}${ffList}\n\n` +
                    `${t.robloxLabel}${robloxList}` +
                    `${t.vipUnlockInstruction}`;

    const trackingCpaLink = `${CPA_SMARTLINK_BASE}&subid=${ctx.chat.id}_${userLang}`;

    return ctx.reply(message, Markup.inlineKeyboard([
        [Markup.button.url(t.vipBtn, trackingCpaLink)]
    ]));
}

// Process CPA Postback Verification Signal
async function handleCpaPostback(req, res, bot) {
    const rawSubid = req.query.user_id;

    if (!rawSubid) {
        return res.status(400).send("Missing user_id parameter.");
    }

    try {
        const parts = String(rawSubid).split('_');
        const userId = parts[0];
        const userLang = parts[1] || 'en';

        const db = await fetchDatabase();
        const t = i18n.get(userLang);

        const pubgVip = db.pubg && db.pubg.length > 2 ? db.pubg.slice(2).join('\n🔑 ') : t.noVipCodes;
        const ffVip = db.freefire && db.freefire.length > 2 ? db.freefire.slice(2).join('\n🔑 ') : t.noVipCodes;
        const robloxVip = db.roblox && db.roblox.length > 2 ? db.roblox.slice(2).join('\n🔑 ') : t.noVipCodes;

        const vipMessage = `${t.vipSuccess}` +
                           `${t.pubgLabel}${pubgVip}\n\n` +
                           `${t.ffLabel}${ffVip}\n\n` +
                           `${t.robloxLabel}${robloxVip}`;

        await bot.telegram.sendMessage(userId, vipMessage);
        return res.status(200).send("Success: VIP codes delivered.");
    } catch (error) {
        console.error("Postback processing error:", error.message);
        return res.status(500).send("Internal Server Error processing postback.");
    }
}

module.exports = {
    sendWelcomeAndFreeCodes,
    handleCpaPostback
};
