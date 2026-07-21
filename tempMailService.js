const axios = require('axios');
const { Markup } = require('telegraf');
const i18n = require('./i18n');

const MAIL_TM_API = 'https://api.mail.tm';

// 🔗 Monetag Direct Link Configuration
// Put your Monetag direct link inside quotes below, or set it as an Environment Variable in Koyeb
// If left empty (''), the system will completely ignore ads and generate emails instantly!
const MONETAG_DIRECT_LINK = process.env.MONETAG_DIRECT_LINK || ''; 

// Cooldown duration: 10 minutes in milliseconds
const COOLDOWN_DURATION_MS = 10 * 60 * 1000; 

// In-Memory Storage
const userMailSessions = new Map(); // Store email credentials
const userLinkCooldowns = new Map(); // Store user ad cooldown timestamps

// ----------------------------------------------------
// 🧹 Automatic Memory Cleanup Mechanism
// ----------------------------------------------------
// Runs every 6 hours automatically to remove expired data and keep RAM usage near 0%
setInterval(() => {
    const now = Date.now();
    const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

    // 1. Purge mail sessions older than 24 hours
    for (const [chatId, session] of userMailSessions.entries()) {
        if (session.createdAt && (now - session.createdAt.getTime() > TWENTY_FOUR_HOURS_MS)) {
            userMailSessions.delete(chatId);
        }
    }

    // 2. Purge cooldown timestamps older than 10 minutes
    for (const [chatId, lastClickTime] of userLinkCooldowns.entries()) {
        if (now - lastClickTime > COOLDOWN_DURATION_MS) {
            userLinkCooldowns.delete(chatId);
        }
    }

    console.log(`[Memory Cleanup] Active Mail Sessions: ${userMailSessions.size} | Active Cooldowns: ${userLinkCooldowns.size}`);
}, 6 * 60 * 60 * 1000);

// Helper function to generate random string
function getRandomString(length = 8) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Generate new Mail.tm account
async function createNewMailAccount(chatId) {
    try {
        const domainResponse = await axios.get(`${MAIL_TM_API}/domains`);
        const domainList = domainResponse.data['hydra:member'];
        
        if (!domainList || domainList.length === 0) {
            throw new Error("No active domains available");
        }

        const selectedDomain = domainList[0].domain;
        const username = `user_${getRandomString(6)}`;
        const password = `Pass_${getRandomString(8)}!`;
        const emailAddress = `${username}@${selectedDomain}`;

        await axios.post(`${MAIL_TM_API}/accounts`, {
            address: emailAddress,
            password: password
        });

        const tokenResponse = await axios.post(`${MAIL_TM_API}/token`, {
            address: emailAddress,
            password: password
        });

        const sessionData = {
            address: emailAddress,
            password: password,
            token: tokenResponse.data.token,
            createdAt: new Date()
        };

        userMailSessions.set(chatId, sessionData);
        return sessionData;
    } catch (error) {
        console.error("Error creating Mail.tm account:", error.response?.data || error.message);
        throw error;
    }
}

// Check inbox messages
async function fetchInboxMessages(token) {
    try {
        const response = await axios.get(`${MAIL_TM_API}/messages`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return response.data['hydra:member'] || [];
    } catch (error) {
        console.error("Error fetching inbox:", error.response?.data || error.message);
        return [];
    }
}

// Main Interface Launcher
async function startTempMailService(ctx) {
    const userLang = ctx.from.language_code || 'en';
    const t = i18n.get(userLang);
    const chatId = ctx.chat.id;

    let session = userMailSessions.get(chatId);

    if (!session) {
        await ctx.telegram.sendChatAction(chatId, 'typing');
        try {
            session = await createNewMailAccount(chatId);
        } catch (err) {
            return ctx.reply(t.tempMailError || "❌ Failed to generate email.");
        }
    }

    const messageText = `${t.tempMailWelcome}\n\n` +
                        `📧 **${t.currentEmailLabel}:**\n\`${session.address}\`\n\n` +
                        `💡 ${t.tempMailInstruction}`;

    return ctx.reply(messageText, {
        parse_mode: 'Markdown',
        ...Markup.keyboard([
            [t.refreshInboxBtn, t.genNewMailBtn],
            [t.backBtn || "🔙 Back"]
        ]).resize()
    });
}

// Handler for Interactive Actions & Ad Logic
async function handleTempMailMessage(ctx) {
    const userLang = ctx.from.language_code || 'en';
    const t = i18n.get(userLang);
    const chatId = ctx.chat.id;
    const text = ctx.message.text;

    // Option 1: Generate New Email (with Dynamic Ad & Cooldown Logic)
    if (text === t.genNewMailBtn) {
        const now = Date.now();
        const lastClick = userLinkCooldowns.get(chatId) || 0;
        const isCooldownActive = (now - lastClick) < COOLDOWN_DURATION_MS;

        // Check if monetization link exists and user is NOT on 10-min cooldown
        if (MONETAG_DIRECT_LINK.trim() !== '' && !isCooldownActive) {
            // Apply 10-minute cooldown timestamp
            userLinkCooldowns.set(chatId, now);

            const adMessage = `🎁 **${t.adUnlockTitle || "Unlock New Email"}**\n\n` +
                                `${t.adUnlockDesc || "Click the sponsor link below to instantly generate your new disposable email:"}`;

            return ctx.reply(adMessage, {
                parse_mode: 'Markdown',
                ...Markup.inlineKeyboard([
                    [Markup.button.url(t.adBtnLabel || "🚀 Click to Generate Email", MONETAG_DIRECT_LINK)]
                ])
            });
        }

        // If link is empty OR user is within the 10-minute cooldown, generate directly!
        await ctx.telegram.sendChatAction(chatId, 'typing');
        try {
            const newSession = await createNewMailAccount(chatId);
            const messageText = `✨ **${t.newMailCreated}:**\n\n` +
                                `📧 \`${newSession.address}\`\n\n` +
                                `💡 ${t.tempMailInstruction}`;

            return ctx.reply(messageText, { parse_mode: 'Markdown' });
        } catch (err) {
            return ctx.reply(t.tempMailError || "❌ Failed to generate new email.");
        }
    }

    // Option 2: Check / Refresh Inbox
    if (text === t.refreshInboxBtn) {
        const session = userMailSessions.get(chatId);

        if (!session) {
            return ctx.reply(t.noActiveMail, { parse_mode: 'Markdown' });
        }

        await ctx.telegram.sendChatAction(chatId, 'typing');
        const messages = await fetchInboxMessages(session.token);

        if (messages.length === 0) {
            return ctx.reply(`📭 ${t.inboxEmpty}\n\n📧 \`${session.address}\``, { parse_mode: 'Markdown' });
        }

        let inboxContent = `📬 **${t.inboxHeader} (${messages.length}):**\n\n`;

        messages.slice(0, 5).forEach((msg, index) => {
            inboxContent += `━━━━━━━━━━━━━━━━━━━\n` +
                            `📩 **#${index + 1} ${t.fromLabel}:** ${msg.from.address}\n` +
                            `📌 **${t.subjectLabel}:** ${msg.subject || t.noSubject}\n` +
                            `📝 **${t.previewLabel}:** ${msg.intro || ''}\n`;
        });

        return ctx.reply(inboxContent, { parse_mode: 'Markdown' });
    }
}

module.exports = {
    startTempMailService,
    handleTempMailMessage
};
