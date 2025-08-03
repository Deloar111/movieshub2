// getChannelIds.cjs - Get channel IDs for all 4 bots with your actual tokens
const TelegramBot = require('node-telegram-bot-api');

// Your actual bot tokens
const bots = [{
        name: 'Movieshub',
        token: '7948443317:AAGbzpq__Bl3eNJd8J1xSf5XqcR1heITyhY',
        username: '@Mhubsbot'
    },
    {
        name: 'Moviemods',
        token: '7682450259:AAHdtvmumVrOFWe4ytxqodh_1k-ooD9rHYk',
        username: '@Moviemodsbot'
    },
    {
        name: 'Moveshub',
        token: '8371835477:AAFejQlDZhkS4muunXPRvi2mA-J8VGn8TxM',
        username: '@Movhubsbot'
    },
    {
        name: 'Movieshubbot',
        token: '7965399127:AAH_4SSjYKZshPMl1Cvouu9SS3naJpvi6m0',
        username: '@movhubs_bot'
    }
];

async function getChannelInfo() {
    console.log('🔍 Getting channel information for all 4 bots...\n');

    for (const botInfo of bots) {
        try {
            console.log(`🤖 Checking ${botInfo.name} (${botInfo.username})...`);
            const bot = new TelegramBot(botInfo.token, { polling: false });

            // Get bot info
            const me = await bot.getMe();
            console.log(`✅ ${botInfo.name}:`);
            console.log(`   Username: @${me.username}`);
            console.log(`   Bot ID: ${me.id}`);
            console.log(`   Bot Name: ${me.first_name}`);
            console.log(`   Can Join Groups: ${me.can_join_groups}`);
            console.log(`   Can Read All Group Messages: ${me.can_read_all_group_messages}`);

            // Get recent updates to find channel IDs
            const updates = await bot.getUpdates({ limit: 20 });

            if (updates.length > 0) {
                console.log(`   📥 Found ${updates.length} recent updates:`);
                const uniqueChats = new Map();

                updates.forEach(update => {
                    if (update.message || update.channel_post) {
                        const message = update.message || update.channel_post;
                        const chat = message.chat;

                        if (!uniqueChats.has(chat.id)) {
                            uniqueChats.set(chat.id, {
                                id: chat.id,
                                title: chat.title || chat.first_name || 'Private Chat',
                                type: chat.type,
                                username: chat.username,
                                memberCount: chat.member_count || 'Unknown'
                            });
                        }
                    }
                });

                if (uniqueChats.size > 0) {
                    console.log('   📋 Chat IDs found:');
                    uniqueChats.forEach(chat => {
                        console.log(`   - ${chat.title} (${chat.type})`);
                        console.log(`     Chat ID: ${chat.id}`);
                        if (chat.username) {
                            console.log(`     Username: @${chat.username}`);
                        }
                        console.log(`     Members: ${chat.memberCount}`);

                        // Suggest .env format for channels/groups
                        if (chat.type === 'channel' || chat.type === 'supergroup') {
                            const envName = `${botInfo.name.toUpperCase()}_CHANNEL_ID`;
                            console.log(`     💡 .env: ${envName}=${chat.id}`);
                        }
                        console.log('');
                    });
                } else {
                    console.log('   ⚠️ No chat messages found in recent updates');
                }
            } else {
                console.log('   ⚠️ No recent messages found');
                console.log('   💡 To get channel IDs:');
                console.log('   1. Add this bot as admin to your channel');
                console.log('   2. Send a test message to the channel');
                console.log('   3. Run this script again');
            }

            console.log(''); // Empty line for spacing

        } catch (err) {
            console.log(`❌ ${botInfo.name} Error: ${err.message}`);

            if (err.message.includes('409')) {
                console.log(`   🔧 Fix: This bot is already running elsewhere (polling conflict)`);
                console.log(`   Solution: Stop other instances or use webhook instead`);
            } else if (err.message.includes('401')) {
                console.log(`   🔧 Fix: Bot token is invalid or bot was deleted`);
            } else if (err.message.includes('400')) {
                console.log(`   🔧 Fix: Bad request - check bot configuration`);
            }
            console.log('');
        }

        // Small delay between bots to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1500));
    }

    console.log('📝 Summary & Next Steps:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('1. ✅ All 4 bot tokens are configured');
    console.log('2. 📋 For each working bot:');
    console.log('   • Add bot as ADMIN to your channel');
    console.log('   • Post a test message in the channel');
    console.log('   • Run this script again to get channel IDs');
    console.log('3. 📝 Add channel IDs to your .env file like this:');
    console.log('   MOVIESHUB_CHANNEL_ID=-1001234567890');
    console.log('   MOVIEMODS_CHANNEL_ID=-1001234567890');
    console.log('   MOVESHUB_CHANNEL_ID=-1001234567890');
    console.log('   MOVIESHUBBOT_CHANNEL_ID=-1001234567890');
    console.log('');
    console.log('🤖 Your bots:');
    bots.forEach(bot => {
        console.log(`   • ${bot.name} - ${bot.username}`);
    });
}

// Run the function
console.log('🚀 Starting Telegram Bot Channel ID Detection...\n');
getChannelInfo().catch(err => {
    console.error('❌ Script failed:', err.message);
});