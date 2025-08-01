import TelegramBot from 'node-telegram-bot-api';

const token = '7965399127:AAH_4SSjYKZshPMl1Cvouu9SS3naJpvi6m0'; // Your bot token
const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
    console.log("✅ Chat ID found:", msg.chat.id);
    bot.sendMessage(msg.chat.id, "✅ Your Chat ID has been received. You can now stop this script.");
});