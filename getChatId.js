// getChatId-MultiBots.js - All 4 Bots Version
import TelegramBot from 'node-telegram-bot-api';

// All your bot configurations
const BOT_CONFIGS = [{
        name: 'Movieshub',
        username: '@Mhubsbot',
        token: '7948443317:AAGbzpq__Bl3eNJd8J1xSf5XqcR1heITyhY'
    },
    {
        name: 'Moviemods',
        username: '@Moviemodsbot',
        token: '7682450259:AAHdtvmumVrOFWe4ytxqodh_1k-ooD9rHYk'
    },
    {
        name: 'Moveshub',
        username: '@Movhubsbot',
        token: '8371835477:AAFejQlDZhkS4muunXPRvi2mA-J8VGn8TxM'
    },
    {
        name: 'Movieshubbot',
        username: '@movhubs_bot',
        token: '7965399127:AAH_4SSjYKZshPMl1Cvouu9SS3naJpvi6m0'
    }
];

console.log('🤖 Starting all 4 bots for Chat ID detection...');
console.log('📱 Send a message to ANY of these bots to get your Chat ID:');

BOT_CONFIGS.forEach((config, index) => {
    console.log(`   ${index + 1}. ${config.name} (${config.username})`);
});

console.log('\n🔄 Waiting for messages...');

// Initialize all bots
const bots = BOT_CONFIGS.map(config => {
    try {
        const bot = new TelegramBot(config.token, { polling: true });

        bot.on('message', (msg) => {
            const chatId = msg.chat.id;
            const userName = msg.from.username || msg.from.first_name || 'Unknown User';
            const messageText = msg.text || 'No text message';

            console.log(`\n✅ Chat ID received via ${config.name}:`);
            console.log("📋 Chat ID:", chatId);
            console.log("👤 User:", userName);
            console.log("💬 Message:", messageText);
            console.log("🤖 Bot:", config.name, config.username);

            const responseMessage = `✅ Chat ID detected via ${config.name}!\n\n` +
                `📋 Your Chat ID: \`${chatId}\`\n` +
                `🤖 Bot: ${config.name} (${config.username})\n` +
                `👤 User: ${userName}\n` +
                `💬 Message: ${messageText}\n\n` +
                `🔧 Use this Chat ID: ${chatId}\n` +
                `⚠️ You can stop the script now!`;

            bot.sendMessage(chatId, responseMessage, {
                parse_mode: 'Markdown'
            }).catch(err => {
                console.error(`❌ Error sending response via ${config.name}:`, err.message);
            });
        });

        bot.on('error', (error) => {
            console.error(`❌ ${config.name} error:`, error.message);
        });

        bot.on('polling_error', (error) => {
            console.error(`❌ ${config.name} polling error:`, error.message);
        });

        console.log(`✅ ${config.name} (${config.username}) initialized`);
        return { config, bot };

    } catch (error) {
        console.error(`❌ Failed to initialize ${config.name}:`, error.message);
        return null;
    }
}).filter(Boolean);

console.log(`\n🎉 ${bots.length}/4 bots are active and listening!`);
console.log('📱 Send a message to any bot to get your Chat ID');
console.log('⏹️  Press Ctrl+C to stop all bots');

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🔄 Stopping all bots...');
    bots.forEach(({ config, bot }) => {
        try {
            bot.stopPolling();
            console.log(`✅ ${config.name} stopped`);
        } catch (error) {
            console.error(`❌ Error stopping ${config.name}:`, error.message);
        }
    });
    console.log('👋 All bots stopped. Goodbye!');
    process.exit(0);
});