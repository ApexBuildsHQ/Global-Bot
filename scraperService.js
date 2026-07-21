const axios = require('axios');
const cheerio = require('cheerio');
const { Markup } = require('telegraf');
const i18n = require('./i18n');

// 🔗 Monetag Direct Link Configuration
// Put your Monetag direct link inside quotes below, or set it as an Environment Variable in Koyeb
const MONETAG_DIRECT_LINK = process.env.MONETAG_DIRECT_LINK || ''; 

// Cooldown duration: 10 minutes in milliseconds
const COOLDOWN_DURATION_MS = 10 * 60 * 1000; 

// In-Memory Storage for Ad Cooldowns
const userScraperCooldowns = new Map();

// Helper: Check if string is a valid HTTP/HTTPS URL
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) {
        return false;
    }
}

// Lightweight Scraper Core Function
async function scrapeUrlContent(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9,ar;q=0.8'
            },
            timeout: 10000
        });

        const $ = cheerio.load(response.data);

        // Remove junk elements to clean the text output
        $('script, style, nav, footer, header, iframe, ins, .ads, .advertisement, #comments').remove();

        // Extract Title
        const title = $('h1').first().text().trim() || $('title').text().trim() || 'Untitled Article';

        // Extract Headings & Paragraphs
        let articleText = [];
        $('h1, h2, h3, p').each((_, el) => {
            const text = $(el).text().trim();
            if (text.length > 25) { // Filter out short button texts or menu links
                if (el.tagName.startsWith('h')) {
                    articleText.push(`\n📌 **${text}**\n`);
                } else {
                    articleText.push(text);
                }
            }
        });

        const fullContent = articleText.join('\n\n');
        const wordCount = fullContent.split(/\s+/).length;
        const readingTime = Math.ceil(wordCount / 200); // Average 200 words/min

        return {
            title,
            content: fullContent,
            wordCount,
            readingTime
        };
    } catch (error) {
        console.error("Scraping error:", error.message);
        throw new Error("Unable to fetch page content. Please ensure the link is public.");
    }
}

// Scraper Interactive Handler
async function handleScraperRequest(ctx, targetUrl) {
    const userLang = ctx.from.language_code || 'en';
    const t = i18n.get(userLang);
    const chatId = ctx.chat.id;

    if (!isValidUrl(targetUrl)) {
        return ctx.reply(t.invalidUrlError || "❌ Please send a valid web link (e.g., https://example.com/article)");
    }

    const now = Date.now();
    const lastClick = userScraperCooldowns.get(chatId) || 0;
    const isCooldownActive = (now - lastClick) < COOLDOWN_DURATION_MS;

    // Check if Monetag link exists and user is NOT on 10-min cooldown
    if (MONETAG_DIRECT_LINK.trim() !== '' && !isCooldownActive) {
        userScraperCooldowns.set(chatId, now);

        const adMessage = `🔒 **${t.adScraperTitle || "Unlock Article Extraction"}**\n\n` +
                          `${t.adScraperDesc || "Click the sponsor link below to confirm and extract the text from your link:"}`;

        return ctx.reply(adMessage, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.url(t.adScraperBtn || "🚀 Click to Extract Article", MONETAG_DIRECT_LINK)]
            ])
        });
    }

    // Process Scraping Immediately
    await ctx.telegram.sendChatAction(chatId, 'typing');
    try {
        const result = await scrapeUrlContent(targetUrl);

        if (!result.content || result.content.trim().length === 0) {
            return ctx.reply(t.noTextFound || "⚠️ No readable text could be extracted from this page.");
        }

        const headerMessage = `📄 **${result.title}**\n\n` +
                              `📊 **${t.wordCountLabel || "Word Count"}:** ${result.wordCount} | ⏱️ **${t.readingTimeLabel || "Reading Time"}:** ~${result.readingTime} min\n` +
                              `━━━━━━━━━━━━━━━━━━━\n\n`;

        const totalMessage = headerMessage + result.content;

        // Telegram message size limit is 4096 characters
        if (totalMessage.length <= 4000) {
            return ctx.reply(totalMessage, { parse_mode: 'Markdown' });
        } else {
            // Send as a clean .txt Document if content is too long!
            const fileBuffer = Buffer.from(result.content, 'utf-8');
            await ctx.reply(headerMessage, { parse_mode: 'Markdown' });
            return ctx.replyWithDocument({
                source: fileBuffer,
                filename: `${result.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.txt`
            });
        }
    } catch (err) {
        return ctx.reply(`❌ ${err.message}`);
    }
}

module.exports = {
    handleScraperRequest
};
