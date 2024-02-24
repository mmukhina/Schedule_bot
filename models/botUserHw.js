import mongoose, { Schema, model } from "mongoose";

const botUserHwSchema = new Schema({
    userUserName: {
        type: String,
        required: true,
    },
    message: {
        type: String,
        required: true,
    },
    date: {
        type: String,
        required: true,
    },
});

const BotUserHw = model("BotUserHw", botUserHwSchema);

export default BotUserHw;