import mongoose from 'mongoose';
import { ObjectId } from 'mongodb';
import { Telegraf, Markup } from 'telegraf';
import express from "express";
import cors from "cors";
import * as dotenv from "dotenv";
import Calendar from 'telegram-inline-calendar';
import { Keyboard, Key } from 'telegram-keyboard';

import BotUserData from './models/botUserData.js';
import BotHwInfo from './models/botHwInfo.js';
import BotHwComp from './models/botHwComp.js';

const app = express();
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static("public"));


dotenv.config();

let dbconnection = false;

const bot = new Telegraf(process.env.BOT_TOKEN);
bot.startWebhook(`/`, null, 4000);

// app config
app.listen(3000, () => {
    console.log('Bot is running!');
    if (!dbconnection) {
        connectToDatabase().catch((err) => {
            console.error(err);
        });
    }
});

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send("Internal Server Error");
});

const connectToDatabase = async () => {
    try {
        mongoose.connect(process.env.MONGODB_LINK).catch((err) => console.error(err.message));
        console.log("Connected to MongoDB");
        dbconnection = true;
    } catch (err) {
        console.error(err);
        throw new Error("Unable to connect to MongoDB");
    }
};


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
    1: "ТеРмех",
    2: "Диффуры",
    3: "Физика",
    4: "Инжа",
    5: "Элтех",
    6: "Матвед",
    7: "Социология",
    8: "ТВиМС",
    9: "ТеХмех",
}

let newHomework = {
    state: false,
    subject: "",
    date: "",
    messageId: "",
}

let lastMessageId = null;
let openMenu = false;

// functions

function generateSubjectInlineKeyboard(subjects) {
    const buttons = Object.entries(subjects).map(([key, value]) =>
        Markup.button.callback(value, `subject_${key}`)
    );

    return Markup.inlineKeyboard(buttons, { columns: 3 });
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
    [Markup.button.callback(buttonsText.mainMenu["calander"], "disCalander"), Markup.button.callback(buttonsText.mainMenu["homework"], "disHomework")],
    [Markup.button.callback(buttonsText.mainMenu["addMyHomework"], "addMyHomework")],
    [Markup.button.callback(buttonsText.mainMenu["addAllHomework"], "addAllHomework")],
]);

const mainMenuUser = Markup.inlineKeyboard([
    [Markup.button.callback(buttonsText.mainMenu["calander"], "disCalander"), Markup.button.callback(buttonsText.mainMenu["homework"], "disHomework")],
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


// commands

bot.command('start', async (ctx) => {
    newHomework.state = false;
    const userData = ctx.from;
    const userUserName = userData.username;
    const userName = userData.first_name;
    const dbData = await BotUserData.findOne({ userUserName: userUserName });
    if (dbData) {
        if(openMenu){
            await ctx.deleteMessage();
            await ctx.deleteMessage(lastMessageId)
            const data = await ctx.reply(`Привет ${userName}! Я бот, который поможет тебе с твоим расписанием. Напиши /help, чтобы узнать, что я умею.`);
            lastMessageId = data.message_id;
        }else{
            await ctx.deleteMessage();
            const data = await ctx.reply(`Привет ${userName}! Я бот, который поможет тебе с твоим расписанием. Напиши /help, чтобы узнать, что я умею.`);
            lastMessageId = data.message_id;
        }
    } else {
        ctx.reply(`Привет ${userName}! Ты еще не зарегистрирован! Нажми /register, чтобы зарегистрироваться.`);
    }
    openMenu = true;
});

bot.command('help', async (ctx) => {
    newHomework.state = false;
    const userData = ctx.from;
    const userUserName = userData.username;
    const userName = userData.first_name;
    const dbData = await BotUserData.findOne({ userUserName: userUserName });
    if (dbData) {
        if (dbData.status === "admin") {
            if(openMenu){
                await ctx.deleteMessage();
                await ctx.deleteMessage(lastMessageId)
                const data = await ctx.reply(`Это главное меню`, mainMenuAdmin);
                lastMessageId = data.message_id;
            }else{
                await ctx.deleteMessage();
                const data = await ctx.reply(`Это главное меню`, mainMenuAdmin);
                lastMessageId = data.message_id;
            }
    }
        else {
            if(openMenu){
                lastMessageId = await ctx.editMessageText(`Это главное меню`, mainMenuUser);
            }else{
                ctx.deleteMessage(); 
                lastMessageId = await ctx.reply(`Это главное меню`, mainMenuUser);
            }
        }
    } else {
        if(openMenu){
            ctx.editMessageText(`Привет ${userName}! Ты еще не зарегистрирован! Нажми /register, чтобы зарегистрироваться.`);
        }else{
            ctx.deleteMessage();
            ctx.reply(`Привет ${userName}! Ты еще не зарегистрирован! Нажми /register, чтобы зарегистрироваться.`);
        }
    }
    openMenu = true;
});


bot.command('register', async (ctx) => {
    newHomework.state = false;
    const userData = ctx.from;
    const userUserName = userData.username;
    console.log(userUserName);

    try {
        const dbData = await BotUserData.findOne({ userUserName: userUserName });
        console.log(dbData);
        if (dbData) {
            ctx.reply(`Ты уже зарегистрирован!`);
        } else {
            console.log("yes");
            const newUser = new BotUserData({
                userUserName: userUserName,
                status: "user",
            });
            newUser.save();

            ctx.reply(`Ты зарегистрирован!`);
        }
        ctx.reply(`Нажми /help, чтобы узнать, что я умею.`);
    } catch (err) {
        console.error(err);
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
            //ctx.editMessageReplyMarkup(mainMenuAdmin); 
            //ctx.editMessageCaption("С чем я могу помочь?", mainMenuAdmin);
            ctx.editMessageText("С чем я могу помочь?", mainMenuAdmin);
        }
        else {
            ctx.editMessageText("С чем я могу помочь?", mainMenuUser);
        }
    } else {
        ctx.deleteMessage();
        ctx.reply(`Привет ${userName}! Ты еще не зарегистрирован! Нажми /register, чтобы зарегистрироваться.`);
    }
});

bot.hears("addMyHomework", async (ctx) => {
    // ctx.sendDice();
    //ctx.replyWithPhoto({ source: './public/images/favicon.png' });
    // ctx.telegram.sendMessage('@qwertyh345', 'Hi everyone')
    ctx.reply("Скоро будет");
});

bot.hears(buttonsText.mainMenu["addAllHomework"], (ctx) => {
    newHomework.state = true;
    calendar.startNavCalendar(ctx.message);
    //console.log(ctx.message);
    // const chooseSubject = generateSubjectInlineKeyboard(subjects);
    // console.log(chooseSubject.reply_markup.inline_keyboard);
});

bot.action("disHomework", async (ctx) => {
    newHomework.state = false;
    //ctx.deleteMessage(lastMessageId);
    //bot.telegram.editMessageText(ctx.chat.id, lastMessageId, null, "hi", chooseHwDayKeyboard);
    //ctx.editMessageText("На какой день?", chooseHwDayKeyboard, lastMessageId);
    ctx.editMessageText("На какой день?", chooseHwDayKeyboard); 
});

bot.action("hwAll", async (ctx) => {
    newHomework.state = false;
    const dbData = await BotHwInfo.find({});
    const dbComp = await BotHwComp.find({userUserName: ctx.from.username});
    const allHw = dbData.map((item) => item.messageId);

    const hwComplete = dbComp.map((item) => item.messageId);

    const displayHw = allHw.filter((item) => !hwComplete.includes(item));

    if(displayHw.length === 0){
        ctx.reply("Все дз выполнено! 🎉");
        return;
    }

    for (let i = 0; i < displayHw.length; i++) {
        const messgaeId = displayHw[i];

        const completeBtn = Markup.inlineKeyboard([
            Markup.button.callback("✅ Готово", `hwComplete_${messgaeId}`),
        ]);

        await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, messgaeId, completeBtn);
    }


    //console.log(dbData);
    //await ctx.telegram.copyMessage(ctx.chat.id, process.env.CHANNEL_ID, 15);
});


// actions
bot.action(/subject_(\d+)/, (ctx) => {
    if (newHomework.state) {
        const subjectId = ctx.match[1];
        const selectedSubject = subjects[subjectId];
        newHomework.subject = selectedSubject;
        newHomework.state = "readyToSend";

        const dateStr = newHomework.date;
        const [day, month, year] = dateStr.split('-').map(Number);
        const options = { weekday: 'long', month: 'long', day: 'numeric' };
        const displayDate = new Intl.DateTimeFormat('ru-RU', options).format(new Date(year, month - 1, day));

        ctx.editMessageText(`Предмет: ${newHomework.subject}\nДата: ${displayDate}\n\nНапиши следующим сообщением дз`);
        //ctx.telegram.sendMessage('@qwertyh345', `Новое дз ${newHomework.subject}\n${newHomework.date}`);
        // Add your logic for handling the selected subject
    } else {
        ctx.reply("Сначала нажми на кнопку Добавить дз всем");
    }
});

bot.action(/hwComplete_(\d+)/, (ctx) => {
    const messageId = ctx.match[1];
    ctx.deleteMessage();

    const completedHw = new BotHwComp({
        userUserName: ctx.from.username,
        messageId,
    });

    completedHw.save();
});


// calendar callback

bot.on("callback_query", (ctx) => {
    if (ctx.callbackQuery.message.message_id == calendar.chats.get(ctx.callbackQuery.message.chat.id)) {
        const res = calendar.clickButtonCalendar(ctx.callbackQuery);
        if (res !== -1) {
            newHomework.date = res;
            //bot.telegram.sendMessage(ctx.callbackQuery.message.chat.id, "You selected: " + res);
            ctx.reply('Please choose a subject:', chooseSubject);
        }
    }
});





// testing


bot.on('text', async (ctx) => {
    if (newHomework.state === "readyToSend") {
        const dateStr = newHomework.date;
        const [day, month, year] = dateStr.split('-').map(Number);
        const options = { weekday: 'long', month: 'long', day: 'numeric' };
        const displayDate = new Intl.DateTimeFormat('ru-RU', options).format(new Date(year, month - 1, day));

        const hwMessage = `⭐️${newHomework.subject}⭐️\n📅${displayDate}\n\nЗадание:\n${ctx.message.text}`;

        const messageData = await ctx.telegram.sendMessage(process.env.CHANNEL_ID, hwMessage);

        const messageID = messageData.message_id;

        const saveNewHomework = new BotHwInfo({
            messageId: messageID,
            subject: newHomework.subject,
            date: newHomework.date,
        });

        saveNewHomework.save();

    }
});

bot.on('photo', (ctx) => {
    console.log(ctx);
    //const photo = ctx.message.photo;
    // Process the photo message
    //const largestPhoto = photo[photo.length - 1];
    //ctx.reply(`You sent a photo with file_id: ${largestPhoto.file_id}`);
});


