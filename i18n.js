const fs = require('fs');
const path = require('path');

const loadedLanguages = new Map();
const DEFAULT_LANG = 'en';

module.exports = {
    get: function(langCode) {
        let sanitizedCode = String(langCode || DEFAULT_LANG)
            .toLowerCase()
            .trim()
            .split('-')[0]
            .split('_')[0];

        if (loadedLanguages.has(sanitizedCode)) {
            return loadedLanguages.get(sanitizedCode);
        }

        const filePath = path.join(__dirname, 'locales', `${sanitizedCode}.json`);

        try {
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf8');
                const translations = JSON.parse(fileContent);
                loadedLanguages.set(sanitizedCode, translations);
                return translations;
            }
        } catch (error) {
            console.error(`Error loading locale [${sanitizedCode}]:`, error.message);
        }

        if (!loadedLanguages.has(DEFAULT_LANG)) {
            try {
                const defaultPath = path.join(__dirname, 'locales', `${DEFAULT_LANG}.json`);
                const defaultContent = fs.readFileSync(defaultPath, 'utf8');
                loadedLanguages.set(DEFAULT_LANG, JSON.parse(defaultContent));
            } catch (error) {
                console.error(`Fatal error loading default locale [${DEFAULT_LANG}]:`, error.message);
                return {};
            }
        }

        return loadedLanguages.get(DEFAULT_LANG);
    }
};
