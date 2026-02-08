import dotenv from 'dotenv';
import { Telegraf, Markup } from 'telegraf';
import mongoose from 'mongoose';

import BotSaveRedirect from './models/botSaveRedirect.js';

dotenv.config();
let lastMessages = {};
let dbconnection = false;

// Database connection with better error handling
try {
    mongoose.connect(process.env.MONGODB_LINK).catch((err) => console.error(err.message));
    dbconnection = true;
    
    // Database connection events
    mongoose.connection.on('connected', () => {
        console.log('MongoDB connected');
        dbconnection = true;
    });

    mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
        dbconnection = false;
    });

    mongoose.connection.on('disconnected', () => {
        console.log('MongoDB disconnected');
        dbconnection = false;
    });
} catch (err) {
    console.log('Failed to connect to MongoDB:', err);
}

let user_info = {};

const subjects = {
    1: "ТРПО",
    2: "Английский",
    3: "Эффективность",
    4: "Проект. инт.",
    5: "Борт. обору.",
    6: "Роб. сис.",
    7: "Мат. прога",
    8: "Системный анализ",
    9: "Сети"
}

const bot = new Telegraf(process.env.BOT_TOKEN);

// Global error handler
bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}:`, err);
    ctx.reply('Произошла ошибка. Пожалуйста, попробуйте снова.').catch(console.error);
});

// Middleware for user state management
bot.use(async (ctx, next) => {
    if (ctx.from) {
        const userId = ctx.from.id;

        if (!user_info[userId]) {
            user_info[userId] = {
                chat_id: [],
                chat_message_id: [],
                state: "none",
                tempData: {},
                lastActivity: Date.now()
            };
        } else {
            user_info[userId].lastActivity = Date.now();
        }
    }
    return next();
});

// Keyboards

const chooseSubject = generateSubjectInlineKeyboard(subjects);

function generateSubjectInlineKeyboard(subjects) {
    let buttons = [];
    let row = [];
    
    for (let i = 1; i <= Object.keys(subjects).length; i++) {
        row.push(Markup.button.callback(subjects[i], `subject_${i}`));
        
        if (row.length === 2 || i === Object.keys(subjects).length) {
            buttons.push(row);
            row = [];
        }
    }
    
    return Markup.inlineKeyboard(buttons);
}

// Function to delete last messages
async function deleteLastMessages(ctx) {
    let chatId = ctx.chat.id;
    if (lastMessages[chatId]) {
        for (let messageId of lastMessages[chatId]) {
            try {
                await ctx.telegram.deleteMessage(chatId, messageId);
            } catch (error) {
                console.log(`Failed to delete message ${messageId}:`, error);
            }
        }
        delete lastMessages[chatId];
    }
}

// Function to add message to tracking
function add_message(ctx, sentMessage) {
    if (!lastMessages[ctx.chat.id]) {
        lastMessages[ctx.chat.id] = [];
    }
    lastMessages[ctx.chat.id].push(sentMessage.message_id);
}

// Function to send message to channel
async function sendToChannel(ctx, message) {
    try {
        const CHANNEL_ID = '@all_hw'; // Using username instead of numeric ID
        
        let sentMsg;
        
        if (message.photo) {
            // Handle photos
            const photo = message.photo[message.photo.length - 1];
            sentMsg = await ctx.telegram.sendPhoto(
                CHANNEL_ID,
                photo.file_id,
                {
                    caption: message.caption,
                    caption_entities: message.caption_entities,
                    parse_mode: message.parse_mode
                }
            );
        } else if (message.video) {
            // Handle videos
            sentMsg = await ctx.telegram.sendVideo(
                CHANNEL_ID,
                message.video.file_id,
                {
                    caption: message.caption,
                    caption_entities: message.caption_entities,
                    parse_mode: message.parse_mode
                }
            );
        } else if (message.document) {
            // Handle documents
            sentMsg = await ctx.telegram.sendDocument(
                CHANNEL_ID,
                message.document.file_id,
                {
                    caption: message.caption,
                    caption_entities: message.caption_entities,
                    parse_mode: message.parse_mode
                }
            );
        } else if (message.audio) {
            // Handle audio
            sentMsg = await ctx.telegram.sendAudio(
                CHANNEL_ID,
                message.audio.file_id,
                {
                    caption: message.caption,
                    caption_entities: message.caption_entities,
                    parse_mode: message.parse_mode
                }
            );
        } else if (message.voice) {
            // Handle voice
            sentMsg = await ctx.telegram.sendVoice(
                CHANNEL_ID,
                message.voice.file_id,
                {
                    caption: message.caption,
                    caption_entities: message.caption_entities,
                    parse_mode: message.parse_mode
                }
            );
        } else if (message.text) {
            // Handle text
            sentMsg = await ctx.telegram.sendMessage(
                CHANNEL_ID,
                message.text,
                {
                    entities: message.entities,
                    parse_mode: message.parse_mode
                }
            );
        } else {
            // Fallback: try to forward
            sentMsg = await ctx.telegram.forwardMessage(
                CHANNEL_ID,
                ctx.chat.id,
                message.message_id
            );
        }
        
        console.log(`Message sent to channel ${CHANNEL_ID} with ID: ${sentMsg.message_id}`);
        return sentMsg;
    } catch (error) {
        console.error("Error sending to channel:", error);
        
        // If username doesn't work, try with numeric ID from env
        if (error.description && error.description.includes('CHAT_ID_INVALID')) {
            console.log('Trying with numeric ID from env...');
            if (process.env.CHANNEL_ID) {
                try {
                    // Retry with numeric ID
                    const sentMsg = await ctx.telegram.forwardMessage(
                        process.env.CHANNEL_ID,
                        ctx.chat.id,
                        message.message_id
                    );
                    return sentMsg;
                } catch (retryError) {
                    console.error("Retry with numeric ID also failed:", retryError);
                    throw retryError;
                }
            }
        }
        throw error;
    }
}

// Commands

bot.command('start', async (ctx) => {
    try {
        let sentMessage = await ctx.reply(
            "Привет! Я бот для сохранения домашних заданий.\n\n" +
            "**Как использовать:**\n" +
            "1. Отправьте мне любое сообщение (текст, фото, видео, документ)\n" +
            "2. Я автоматически отправлю его в канал @all_hw\n" +
            "3. Выберите предмет для сохранения\n" +
            "4. Позже можете просмотреть сохраненные материалы через /menu\n\n"
        );

        add_message(ctx, sentMessage);
        
        try {
            await ctx.deleteMessage();
        } catch (err) {
            // Ignore if can't delete
        }
    } catch (error) {
        console.error("Error in /start command:", error);
    }
});

bot.command('menu', async (ctx) => {
    try {
        await deleteLastMessages(ctx);

        let sentMessage = await ctx.reply('Выберите предмет для просмотра:', chooseSubject);
        add_message(ctx, sentMessage);

        try {
            await ctx.deleteMessage();
        } catch (err) {
            // Ignore if can't delete
        }
    } catch (error) {
        console.error("Error in /menu command:", error);
        ctx.reply('Произошла ошибка. Пожалуйста, попробуйте снова.').catch(console.error);
    }
});

bot.command('help', async (ctx) => {
    await ctx.reply(
        "📚 **Помощь по использованию бота:**\n\n" +
        "**/start** - Начало работы\n" +
        "**/menu** - Просмотр сохраненных материалов\n" +
        "**/help** - Эта справка\n\n" +
        "Просто отправьте любое сообщение (текст, файл, фото, видео), и я сохраню его в канале @all_hw"
    );
});

// Actions

bot.action(/subject_(\d+)/, async (ctx) => {
    try {
        const subjectId = parseInt(ctx.match[1]);
        
        // Validate subject ID
        if (!subjects[subjectId]) {
            await ctx.answerCbQuery('Неверный предмет');
            return;
        }
        
        const selectedSubject = subjects[subjectId];
        let info = user_info[ctx.from.id];

        await ctx.answerCbQuery(); // Acknowledge the callback

        if (info.state === "add") {
            // Save the message
            let sentMessage = await ctx.reply(`✅ Сохранено в раздел "${selectedSubject}"!\nИспользуйте /menu для возврата.`);

            // Save all messages to database
            for (let i = 0; i < info.chat_id.length; i++) {
                try {
                    let userData = new BotSaveRedirect({
                        messageId: info.chat_message_id[i],
                        fromChatId: info.chat_id[i],
                        subject: selectedSubject,
                        savedBy: ctx.from.id,
                        savedAt: new Date(),
                        messageType: info.messageTypes ? info.messageTypes[i] : 'unknown',
                        username: ctx.from.username || 'unknown'
                    });
                    await userData.save();
                } catch (error) {
                    console.error("Error saving to database:", error);
                }
            }

            // Reset user state
            info.chat_id = [];
            info.chat_message_id = [];
            if (info.messageTypes) info.messageTypes = [];
            info.state = "none";
            
            add_message(ctx, sentMessage);
            
        } else {
            // Display saved information for the subject
            await deleteLastMessages(ctx);
            
            if (!lastMessages[ctx.chat.id]) {
                lastMessages[ctx.chat.id] = [];
            }

            try {
                const savedInfo = await BotSaveRedirect.find({ subject: selectedSubject });

                if (savedInfo.length === 0) {
                    let sentMessage = await ctx.reply(`📭 Нет сохраненных материалов по предмету "${selectedSubject}".\nИспользуйте /menu для выбора другого предмета.`);
                    add_message(ctx, sentMessage);
                } else {
                    let sentMessage = await ctx.reply(`📂 Материалы по предмету "${selectedSubject}":`);
                    add_message(ctx, sentMessage);
                    
                    // Copy all saved messages
                    for (let item of savedInfo) {
                        try {
                            let copiedMsg = await ctx.telegram.copyMessage(
                                ctx.chat.id,
                                item.fromChatId,
                                item.messageId
                            );
                            add_message(ctx, copiedMsg);
                        } catch (error) {
                            console.error(`Error copying message ${item.messageId}:`, error);
                        }
                    }

                    let sentMessage2 = await ctx.reply("📌 Используйте /menu для просмотра других предметов");
                    add_message(ctx, sentMessage2);
                }
            } catch (error) {
                console.error("Error fetching from database:", error);
                let sentMessage = await ctx.reply("❌ Ошибка при получении данных. Попробуйте позже.");
                add_message(ctx, sentMessage);
            }
        }

        info.state = "none";

    } catch (error) {
        console.error("Error in subject action:", error);
        await ctx.reply('❌ Произошла ошибка. Пожалуйста, попробуйте снова.').catch(console.error);
    }
});

// Message handler - handles all types of messages
bot.on('message', async (ctx) => {
    // Skip commands
    if (ctx.message.text && ctx.message.text.startsWith('/')) {
        return;
    }
    
    let info = user_info[ctx.from.id];
    let sentMessage;

    try {
        await deleteLastMessages(ctx);
        
        // Send message to channel
        let channelMsg;
        try {
            channelMsg = await sendToChannel(ctx, ctx.message);
        } catch (error) {
            console.error("Failed to send to channel:", error);
            
            // Check if it's a permission issue
            if (error.description && error.description.includes('bot is not a member')) {
                sentMessage = await ctx.reply(
                    '❌ Бот не добавлен в канал @all_hw.\n\n' +
                    'Пожалуйста:\n' +
                    '1. Добавьте бота @' + ctx.botInfo.username + ' в канал @all_hw\n' +
                    '2. Дайте права на отправку сообщений\n' +
                    '3. Попробуйте снова'
                );
            } else if (error.description && error.description.includes('CHAT_NOT_FOUND')) {
                sentMessage = await ctx.reply(
                    '❌ Канал @all_hw не найден.\n\n' +
                    'Убедитесь, что:\n' +
                    '1. Канал @all_hw существует\n' +
                    '2. Бот имеет доступ к каналу\n' +
                    '3. Канал публичный или бот добавлен в него'
                );
            } else {
                sentMessage = await ctx.reply('❌ Ошибка при отправке в канал. Попробуйте позже.');
            }
            
            if (sentMessage) add_message(ctx, sentMessage);
            return;
        }
        
        // Save the channel message info
        info.chat_id.push(channelMsg.chat.id);
        info.chat_message_id.push(channelMsg.message_id);
        
        // Determine message type for better tracking
        if (!info.messageTypes) info.messageTypes = [];
        
        if (ctx.message.photo) {
            info.messageTypes.push('photo');
        } else if (ctx.message.video) {
            info.messageTypes.push('video');
        } else if (ctx.message.document) {
            info.messageTypes.push('document');
        } else if (ctx.message.text) {
            info.messageTypes.push('text');
        } else if (ctx.message.audio) {
            info.messageTypes.push('audio');
        } else if (ctx.message.voice) {
            info.messageTypes.push('voice');
        } else {
            info.messageTypes.push('unknown');
        }
        
        info.state = "add";
        
        sentMessage = await ctx.reply(
            '✅ Сообщение отправлено в канал @all_hw!\n\n' +
            '📚 К какому предмету отнести этот материал?',
            chooseSubject
        );
        
        if (sentMessage) {
            add_message(ctx, sentMessage);
        }
        
        // Try to delete the original message (optional)
        try {
            await ctx.deleteMessage();
        } catch (deleteError) {
            // Ignore if can't delete - not critical
        }
        
    } catch (error) {
        console.error("Error in message handler:", error);
        await ctx.reply('❌ Произошла ошибка при обработке сообщения. Попробуйте снова.').catch(console.error);
    }
});

// Clean up inactive users periodically
setInterval(() => {
    const now = Date.now();
    const INACTIVE_LIMIT = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const userId in user_info) {
        if (now - user_info[userId].lastActivity > INACTIVE_LIMIT) {
            delete user_info[userId];
        }
    }
}, 60 * 60 * 1000); // Every hour

// Bot launch configuration
if (process.env.NODE_ENV !== "development") {
    // Production with webhook
    bot.launch({
        webhook: {
            domain: process.env.DOMAIN,
            port: process.env.PORT || 8000
        }
    }).then(() => {
        console.log('Bot is running in production mode with webhook');
    }).catch(error => {
        console.error('Failed to launch bot:', error);
    });
} else {
    // Development with polling
    bot.launch().then(() => {
        console.log('Bot is running in development mode with polling');
    }).catch(error => {
        console.error('Failed to launch bot:', error);
    });
}

// Enable graceful stop
process.once('SIGINT', () => {
    bot.stop('SIGINT');
    mongoose.connection.close();
    console.log('Bot stopped by SIGINT');
});

process.once('SIGTERM', () => {
    bot.stop('SIGTERM');
    mongoose.connection.close();
    console.log('Bot stopped by SIGTERM');
});

export default bot;