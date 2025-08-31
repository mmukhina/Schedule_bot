import dotenv from 'dotenv';
import { Telegraf, Markup } from 'telegraf';
import mongoose from 'mongoose';

import BotUserData from './models/botUserData.js';
//import BotHwInfo from './models/botHwInfo.js';
//import BotHwComp from './models/botHwComp.js';
//import BotUserHw from './models/botUserHw.js';
import BotSaveRedirect from './models/botSaveRedirect.js';

dotenv.config();
let see_info = false;
let lastMessages = {};
let dbconnection = false;

try {
    mongoose.connect(process.env.MONGODB_LINK).catch((err) => console.error(err.message));
    dbconnection = true;
} catch (err) {
    console.log(err);
}

let state = "none";

let chat_id = [];
let chat_message_id = [];

const subjects = {
    1: "ТР ПО",
    2: "Английский",
    3: "УП",
    4: "Оснащение",
    5: "Оптимизация",
    6: "Базы данных",
    7: "Системы наведения",
    8: "Прицелы",
    9: "Мат прога",
    10: "ОВС",
    11: "БЖД",
    12: "ПЯВУ",
}

const buttonsText = {
    mainMenu: {
        "calander": "Расписание 📅",
        "homework": "ДЗ 📚",
        "addMyHomework": "Добавить задание себе ⭐️",
        "addAllHomework": "‼️ Добавить дз всем ‼️",
        "gpt": "GPT 🤖",
        "info": "Важное ❗️"
    },
    chooseDay: {
        "mainMenu": "Главное меню",
        "today": "Сегодня",
        "tomorrow": "Завтра",
        "week": "Неделя",
        "nextWeek": "Сл. Неделя",
        "all": "Все",
    },
}

const bot = new Telegraf(process.env.BOT_TOKEN);
if (process.env.NODE_ENV !== "development") {
    bot.startWebhook(`/${process.env.BOT_TOKEN}`, null, 3000);
}


if (process.env.NODE_ENV === "development") {
    bot.launch();
} else { // if local use Long-polling
    bot.launch({
        webhook: {
            domain: process.env.DOMAIN,
            port: process.env.PORT || 8000
        }
    });
}

// Keyboards

const chooseSubject = generateSubjectInlineKeyboard(subjects);

function generateSubjectInlineKeyboard(subjects) {
    // add a back button
    let buttons = [[]];
    let numOfRows = 0;
    let count = 0;

    for (let i = 1; i <= Object.keys(subjects).length; i++) {
        buttons[numOfRows].push(Markup.button.callback(subjects[i], `subject_${i}`));
        count++;

        if (count === 3) {
            count = 0;
            numOfRows++;
            buttons.push([]);
        }

    }

    return Markup.inlineKeyboard(buttons);
}

const mainMenuAdmin = Markup.inlineKeyboard([
    [Markup.button.callback(buttonsText.mainMenu["homework"], "disHomework")],
    [Markup.button.callback(buttonsText.mainMenu["addAllHomework"], "addAllHomework")],
    [Markup.button.callback(buttonsText.mainMenu["info"], "seeInfo")],
]);

const mainMenuUser = Markup.inlineKeyboard([
    [Markup.button.callback(buttonsText.mainMenu["homework"], "disHomework")],
    [Markup.button.callback(buttonsText.mainMenu["info"], "seeInfo")],
]);

/*
bot.on('text', async msg => {
    try {
        if (msg.text == '/menu') {

            await bot.sendMessage(msg.chat.id, `Меню`, {
                reply_markup: {
                    inline_keyboard: mainMenuAdmin,
                    resize_keyboard: true
                }

            })

        }

    } catch (error) {

        console.log(error);

    }

})
    */


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
        delete lastMessages[chatId]; // Corrected delete syntax
    }
}



/*
bot.action("seeInfo", async (ctx) => {
    try {
        const chatId = ctx.chat.id;
        console.log(lastMessages);

        // Delete the last message if it exists
        await deleteLastMessages(ctx);
        console.log(lastMessages);
        // Set state
        state = "seeInfo";

        // Edit the message or send a new one if editing fails
        try {
            await ctx.editMessageText('Выбери предмет', chooseSubject);
        } catch (error) {
            await ctx.reply('Выбери предмет', chooseSubject);
        }

    } catch (error) {
        console.error("Error in seeInfo action:", error);
    }
});
*/


bot.action(/subject_(\d+)/, async (ctx) => {
    const subjectId = ctx.match[1];
    const selectedSubject = subjects[subjectId];

    let sentMessage;

    if (state == "add") {
        sentMessage = await ctx.reply("Успешно сохранено! - /menu");

        for (let i = 0; i < chat_id.length; i++) {
            let userData = new BotSaveRedirect({
                messageId: chat_message_id[i],
                fromChatId: chat_id[i],
                subject: selectedSubject,
            });
            await userData.save();
        }

        chat_id = [];
        chat_message_id = [];

    } else {
        sentMessage = await ctx.reply("Предмет " + selectedSubject);
        await deleteLastMessages(ctx);

        const info = await BotSaveRedirect.find({ subject: selectedSubject });

        if (info.length == 0) {
            let sentMessage = await ctx.reply("Ничего не сохранено - /menu");
            add_message(ctx, sentMessage);
        } else {
            if (!lastMessages[ctx.chat.id]) {
                lastMessages[ctx.chat.id] = [];
            }

            for (let i = 0; i < info.length; i++) {
                try {
                    let sentMessage = await ctx.telegram.copyMessage(
                        ctx.chat.id,
                        info[i].fromChatId,
                        info[i].messageId,
                    );
                    add_message(ctx, sentMessage);
                } catch (e) {
                    console.log(e);
                }

            }

            let sentMessage = await ctx.reply("Для того чтобы просмотреть информацию нажмите сюда - /menu");

            add_message(ctx, sentMessage);
        }
    }
    state = "none";

    add_message(ctx, sentMessage);
});

/*
bot.on('callback_query', async ctx => {
    try {
        //await bot.deleteMessage(ctx.message.chat.id, ctx.message.message_id)

        else if (ctx.data == "disMainMenu") {
            await bot.sendMessage(ctx.message.chat.id, `Меню`, {
                reply_markup: {
                    inline_keyboard: mainMenuAdmin,
                    resize_keyboard: true
                }

            })
        } else if (ctx.data.slice(0, 8) == "subject_") {
            console.log("test");
            if (state) {
                const subjectId = ctx.data.slice(8);
                const selectedSubject = subjects[parseInt(subjectId)];

                const info = await BotSaveRedirect.find({ subject: selectedSubject });
                console.log(info);


                if (info.length == 0) {
                    ctx.reply("Ничего не сохранено");
                } else {
                    for (let i = 0; i < info.length; i++) {
                        try {
                            const message = await bot.getMessage(info[i].fromChatId, info[i].messageId);

                            await bot.sendMessage(targetChatId, message.text, {
                                caption: "New caption", // Optional
                                parse_mode: "Markdown", // Optional
                                disable_notification: true, // Optional
                            });

                        } catch (e) {
                            console.log(e);
                        }
                        //await ctx.telegram.copyMessage()

                    }
                }

                const data = await BotUserData.findOne({ userUserName: ctx.from.username });
                if (data.status === "admin") {
                    ctx.reply("Меню", mainMenuAdmin);
                } else {
                    ctx.reply("Меню", mainMenuUser);
                }

            }
        }


    }
    catch (error) {

        console.log(error);

    }

})

*/


/*
bot.command('id', (ctx) => {
    ctx.reply(`Your Telegram ID is: ${ctx.from.id}`);
});
*/



//////

async function add_message(ctx, sentMessage) {
    if (!lastMessages[ctx.chat.id]) {
        lastMessages[ctx.chat.id] = [];
    }
    lastMessages[ctx.chat.id].push(sentMessage.message_id);
}

bot.command('start', async (ctx) => {

    let sentMessage = await ctx.reply("Для того чтобы просмотреть информацию нажмите сюда - /menu");

    add_message(ctx, sentMessage);

    try {
        await ctx.deleteMessage();
    } catch (err) {

    }
});


bot.command('menu', async (ctx) => {
    //newHomework.state = false;
    //const userData = ctx.from;
    //const userUserName = userData.username;
    //const userName = userData.first_name;
    //console.log("yes");
    //const dbData = await BotUserData.findOne({ userUserName: userUserName });

    await deleteLastMessages(ctx);

    let sentMessage = await ctx.reply('Выбери предмет', chooseSubject);

    add_message(ctx, sentMessage);

    try {
        await ctx.deleteMessage();
    } catch (err) {

    }
});

async function check_membership(channel, bot_id) {
    try {
        const chatMember = await ctx.telegram.getChatMember(
            channel,        // The channel to check
            bot_id          // Bot's user ID
        );
        return true;
    } catch (err) {
        return false;
    }
}

bot.on('message', async (ctx) => {
    let sentMessage;

    try {
        let membership = await check_membership(ctx.message.forward_from_chat.id, ctx.botInfo.id);

        if (membership) {
            chat_id.push(ctx.message.forward_from_chat.id);
            chat_message_id.push(ctx.message.forward_from_message_id);

            state = "add";
            sentMessage = await ctx.reply('Куда сохранить?', chooseSubject);
        } else {
            sentMessage = await ctx.reply("Forbidden: bot is not a member of the channel chat - /menu");
        }
    } catch (err) {
        console.log(err);
        //const message = await ctx.copyMessage(ctx.chat.id, ctx.message.message_id);
        let info = await ctx.forwardMessage(process.env.CHANNEL_ID);

        chat_id.push(info.sender_chat.id);
        chat_message_id.push(info.message_id);

        state = "add";
        if (chat_id.length == 1) {
            sentMessage = await ctx.reply('Куда сохранить?', chooseSubject);
        }

    }

    await deleteLastMessages(ctx);
    if (sentMessage) add_message(ctx, sentMessage);
    await ctx.deleteMessage();
});



