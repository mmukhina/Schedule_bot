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
            domain: process.env.DOMAIN,// Your domain URL (where server code will be deployed)
            port: process.env.PORT || 8000
        }
    });
}

try {
    mongoose.connect(process.env.MONGODB_LINK).catch((err) => console.error(err.message));
    console.log("Connected to MongoDB");
    dbconnection = true;
} catch (err) {
    console.error(err);
    throw new Error("Unable to connect to MongoDB");
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
        if (openMenu) {
            await ctx.deleteMessage();
            const data = await ctx.reply(`Привет ${userName}! Я бот, который поможет тебе с твоим расписанием. Напиши /help, чтобы узнать, что я умею.`);
            lastMessageId = data.message_id;
        } else {
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
            if (openMenu) {
                await ctx.deleteMessage();
                await ctx.deleteMessage(lastMessageId)
                const data = await ctx.reply(`Это главное меню`, mainMenuAdmin);
                lastMessageId = data.message_id;
            } else {
                await ctx.deleteMessage();
                const data = await ctx.reply(`Это главное меню`, mainMenuAdmin);
                lastMessageId = data.message_id;
            }
        }
        else {
            if (openMenu) {
                lastMessageId = await ctx.editMessageText(`Это главное меню`, mainMenuUser);
            } else {
                ctx.deleteMessage();
                lastMessageId = await ctx.reply(`Это главное меню`, mainMenuUser);
            }
        }
    } else {
        if (openMenu) {
            ctx.editMessageText(`Привет ${userName}! Ты еще не зарегистрирован! Нажми /register, чтобы зарегистрироваться.`);
        } else {
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

bot.action("addAllHomework", (ctx) => {
    newHomework.state = true;
    ctx.editMessageText('Please choose a subject:', chooseSubject);
    //calendar.startNavCalendar(ctx.message);

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
    const dbComp = await BotHwComp.find({ userUserName: ctx.from.username });

    const allHw = dbData.map((item) => item.messageId);

    const manyFiles = {};

    for (let i = 0; i < dbData.length; i++) {
        const messageId = dbData[i].messageId;
        const files = dbData[i].manyfiles;

        manyFiles[messageId] = files;
    }

    const hwComplete = dbComp.map((item) => item.messageId);

    const displayHw = allHw.filter((item) => !hwComplete.includes(item));

    if (displayHw.length === 0) {
        // ctx.deleteMessage();
        ctx.reply("Все дз выполнено! 🎉");
        return;
    }

    for (let i = 0; i < displayHw.length; i++) {
        const messageId = displayHw[i];
        console.log(messageId);

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
        //const displayDate = new Intl.DateTimeFormat('ru-RU', options).format(new Date(year, month - 1, day));

        const displayDate = "later";

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
        messageId
    });

    completedHw.save();
});

bot.action("allHomeworkSent", (ctx) => {
    calendar.startNavCalendar({ chat: { id: 957574111 } });
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
            //bot.telegram.sendMessage(ctx.callbackQuery.message.chat.id, "You selected: " + res);
            //ctx.reply('Please choose a subject:', chooseSubject);

            const dateStr = res;
            const [day, month, year] = dateStr.split('-').map(Number);
            const options = { weekday: 'long', month: 'long', day: 'numeric' };
            const displayDate = new Intl.DateTimeFormat('ru-RU', options).format(new Date(year, month - 1, day));

            const hwMessage = `⭐️${newHomework.subject}⭐️\n📅${displayDate}\n\nЗадание:\n${newHomework.message}`;

            //const messageData = await ctx.telegram.sendMessage(process.env.CHANNEL_ID, hwMessage);

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
                console.log(newHomework.messageId);
            }

            if (numberOfPhotos > 1 || numberOfDocuments > 1) {
                newHomework.manyfiles = true;
            }

            //const messageId = await ctx.replyWithMediaGroup(media);
            //console.log(messageId);


            //const messageID = messageData.message_id;

            const saveNewHomework = new BotHwInfo({
                messageId: newHomework.messageId,
                subject: newHomework.subject,
                date: newHomework.date,
                manyfiles: newHomework.manyfiles
            });

            saveNewHomework.save();


        }
    }
});

bot.hears("hi", async (ctx) => {
    //await ctx.telegram.forwardMessage(ctx.chat.id, process.env.CHANNEL_ID, "33");
    //await ctx.telegram.forwardMessage(ctx.chat.id, process.env.CHANNEL_ID, "36");
    //await ctx.telegram.sendMediaGroup(ctx.chat.id, "13650999618122365");

    // get the document id 
    const data = await ctx.telegram.forwardMessage(ctx.chat.id, process.env.CHANNEL_ID, "36");
    console.log(data);
});



bot.on('text', async (ctx) => {
    if (newHomework.state === "readyToSend") {
        if (newHomework.message === "") {
            newHomework.message = ctx.message.text;
        } else {
            newHomework.message = `${newHomework.message}\n${ctx.message.text}`;
        }
        await ctx.reply("Записал! Нажми на кнопку 👇 если это все", allHomeworkSent);
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
            //newHomework.donePhotoId.push((await ctx.reply("Фото добавлено! Нажми на кнопку 👇 если это все", allHomeworkSent)).message_id);
            await ctx.reply("Фото добавлено! Нажми на кнопку 👇 если это все", allHomeworkSent);
            //await ctx.deleteMessage(newHomework.donePhotoId.shift());
        }
        //newHomework.donePhotoId = data.message_id;
        //console.log(donePhotoId);
        //calendar.startNavCalendar(ctx.message);

        /*
        if (newHomework.photo.length === 3) {
            const media = [
                { type: 'photo', media: newHomework.photo[0] },
                { type: 'photo', media: newHomework.photo[1] },
                { type: 'photo', media: newHomework.photo[2] , caption: "yes"},
            ];

            const messageId = await ctx.replyWithMediaGroup(media);
            console.log(messageId);

        }
        */

    }

    //console.log(ctx.message);

    //const fileId = ctx.message.photo[0].file_id;
    //console.log(fileId);

    //ctx.replyWithPhoto(fileId);


    //ctx.replyWithPhoto(message.photo.pop().file_id);
    //const photo = ctx.message.photo;
    // Process the photo message
    //const largestPhoto = photo[photo.length - 1];
    //ctx.reply(`You sent a photo with file_id: ${largestPhoto.file_id}`);
});


/*

bot.on('message', (ctx) => {
    // Check if the message contains photos
    if (ctx.message.photo && ctx.message.photo.length > 1) {
      const numberOfPhotos = ctx.message.photo.length;
      console.log(`User sent ${numberOfPhotos} photos`);
  
      // Handle the scenario where the user sent multiple photos
      // You can access the file_id or other properties of each photo in the array
      ctx.reply(`Thanks for sending ${numberOfPhotos} photos!`);
    } else {
      // Handle other types of messages or single photos
      ctx.reply('Please send multiple photos.');
    }
  });

  */



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
            //newHomework.donePhotoId.push((await ctx.reply("Фото добавлено! Нажми на кнопку 👇 если это все", allHomeworkSent)).message_id);
            await ctx.reply("Документ добавлен! Нажми на кнопку 👇 если это все", allHomeworkSent);
            //await ctx.deleteMessage(newHomework.donePhotoId.shift());
        }
    }
    //ctx.reply(`You sent a file with name: ${file.file_name}`);
});