import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';
import { Telegraf, Markup } from 'telegraf';
import * as dotenv from "dotenv";
import Calendar from 'telegram-inline-calendar';
import { Keyboard, Key } from 'telegram-keyboard';

import BotUserData from './models/botUserData.js';
import BotHwInfo from './models/botHwInfo.js';
import BotHwComp from './models/botHwComp.js';
import BotUserHw from './models/botUserHw.js';
import OpenAI from 'openai';

dotenv.config();

let dbconnection = false;

const bot = new Telegraf(process.env.BOT_TOKEN);

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });


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
        "addMyHomework": "Добавить задание себе ⭐️",
        "addAllHomework": "‼️ Добавить дз всем ‼️",
        "gpt": "GPT 🤖",
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
    1: "Конструкция ЛА",
    2: "Английский",
    3: "Экология",
    4: "Дискретная М.",
    5: "Менеджмент",
    6: "Нав. датчики",
    7: "Микроэлектроника",
    8: "Автоматика",
    9: "Программирование"
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

let myHomework = {
    state: false,
    date: "",
    messageId: null,
    message: "",
}

let lastMessageId = null;
let openMenu = false;
let gpt_state = false;

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

const mainMenuAdminPro = Markup.inlineKeyboard([
    [Markup.button.callback(buttonsText.mainMenu["homework"], "disHomework")],
    [Markup.button.callback(buttonsText.mainMenu["addMyHomework"], "addMyHomework")],
    [Markup.button.callback(buttonsText.mainMenu["addAllHomework"], "addAllHomework")],
    [Markup.button.callback(buttonsText.mainMenu["gpt"], "gpt")],
]);

const mainMenuAdmin = Markup.inlineKeyboard([
    [Markup.button.callback(buttonsText.mainMenu["homework"], "disHomework")],
    [Markup.button.callback(buttonsText.mainMenu["addMyHomework"], "addMyHomework")],
    [Markup.button.callback(buttonsText.mainMenu["addAllHomework"], "addAllHomework")],
]);

const mainMenuUser = Markup.inlineKeyboard([
    [Markup.button.callback(buttonsText.mainMenu["homework"], "disHomework")],
    [Markup.button.callback(buttonsText.mainMenu["addMyHomework"], "addMyHomework")],
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

const hwDueDate = Markup.inlineKeyboard([
    [Markup.button.callback("Сегодня", "dueToday"), Markup.button.callback("Завтра", "dueTomorrow")],
    [Markup.button.callback("Через неделю", "dueWeek"), Markup.button.callback("Через 2 недели", "dueNextWeek")],
    [Markup.button.callback("Выбрать дату", "dueChooseDate")],
])


// commands

bot.command('start', async (ctx) => {
    newHomework.state = false;
    const userData = ctx.from;
    const userUserName = userData.username;
    const userName = userData.first_name;
    const dbData = await BotUserData.findOne({ userUserName: userUserName });
    if (dbData) {
        try {
            await ctx.deleteMessage();
        } catch (err) {
        }
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
            try {
                await ctx.deleteMessage();
            } catch (err) {
            }
            const data = await ctx.reply(`Это главное меню`, mainMenuAdmin);
        } else if (dbData.status === "admin-Pro") {
            try {
                await ctx.deleteMessage();
            } catch (err) {
            }
            const data = await ctx.reply(`Это главное меню`, mainMenuAdminPro);
        }
        else {
            try {
                await ctx.deleteMessage();
            } catch (err) {
            }
            lastMessageId = await ctx.reply(`Это главное меню`, mainMenuUser);
        }
    } else {
        try {
            await ctx.deleteMessage();
        } catch (err) {
        }
        ctx.reply(`Привет ${userName}! Ты еще не зарегистрирован! Нажми /register, чтобы зарегистрироваться.`);
    }
    openMenu = true;
});


bot.command('register', async (ctx) => {
    newHomework.state = false;
    const userData = ctx.from;
    const userUserName = userData.username;
    const userName = `${userData.first_name} ${userData.last_name}`;

    try {
        const dbData = await BotUserData.findOne({ userUserName: userUserName });

        if (dbData) {
            ctx.reply(`Ты уже зарегистрирован!`);
        } else {
            const newUser = new BotUserData({
                userUserName: userUserName,
                name: userName,
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
        } else if (dbData.status === "admin-Pro") {
            ctx.editMessageText("С чем я могу помочь?", mainMenuAdminPro);
        }
        else {
            ctx.editMessageText("С чем я могу помочь?", mainMenuUser);
        }
    } else {
        try {
            ctx.deleteMessage();
        } catch (err) {
        }
        ctx.reply(`Привет ${userName}! Ты еще не зарегистрирован! Нажми /register, чтобы зарегистрироваться.`);
    }
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

bot.action("gpt", (ctx) => {
    gpt_state = true;
    ctx.editMessageText('Введите текст');
});

bot.action("addMyHomework", (ctx) => {
    myHomework.state = true;
    ctx.editMessageText('Что нужно сделать?');
});

bot.action("disHomework", async (ctx) => {
    newHomework.state = false;
    ctx.editMessageText("На какой день?", chooseHwDayKeyboard);

    const data = await BotUserData.findOne({ userUserName: ctx.from.username });
    let userName = data.name;
    if (!userName) {
        userName = `${ctx.from.first_name} ${ctx.from.last_name}`;
        await BotUserData.findOneAndUpdate({ userUserName: ctx.from.username }, { name: userName });
    }
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
    let dbUserHw = [];
    for (let i = 0; i < 6; i++) {
        let date = new Date(monday);
        date.setDate(date.getDate() + i);
        date = date.toISOString().split('T')[0].split('-').reverse().join('-');
        const data = await BotHwInfo.find({ date: date });

        dbData = dbData.concat(data);

        const userHw = await BotUserHw.find({ userUserName: ctx.from.username, date: date });
        dbUserHw = dbUserHw.concat(userHw);
    }
    const dbComp = await BotHwComp.find({ userUserName: ctx.from.username });
    const type = "Следующую неделю";
    displayHW(dbData, dbComp, ctx, type, dbUserHw);
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
    let dbUserHw = [];
    for (let i = 0; i < 6; i++) {
        let date = new Date(monday);
        date.setDate(date.getDate() + i);
        date = date.toISOString().split('T')[0].split('-').reverse().join('-');
        const data = await BotHwInfo.find({ date: date });

        dbData = dbData.concat(data);

        const userHw = await BotUserHw.find({ userUserName: ctx.from.username, date: date });
        dbUserHw = dbUserHw.concat(userHw);
    }

    const dbComp = await BotHwComp.find({ userUserName: ctx.from.username });
    const type = "эту неделю";
    displayHW(dbData, dbComp, ctx, type, dbUserHw);
});

bot.action("hwTomorrow", async (ctx) => {
    newHomework.state = false;
    let today = new Date();
    today.setDate(today.getDate() + 1);

    today = today.toISOString().split('T')[0].split('-').reverse().join('-');

    const dbData = await BotHwInfo.find({ date: today });
    const dbComp = await BotHwComp.find({ userUserName: ctx.from.username });

    const dbUserHw = await BotUserHw.find({ userUserName: ctx.from.username, date: today });

    const type = "завтра";

    displayHW(dbData, dbComp, ctx, type, dbUserHw);
});

bot.action("hwToday", async (ctx) => {
    newHomework.state = false;
    let today = new Date();

    // get date in the format "DD-MM-YYYY"
    today = today.toISOString().split('T')[0].split('-').reverse().join('-');

    const dbData = await BotHwInfo.find({ date: today });

    const dbComp = await BotHwComp.find({ userUserName: ctx.from.username });

    const dbUserHw = await BotUserHw.find({ userUserName: ctx.from.username, date: today });

    const type = "сегодня";

    displayHW(dbData, dbComp, ctx, type, dbUserHw);
});

bot.action("hwAll", async (ctx) => {
    newHomework.state = false;
    const dbData = await BotHwInfo.find({});
    const dbComp = await BotHwComp.find({ userUserName: ctx.from.username });

    const dbUserHw = await BotUserHw.find({ userUserName: ctx.from.username });

    const type = "all";

    displayHW(dbData, dbComp, ctx, type, dbUserHw);
});

async function displayHW(dbData, dbComp, ctx, type, dbUserHw) {
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

    if (displayHw.length === 0 && dbUserHw.length === 0) {
        if (userData.status === "admin") {
            await ctx.editMessageText("Все дз выполнено! 🎉", mainMenuAdmin);
        } else if (userData.status === "admin-Pro") {
            await ctx.editMessageText("Все дз выполнено! 🎉", mainMenuAdminPro)
        } else {
            await ctx.editMessageText("Все дз выполнено! 🎉", mainMenuUser);
        }
        return;
    }

    try {
        await ctx.deleteMessage();
    } catch (err) {
    }

    if (type === "all") {
        await ctx.reply("Все дз");
    } else {
        await ctx.reply(`Дз на ${type}`);
    }


    for (let i = 0; i < displayHw.length; i++) {
        const messageId = displayHw[i];

        let completeBtn;

        if (manyFiles[messageId] === true) {
            completeBtn = Markup.inlineKeyboard([
                {
                    text: 'Все материалы',
                    url: `https://t.me/${process.env.CHANNEL_ID_REDIRECT}/${messageId}`,
                },
                Markup.button.callback("✅ Готово", `hwComplete_${messageId}`)]);
        } else {
            completeBtn = Markup.inlineKeyboard([
                Markup.button.callback("✅ Готово", `hwComplete_${messageId}`),
            ]);
        }

        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, messageId, completeBtn);

    }

    for (let i = 0; i < dbUserHw.length; i++) {
        const message = dbUserHw[i];
        const text = message.message;
        const id = new ObjectId(message._id);
        const messageId = id.toString();

        const completeBtn = Markup.inlineKeyboard([
            Markup.button.callback("✅ Готово", `UserhwComplete_${messageId}`),
        ]);

        await ctx.reply(text, completeBtn);
    }

    if (userData.status === "admin") {
        ctx.reply("Главное меню", mainMenuAdmin);
    } else if (userData.status === "admin-Pro") {
        ctx.reply("Главное меню", mainMenuAdminPro);
    } else {
        ctx.reply("Главное меню", mainMenuUser);
    }

}

bot.action(/UserhwComplete_(\w+)/, async (ctx) => {
    const messageId = ctx.match[1];
    try {
        ctx.deleteMessage();
    } catch (err) {
    }
    const id = new ObjectId(messageId);
    await BotUserHw.findByIdAndDelete(id);
});


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
    try {
        ctx.deleteMessage();
    } catch (err) {
    }

    const completedHw = new BotHwComp({
        userUserName: ctx.from.username,
        messageId
    });

    completedHw.save();
});

bot.action("allHomeworkSent", (ctx) => {
    ctx.editMessageText("Когда надо сделать дз?", hwDueDate);
});

bot.action("addMore", (ctx) => {
    newHomework.state = "readyToSend";
    ctx.editMessageText("Напиши следующим сообщением что надо еще добавить");
});

bot.action("dueToday", async (ctx) => {
    const date = new Date().toISOString().split('T')[0].split('-').reverse().join('-');
    saveHw(ctx, date);
});

bot.action("dueTomorrow", async (ctx) => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    const tomorrow = date.toISOString().split('T')[0].split('-').reverse().join('-');
    saveHw(ctx, tomorrow);
});

bot.action("dueWeek", async (ctx) => {
    const date = new Date();
    date.setDate(date.getDate() + 7);
    const week = date.toISOString().split('T')[0].split('-').reverse().join('-');
    saveHw(ctx, week);
});

bot.action("dueNextWeek", async (ctx) => {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    const nextWeek = date.toISOString().split('T')[0].split('-').reverse().join('-');
    saveHw(ctx, nextWeek);
});

bot.action("dueChooseDate", async (ctx) => {
    try {
        ctx.deleteMessage();
    } catch (err) {
    }
    const chatId = ctx.update.callback_query.from.id;
    calendar.startNavCalendar({ chat: { id: chatId } });

});


// calendar callback

bot.on("callback_query", async (ctx) => {
    if (ctx.callbackQuery.message.message_id == calendar.chats.get(ctx.callbackQuery.message.chat.id)) {
        const res = calendar.clickButtonCalendar(ctx.callbackQuery);
        if (res !== -1) {
            saveHw(ctx, res);
        }
    }
});

async function saveHw(ctx, res) {
    if (myHomework.state === true) {
        myHomework.date = res;

        const newHw = new BotUserHw({
            userUserName: ctx.from.username,
            message: myHomework.message,
            date: myHomework.date,
        });

        newHw.save();

        const data = await BotUserData.findOne({ userUserName: ctx.from.username });
        if (data.status === "admin") {
            ctx.reply("Задание добавлено!", mainMenuAdmin);
        } else if (data.status === "admin-Pro") {
            ctx.reply("Задание добавлено!", mainMenuAdminPro);
        } else {
            ctx.reply("Задание добавлено!", mainMenuUser);
        }

        myHomework = {
            state: false,
            date: "",
            messageId: null,
            message: "",
        }

        return;

    }



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

    const userData = await BotUserData.findOne({ userUserName: ctx.from.username });
    if (userData.status === "admin") {
        ctx.reply("Задание добавлено!", mainMenuAdmin);
    } else if (userData.status === "admin-Pro") {
        ctx.reply("Задание добавлено!", mainMenuAdminPro);
    }
}


bot.on('text', async (ctx) => {
    if (myHomework.state === true) {
        if (myHomework.message === "") {
            myHomework.message = ctx.message.text;
        } else {
            myHomework.message = `${myHomework.message}\n${ctx.message.text}`;
        }
    }

    if (newHomework.state === "readyToSend") {
        if (newHomework.message === "") {
            newHomework.message = ctx.message.text;
        } else {
            newHomework.message = `${newHomework.message}\n${ctx.message.text}`;
        }
        await ctx.reply("Записал! Нажми на кнопку 👇 если это не все", allHomeworkSent);
    } else if (myHomework.state === true) {
        myHomework.message = ctx.message.text;
        ctx.reply("Записал! Нажми на кнопку 👇 если это не все", allHomeworkSent);
    }

    if (gpt_state === true) {
        const text = ctx.message.text;
        ctx.reply("Подожди, я думаю...");
        const response = await getChatGPTResponse(text);
        console.log(response);
        ctx.reply(response);
    }
});

async function getChatGPTResponse(text) {
    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'user', content: text }
        ],
      });
  
      const responseText = response.data.choices[0].message.content;
      return responseText;
    } catch (error) {
      return "Error with GPT: " + error;
    }
  }


bot.on('photo', async (ctx) => {
    if (myHomework.state === true) {
        ctx.reply("Я пока не умею обрабатывать фото. Напиши текстом");
        return;
    }

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
    if (myHomework.state === true) {
        ctx.reply("Я пока не умею обрабатывать файлы. Напиши текстом");
        return;
    }

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