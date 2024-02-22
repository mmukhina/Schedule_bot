import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';
import { Telegraf, Markup } from 'telegraf';
import * as dotenv from "dotenv";
import Calendar from 'telegram-inline-calendar';
import { Keyboard, Key } from 'telegram-keyboard';

import BotUserData from './models/botUserData.js';
import BotHwInfo from './models/botHwInfo.js';
import BotHwComp from './models/botHwComp.js';

dotenv.config();

let dbconnection = false;

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

try {
    mongoose.connect(process.env.MONGODB_LINK).catch((err) => console.error(err.message));
    dbconnection = true;
} catch (err) {
    console.log(err);
}


// Data
const buttonsText = {
    mainMenu: {
        "calander": "Расписание 📅",
        "homework": "ДЗ 📚",
        "addMyHomework": "Добовить задание себе ⭐️",
        "addAllHomework": "‼️ Добавить дз всем ‼️",
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

const subjects = {
    1: "ТКМ",
    2: "Английский",
    3: "Метрология",
    4: "Элтех",
    5: "ТВиМС",
    6: "ТФКП",
    7: "ТеХмех",
    8: "Аэродинамика",
}

let newHomework = {
    state: "false",
    subject: "",
    date: "",
    messageId: null,
    message: "",
    photo: [],
    document: [],
    manyfiles: false,
}

let lastMessageId = null;
let openMenu = false;

// functions

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



// calander
const today = new Date();
const options = { weekday: 'long', month: 'long', day: 'numeric' };
const russianDate = today.toLocaleDateString('ru-RU', options);
const todaysDate = russianDate;
const calendar = new Calendar(bot, {
    date_format: 'DD-MM-YYYY',
    language: 'ru',
    bot_api: 'telegraf',
    close_calendar: true,
    custom_start_msg: `Сегодня ${todaysDate}. Когда надо сделать дз?`,
    start_week_day: 1,
});
/*
{
    https://github.com/VDS13/telegram-inline-calendar

    date_format: 'YYYY-MM-DD',                     //Datetime result format
    language: 'en',                                //Language (en/es/de/es/fr/it/tr/id)
    bot_api: 'node-telegram-bot-api',              //Telegram bot library
    close_calendar: true,                          //Close calendar after date selection
    start_week_day: 0,                             //First day of the week(Sunday - `0`, Monday - `1`, Tuesday - `2` and so on)
    time_selector_mod: false,                      //Enable time selection after a date is selected.
    time_range: "00:00-23:59",                     //Allowed time range in "HH:mm-HH:mm" format
    time_step: "30m",                              //Time step in the format "<Time step><m | h>"
    start_date: false,                             //Minimum date of the calendar in the format "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" or "now"
    stop_date: false,                              //Maximum date of the calendar in the format "YYYY-MM-DD" or "YYYY-MM-DD HH:mm" or "now"
    custom_start_msg: false,                       //Text of the message sent with the calendar/time selector
    lock_date: false,                              //Enable blocked dates list
    lock_datetime: false                           //Enable list of blocked dates and times
}
*/



// Keyboards

const chooseSubject = generateSubjectInlineKeyboard(subjects);

const mainMenuAdmin = Markup.inlineKeyboard([
    [Markup.button.callback(buttonsText.mainMenu["homework"], "disHomework")],
    [Markup.button.callback(buttonsText.mainMenu["addAllHomework"], "addAllHomework")],
]);

const mainMenuUser = Markup.inlineKeyboard([
    [Markup.button.callback(buttonsText.mainMenu["homework"], "disHomework")],
]);

const chooseCalanderDayKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback(buttonsText.chooseDay["mainMenu"], "disMainMenu")],
    [Markup.button.callback(buttonsText.chooseDay["today"], "calanderToday"), Markup.button.callback(buttonsText.chooseDay["tomorrow"], "calanderTomorrow")],
    [Markup.button.callback(buttonsText.chooseDay["week"], "calanderWeek"), Markup.button.callback(buttonsText.chooseDay["nextWeek"], "calanderNextWeek")],
]);

const chooseHwDayKeyboard = Markup.inlineKeyboard([
    [Markup.button.callback(buttonsText.chooseDay["mainMenu"], "disMainMenu")],
    [Markup.button.callback(buttonsText.chooseDay["today"], "hwToday"), Markup.button.callback(buttonsText.chooseDay["tomorrow"], "hwTomorrow")],
    [Markup.button.callback(buttonsText.chooseDay["week"], "hwWeek"), Markup.button.callback(buttonsText.chooseDay["nextWeek"], "hwNextWeek")],
    [Markup.button.callback(buttonsText.chooseDay["all"], "hwAll")],
]);

const allHomeworkSent = Markup.inlineKeyboard([
    [Markup.button.callback("Это все!", "allHomeworkSent"), Markup.button.callback("Добавить еще", "addMore")],
]);


// commands

bot.command('start', async (ctx) => {
    newHomework.state = false;
    const userData = ctx.from;
    const userUserName = userData.username;
    const userName = userData.first_name;
    const dbData = await BotUserData.findOne({ userUserName: userUserName });
    if (dbData) {
        await ctx.deleteMessage();
        await ctx.reply(`Привет ${userName}! Я бот, который поможет тебе с твоим расписанием. Напиши /menu, чтобы узнать, что я умею.`);
    } else {
        ctx.reply(`Привет ${userName}! Ты еще не зарегистрирован! Нажми /register, чтобы зарегистрироваться.`);
    }
});

bot.command('menu', async (ctx) => {
    newHomework.state = false;
    const userData = ctx.from;
    const userUserName = userData.username;
    const userName = userData.first_name;
    const dbData = await BotUserData.findOne({ userUserName: userUserName });
    if (dbData) {
        if (dbData.status === "admin") {
            await ctx.deleteMessage();
            const data = await ctx.reply(`Это главное меню`, mainMenuAdmin);
        }
        else {
            ctx.deleteMessage();
            lastMessageId = await ctx.reply(`Это главное меню`, mainMenuUser);
        }
    } else {
        ctx.deleteMessage();
        ctx.reply(`Привет ${userName}! Ты еще не зарегистрирован! Нажми /register, чтобы зарегистрироваться.`);
    }
    openMenu = true;
});


bot.command('register', async (ctx) => {
    newHomework.state = false;
    const userData = ctx.from;
    const userUserName = userData.username;

    try {
        const dbData = await BotUserData.findOne({ userUserName: userUserName });

        if (dbData) {
            ctx.reply(`Ты уже зарегистрирован!`);
        } else {
            const newUser = new BotUserData({
                userUserName: userUserName,
                status: "user",
            });
            newUser.save();

            ctx.reply(`Ты зарегистрирован!`);
        }
        ctx.reply(`Нажми /menu, чтобы узнать, что я умею.`);
    } catch (err) {
        console.log(err);
    }

});

// hears
bot.action("disCalander", (ctx) => {
    newHomework.state = false;
    ctx.editMessageText('Расписание на?', chooseCalanderDayKeyboard);
});

bot.action("disMainMenu", async (ctx) => {
    newHomework.state = false;
    const userData = ctx.from;
    const userUserName = userData.username;
    const userName = userData.first_name;
    const dbData = await BotUserData.findOne({ userUserName: userUserName });
    if (dbData) {
        if (dbData.status === "admin") {
            ctx.editMessageText("С чем я могу помочь?", mainMenuAdmin);
        }
        else {
            ctx.editMessageText("С чем я могу помочь?", mainMenuUser);
        }
    } else {
        try{
            ctx.deleteMessage();
        }catch (err){
            console.log(err);
        }
        ctx.reply(`Привет ${userName}! Ты еще не зарегистрирован! Нажми /register, чтобы зарегистрироваться.`);
    }
});

bot.hears("addMyHomework", async (ctx) => {
    ctx.reply("Скоро будет");
});

bot.action("addAllHomework", (ctx) => {
    newHomework.state = true;

    newHomework = {
        state: "false",
        subject: "",
        date: "",
        messageId: null,
        message: "",
        photo: [],
        document: [],
        manyfiles: false,
    }
    
    ctx.editMessageText('Выбери предмет', chooseSubject);
});

bot.action("disHomework", async (ctx) => {
    newHomework.state = false;
    ctx.editMessageText("На какой день?", chooseHwDayKeyboard);
});

bot.action("hwNextWeek", async (ctx) => {
    // find the next monday
    newHomework.state = false;
    let today = new Date();
    let day = today.getDay();
    let diff = today.getDate() - day + (day == 0 ? -6 : 1);
    let monday = new Date(today.setDate(diff));
    monday.setDate(monday.getDate() + 7);

    let dbData = [];
    for (let i = 0; i < 6; i++) {
        let date = new Date(monday);
        date.setDate(date.getDate() + i);
        date = date.toISOString().split('T')[0].split('-').reverse().join('-');
        const data = await BotHwInfo.find({ date: date });

        dbData = dbData.concat(data);
    }
    const dbComp = await BotHwComp.find({ userUserName: ctx.from.username });
    const type = "Следующую неделю";
    displayHW(dbData, dbComp, ctx, type);
});

bot.action("hwWeek", async (ctx) => {
    // display all homework for the week
    newHomework.state = false;
    let today = new Date();

    // find the closest monday
    let day = today.getDay();
    let diff = today.getDate() - day + (day == 0 ? -6 : 1);
    let monday = new Date(today.setDate(diff));

    let dbData = [];
    for (let i = 0; i < 6; i++) {
        let date = new Date(monday);
        date.setDate(date.getDate() + i);
        date = date.toISOString().split('T')[0].split('-').reverse().join('-');
        const data = await BotHwInfo.find({ date: date });

        dbData = dbData.concat(data);
    }

    const dbComp = await BotHwComp.find({ userUserName: ctx.from.username });
    const type = "эту неделю";
    displayHW(dbData, dbComp, ctx, type);
});

bot.action("hwTomorrow", async (ctx) => {
    newHomework.state = false;
    let today = new Date();
    today.setDate(today.getDate() + 1);

    today = today.toISOString().split('T')[0].split('-').reverse().join('-');

    const dbData = await BotHwInfo.find({ date: today });
    const dbComp = await BotHwComp.find({ userUserName: ctx.from.username });

    const type = "завтра";

    displayHW(dbData, dbComp, ctx, type);
});

bot.action("hwToday", async (ctx) => {
    newHomework.state = false;
    let today = new Date();

    // get date in the format "DD-MM-YYYY"
    today = today.toISOString().split('T')[0].split('-').reverse().join('-');

    const dbData = await BotHwInfo.find({ date: today });

    const dbComp = await BotHwComp.find({ userUserName: ctx.from.username });

    const type = "сегодня";

    displayHW(dbData, dbComp, ctx, type);
});

bot.action("hwAll", async (ctx) => {
    newHomework.state = false;
    const dbData = await BotHwInfo.find({});
    const dbComp = await BotHwComp.find({ userUserName: ctx.from.username });

    const type = "all";

    displayHW(dbData, dbComp, ctx, type);
});

async function displayHW(dbData, dbComp, ctx, type) {
    const allHw = dbData.map((item) => item.messageId);

    const manyFiles = {};

    for (let i = 0; i < dbData.length; i++) {
        const messageId = dbData[i].messageId;
        const files = dbData[i].manyfiles;

        manyFiles[messageId] = files;
    }

    const hwComplete = dbComp.map((item) => item.messageId);

    const displayHw = allHw.filter((item) => !hwComplete.includes(item));

    const userData = await BotUserData.findOne({ userUserName: ctx.from.username });

    if (displayHw.length === 0) {
        if (userData.status === "admin") {
            ctx.editMessageText("Все дз выполнено! 🎉", mainMenuAdmin);
        } else {
            ctx.editMessageText("Все дз выполнено! 🎉", mainMenuUser);
        }
        return;
    }

    try{
        ctx.deleteMessage();
    }catch (err){
        console.log(err);
    }

    if (type === "all") {
        if (userData.status === "admin") {
            ctx.reply("Все дз", mainMenuAdmin);
        } else {
            ctx.reply("Все дз", mainMenuUser);
        }
    } else {
        if (userData.status === "admin") {
            ctx.reply(`Дз на ${type}`, mainMenuAdmin);
        } else {
            ctx.reply(`Дз на ${type}`, mainMenuUser);
        }
    }

    for (let i = 0; i < displayHw.length; i++) {
        const messageId = displayHw[i];


        let completeBtn;


        if (manyFiles[messageId] === true) {
            completeBtn = Markup.inlineKeyboard([
                {
                    text: 'Все материалы',
                    url: `https://t.me/${process.env.CHANNEL_ID}/${messageId}`,
                },
                , Markup.button.callback("✅ Готово", `hwComplete_${messageId}`)]);
        } else {
            completeBtn = Markup.inlineKeyboard([
                Markup.button.callback("✅ Готово", `hwComplete_${messageId}`),
            ]);
        }

        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, messageId, completeBtn);

    }
}

// actions
bot.action(/subject_(\d+)/, (ctx) => {
    if (newHomework.state) {
        const subjectId = ctx.match[1];
        const selectedSubject = subjects[subjectId];
        newHomework.subject = selectedSubject;
        newHomework.state = "readyToSend";

        try {
            ctx.editMessageText(`Предмет: ${newHomework.subject}\nНапиши следующим сообщением дз`);
        } catch (err) {
            console.log(err);
        }

    } else {
        ctx.reply("Сначала нажми на кнопку Добавить дз всем");
    }
});

bot.action(/hwComplete_(\d+)/, (ctx) => {
    const messageId = ctx.match[1];
    ctx.deleteMessage();

    const completedHw = new BotHwComp({
        userUserName: ctx.from.username,
        messageId
    });

    completedHw.save();
});

bot.action("allHomeworkSent", (ctx) => {
    ctx.deleteMessage();
    const chatId = ctx.update.callback_query.from.id;
    calendar.startNavCalendar({ chat: { id: chatId } });
});

bot.action("addMore", (ctx) => {
    newHomework.state = "readyToSend";
    ctx.editMessageText("Напиши следующим сообщением что надо еще добавить");
});


// calendar callback

bot.on("callback_query", async (ctx) => {
    if (ctx.callbackQuery.message.message_id == calendar.chats.get(ctx.callbackQuery.message.chat.id)) {
        const res = calendar.clickButtonCalendar(ctx.callbackQuery);
        if (res !== -1) {
            newHomework.date = res;

            const dateStr = res;
            const [day, month, year] = dateStr.split('-').map(Number);
            const options = { weekday: 'long', month: 'long', day: 'numeric' };
            const displayDate = new Intl.DateTimeFormat('ru-RU', options).format(new Date(year, month - 1, day));

            const hwMessage = `⭐️${newHomework.subject}⭐️\n📅${displayDate}\n\nЗадание:\n${newHomework.message}`;

            const numberOfPhotos = newHomework.photo.length;
            const numberOfDocuments = newHomework.document.length;

            const mediaPhotos = [];
            const mediaDocuments = [];

            if (numberOfPhotos > 0) {
                for (let i = 0; i < numberOfPhotos; i++) {
                    mediaPhotos.push({ type: 'photo', media: newHomework.photo[i] });
                }
                if (numberOfDocuments === 0) {
                    mediaPhotos[numberOfPhotos - 1].caption = hwMessage;
                }
            }

            if (numberOfDocuments > 0) {
                for (let i = 0; i < numberOfDocuments; i++) {
                    mediaDocuments.push({ type: 'document', media: newHomework.document[i] });
                }

                mediaDocuments[numberOfDocuments - 1].caption = hwMessage;
            }

            if (numberOfPhotos === 0 && numberOfDocuments === 0) {
                const data = await ctx.telegram.sendMessage(process.env.CHANNEL_ID, hwMessage);
                newHomework.messageId = data.message_id;

            } else {
                let data;
                if (numberOfPhotos > 0) {
                    data = await ctx.telegram.sendMediaGroup(process.env.CHANNEL_ID, mediaPhotos);

                }

                if (numberOfDocuments > 0) {
                    data = await ctx.telegram.sendMediaGroup(process.env.CHANNEL_ID, mediaDocuments);
                }

                newHomework.messageId = data[data.length - 1].message_id;
            }

            if (numberOfPhotos > 1 || numberOfDocuments > 1) {
                newHomework.manyfiles = true;
            }

            const saveNewHomework = new BotHwInfo({
                messageId: newHomework.messageId,
                subject: newHomework.subject,
                date: newHomework.date,
                manyfiles: newHomework.manyfiles
            });

            saveNewHomework.save();

            ctx.reply("Задание добавлено!", mainMenuAdmin);

        }
    }
});


bot.on('text', async (ctx) => {
    if (newHomework.state === "readyToSend") {
        if (newHomework.message === "") {
            newHomework.message = ctx.message.text;
        } else {
            newHomework.message = `${newHomework.message}\n${ctx.message.text}`;
        }
        await ctx.reply("Записал! Нажми на кнопку 👇 если это не все", allHomeworkSent);
    }
});


bot.on('photo', async (ctx) => {
    if (newHomework.state === "readyToSend") {
        const caption = ctx.message.caption || '';

        const fileId = ctx.message.photo[0].file_id;
        newHomework.photo.push(fileId);

        if (caption) {
            if (newHomework.message === "") {
                newHomework.message = caption;
            } else {
                newHomework.message = `${newHomework.message}\n${caption}`;
            }
        }

        if (newHomework.photo.length === 1) {
            await ctx.reply("Фото добавлено! Нажми на кнопку 👇 если это не все", allHomeworkSent);
        }
    }
});

// receive file
bot.on('document', async (ctx) => {
    if (newHomework.state === "readyToSend") {
        const caption = ctx.message.caption || '';

        const fileId = ctx.message.document.file_id;
        newHomework.document.push(fileId);

        if (caption) {
            if (newHomework.message === "") {
                newHomework.message = caption;
            } else {
                newHomework.message = `${newHomework.message}\n${caption}`;
            }
        }

        if (newHomework.document.length === 1) {
            await ctx.reply("Документ добавлен! Нажми на кнопку 👇 если это не все", allHomeworkSent);
        }
    }
});