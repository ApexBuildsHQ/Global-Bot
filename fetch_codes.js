const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const OUTPUT_FILE = path.join(__dirname, 'game_codes.json');

const requestHeaders = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.google.com/'
};

async function scrapePubg() {
    const codes = new Set();
    try {
        const response = await axios.get('https://www.gamingonphone.com/guides/pubg-mobile-free-redeem-codes/', { 
            headers: requestHeaders,
            timeout: 12000 
        });
        const $ = cheerio.load(response.data);
        $('code, strong, td').each((i, el) => {
            const text = $(el).text().trim();
            if (/^[A-Z0-9]{10,18}$/.test(text) && !text.includes(' ') && isNaN(text)) {
                codes.add(text);
            }
        });
    } catch (e) {
        console.error("PUBG scraping error:", e.message);
    }
    return Array.from(codes);
}

async function scrapeFreeFire() {
    const codes = new Set();
    try {
        const response = await axios.get('https://www.sportskeeda.com/esports/free-fire-redeem-codes', { 
            headers: requestHeaders,
            timeout: 12000 
        });
        const $ = cheerio.load(response.data);
        $('code, p, li').each((i, el) => {
            const text = $(el).text().replace(/[^A-Za-z0-9]/g, '').trim();
            if (/^[A-Z0-9]{12}$/.test(text) && isNaN(text)) {
                codes.add(text);
            }
        });
    } catch (e) {
        console.error("Free Fire scraping error:", e.message);
    }
    return Array.from(codes);
}

async function scrapeRoblox() {
    const codes = new Set();
    try {
        const response = await axios.get('https://www.pocketgamer.com/roblox/promo-codes/', { 
            headers: requestHeaders,
            timeout: 12000 
        });
        const $ = cheerio.load(response.data);
        $('strong, td, code').each((i, el) => {
            const text = $(el).text().trim();
            if (/^[A-Za-z0-9_]{5,20}$/.test(text) && !text.includes(' ') && text.toUpperCase() === text && isNaN(text)) {
                codes.add(text);
            }
        });
    } catch (e) {
        console.error("Roblox scraping error:", e.message);
    }
    return Array.from(codes);
}

async function startScraping() {
    console.log("Starting code collection process...");
    
    const [pubgCodes, ffCodes, robloxCodes] = await Promise.all([
        scrapePubg(),
        scrapeFreeFire(),
        scrapeRoblox()
    ]);

    const structuredData = {
        pubg: pubgCodes,
        freefire: ffCodes,
        roblox: robloxCodes,
        last_updated: new Date().toISOString()
    };

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(structuredData, null, 2), 'utf8');
    console.log("Database successfully updated and written to game_codes.json");
}

startScraping();
