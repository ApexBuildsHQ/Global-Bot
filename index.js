const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const axios = require('axios');
const i18n = require('./i18n');

// Configurations
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const SPONSOR_CHANNEL = '@YourSponsorChannel'; 
const GITHUB_CODES_URL = 'https://raw.githubusercontent.com/<YOUR_GITHUB_USERNAME>/<YOUR_REPO_NAME>/main/game_codes.json';

// Monetization CPA Settings
const CPA_SMARTLINK_BASE = 'https://offers.cpagrip.com/show.php?l=0&u=YOUR_ACCOUNT_ID&id=YOUR_LOCKER_ID'; 

const app = express();
const bot = new Telegraf(BOT_TOKEN);
app.use(express.json());

// Helper function to verify channel subscription
async function checkSubscription(ctx, userId) {
    try {
        const member = await ctx.telegram.getChatMember(SPONSOR_CHANNEL, userId);
        return ['creator', 'administrator', 'member'].includes(member.status);
    } catch (error) {
        console.error("Subscription check failed:", error.message);
        return false;
    }
}

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

// Main logic to display free codes to the user
async function sendWelcomeAndFreeCodes(ctx) {
    const userLang = ctx.from.language_code || 'en';
    const t = i18n.get(userLang);
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');

    const db = await fetchDatabase();
    
    // Extract exactly first 2 codes per game or display "no codes" message
    const pubgList = db.pubg && db.pubg.length > 0 ? db.pubg.slice(0, 2).join('\n🔑 ') : t.noCodes;
    const ffList = db.freefire && db.freefire.length > 0 ? db.freefire.slice(0, 2).join('\n🔑 ') : t.noCodes;
    const robloxList = db.roblox && db.roblox.length > 0 ? db.roblox.slice(0, 2).join('\n🔑 ') : t.noCodes;

    const message = `${t.welcome}\n\n` +
                    `${t.freeCodesHeader}` +
                    `${t.pubgLabel}${pubgList}\n\n` +
                    `${t.ffLabel}${ffList}\n\n` +
                    `${t.robloxLabel}${robloxList}` +
                    `${t.vipUnlockInstruction}`;

    // Pass both Chat ID and Language Code in the tracking subid parameter
    const trackingCpaLink = `${CPA_SMARTLINK_BASE}&subid=${ctx.chat.id}_${userLang}`;

    return ctx.reply(message, Markup.inlineKeyboard([
        [Markup.button.url(t.vipBtn, trackingCpaLink)]
    ]));
}

// Bot Command Handlers
bot.start(async (ctx) => {
    const t = i18n.get(ctx.from.language_code);
    const isSubscribed = await checkSubscription(ctx, ctx.from.id);

    if (!isSubscribed) {
        return ctx.reply(t.forceJoin, Markup.inlineKeyboard([
            [Markup.button.callback(t.checkBtn, 'verify_sub')]
        ]));
    }

    return sendWelcomeAndFreeCodes(ctx);
});

bot.action('verify_sub', async (ctx) => {
    const t = i18n.get(ctx.from.language_code);
    const isSubscribed = await checkSubscription(ctx, ctx.from.id);

    if (!isSubscribed) {
        return ctx.answerCbQuery(t.forceJoin.split('\n')[0], { show_alert: true });
    }

    await ctx.answerCbQuery();
    await ctx.deleteMessage().catch(() => {});
    return sendWelcomeAndFreeCodes(ctx);
});

// Express HTTP Webhook Server (Handles CPA Postback Signal with language recovery)
app.get('/cpa-postback', async (req, res) => {
    const rawSubid = req.query.user_id; // CPA sends back our tracking value (e.g. "12345678_ar")

    if (!rawSubid) {
        return res.status(400).send("Missing user_id parameter.");
    }

    try {
        // Separate the Chat ID and the Language code
        const parts = String(rawSubid).split('_');
        const userId = parts[0];
        const userLang = parts[1] || 'en';

        const db = await fetchDatabase();
        const t = i18n.get(userLang);

        // Get rest of the VIP codes (starting from index 2 to end)
        const pubgVip = db.pubg && db.pubg.length > 2 ? db.pubg.slice(2).join('\n🔑 ') : t.noVipCodes;
        const ffVip = db.freefire && db.freefire.length > 2 ? db.freefire.slice(2).join('\n🔑 ') : t.noVipCodes;
        const robloxVip = db.roblox && db.roblox.length > 2 ? db.roblox.slice(2).join('\n🔑 ') : t.noVipCodes;

        const vipMessage = `${t.vipSuccess}` +
                           `${t.pubgLabel}${pubgVip}\n\n` +
                           `${t.ffLabel}${ffVip}\n\n` +
                           `${t.robloxLabel}${robloxVip}`;

        // Send VIP codes directly to the verified user in their native language
        await bot.telegram.sendMessage(userId, vipMessage);
        
        return res.status(200).send("Success: VIP codes delivered.");
    } catch (error) {
        console.error("Postback processing error:", error.message);
        return res.status(500).send("Internal Server Error processing postback.");
    }
});

// Start Express Server & Launch Bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Express webhook server is listening on port ${PORT}`);
    bot.launch();
    console.log("Telegraf Bot started polling successfully.");
});

// Enable graceful stop
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    process.exit(0);
});
process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    process.exit(0);
});
