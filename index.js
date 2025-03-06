import dotenv from 'dotenv';
import { Telegraf, Markup } from 'telegraf';
import mongoose from 'mongoose';
import cron from 'node-cron';

import BotUserData from './models/botUserData.js';
import BotHwInfo from './models/botHwInfo.js';
import BotHwComp from './models/botHwComp.js';
import BotUserHw from './models/botUserHw.js';
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

const subjects = {
    1: "Алгоритмы и структуры данных",
    2: "Английский",
    3: "ТАУ",
    4: "Оснащение",
    5: "Экономика",
    6: "ОВС",
    7: "Методы оптимизации",
    8: "С++",
    9: "Стат. динамика"
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
    let buttons = [[Markup.button.callback("Главное меню", "disMainMenu")], []];
    let numOfRows = 1;
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

async function deleteLastMessages(ctx){
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

bot.command('menu', async (ctx) => {
    //newHomework.state = false;
    //const userData = ctx.from;
    //const userUserName = userData.username;
    //const userName = userData.first_name;
    //console.log("yes");
    //const dbData = await BotUserData.findOne({ userUserName: userUserName });
    if (!lastMessages[ctx.chat.id]) {
        lastMessages[ctx.chat.id] = [];
    }
    lastMessages[ctx.chat.id].push(ctx.message.message_id);

    await deleteLastMessages(ctx);

    console.log(lastMessages);

    const data = await BotUserData.findOne({ userUserName: ctx.from.username });
    let sentMessage;
    if (data.status === "admin") {
        sentMessage = await ctx.reply("Меню", mainMenuAdmin);
    } else {
        sentMessage = await ctx.reply("Меню", mainMenuUser);
    }

    if (!lastMessages[ctx.chat.id]) {
        lastMessages[ctx.chat.id] = [];
    }
    lastMessages[ctx.chat.id].push(sentMessage.message_id);
    console.log(lastMessages);
    //openMenu = true;
});

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


bot.action(/subject_(\d+)/, async (ctx) => {
    //console.log(ctx.callbackQuery);
    ctx.deleteMessage();
    await deleteLastMessages(ctx);
    try {
        if (state == 'seeInfo') {
            const subjectId = ctx.match[1];
            const selectedSubject = subjects[subjectId];
            console.log(selectedSubject);

            const info = await BotSaveRedirect.find({ subject: selectedSubject });

            if (info.length == 0) {
                ctx.reply("Ничего не сохранено");
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
                        lastMessages[ctx.chat.id].push(sentMessage.message_id);
                    } catch (e) {
                        console.log(e);
                    }

                }
                console.log(lastMessages);
            }

            const data = await BotUserData.findOne({ userUserName: ctx.from.username });
            if (data.status === "admin") {
                ctx.reply("Меню", mainMenuAdmin);
            } else {
                ctx.reply("Меню", mainMenuUser);
            }
        }
    } catch (error) {

        console.log(error);

    }
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

cron.schedule('00 14  * * *', async () => {
    console.log('Cron job scheduled for 10:52 every day.');
    //bot.telegram.sendMessage("yess");
    bot.telegram.sendMessage(957574111, 'reminder');

    // Send a daily reminder at 9:00 AM
    //const users = await BotUserData.find({});
    //console.log(users);

});

/*
bot.command('id', (ctx) => {
    ctx.reply(`Your Telegram ID is: ${ctx.from.id}`);
});
*/
