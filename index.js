const { Telegraf, Markup } = require('telegraf');
const express = require('express');
const i18n = require('./i18n');

// Import Clean Modular Services
const { sendWelcomeAndFreeCodes, handleCpaPostback } = require('./gameCodesService');
const { startTempMailService, handleTempMailMessage } = require('./tempMailService');
const { handleScraperRequest } = require('./scraperService');

// App Configuration
const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN';
const SPONSOR_CHANNEL = '@YourSponsorChannel'; 

// ----------------------------------------------------
// 🔴 مفتاح التحكم في الاشتراك الإجباري (Feature Toggle)
// ----------------------------------------------------
// اجعله false حالياً لإلغاء طلب الاشتراك الإجباري عن المستخدمين.
// قم بتغييره إلى true مستقبلاً فور إيجاد راعي للقناة لتفعيل الفحص مجدداً.
const REQUIRE_SUBSCRIPTION = false; 

const app = express();
const bot = new Telegraf(BOT_TOKEN);
app.use(express.json());

// Global Subscription Checker Helper
async function checkSubscription(ctx, userId) {
    // التخطي الفوري في حال كان مفتاح التحكم معطلاً
    if (!REQUIRE_SUBSCRIPTION) return true;

    try {
        const member = await ctx.telegram.getChatMember(SPONSOR_CHANNEL, userId);
        return ['creator', 'administrator', 'member'].includes(member.status);
    } catch (error) {
        console.error("Subscription check failed:", error.message);
        return false;
    }
}

async function sendForceJoinNotice(ctx) {
    const t = i18n.get(ctx.from?.language_code);
    return ctx.reply(t.forceJoin, Markup.inlineKeyboard([
        [Markup.button.callback(t.checkBtn, 'verify_sub')]
    ]));
}

// ----------------------------------------------------
// Bot Command Routes & Middleware
// ----------------------------------------------------

bot.start(async (ctx) => {
    const isSubscribed = await checkSubscription(ctx, ctx.from.id);
    if (!isSubscribed) return sendForceJoinNotice(ctx);

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

// Command for Temporary Email Service
bot.command(['email', 'tempmail'], async (ctx) => {
    const isSubscribed = await checkSubscription(ctx, ctx.from.id);
    if (!isSubscribed) return sendForceJoinNotice(ctx);

    return startTempMailService(ctx);
});

// URL Listener for Scraper Service
bot.hears(/^https?:\/\/.+/i, async (ctx) => {
    const isSubscribed = await checkSubscription(ctx, ctx.from.id);
    if (!isSubscribed) return sendForceJoinNotice(ctx);

    return handleScraperRequest(ctx, ctx.message.text.trim());
});

// Custom Keyboard Buttons Handler
bot.on('text', async (ctx) => {
    const isSubscribed = await checkSubscription(ctx, ctx.from.id);
    if (!isSubscribed) return sendForceJoinNotice(ctx);

    const userLang = ctx.from.language_code || 'en';
    const t = i18n.get(userLang);
    const text = ctx.message.text;

    if (text === t.genNewMailBtn || text === t.refreshInboxBtn) {
        return handleTempMailMessage(ctx);
    }

    if (text === (t.backBtn || "🔙 Back")) {
        return ctx.reply("🏠 Returning to main menu...", Markup.removeKeyboard());
    }
});

// ----------------------------------------------------
// Express Webhook Routing
// ----------------------------------------------------
app.get('/cpa-postback', (req, res) => handleCpaPostback(req, res, bot));

// Start Express & Launch Bot
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    bot.launch();
    console.log("Telegraf Bot started successfully.");
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
