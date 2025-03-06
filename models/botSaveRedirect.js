import mongoose, { Schema, model } from "mongoose";

const BotSaveRedirectSchema = new Schema({
  messageId: {
    type: Number,
    required: true,
  },
  fromChatId: {
    type: Number,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
});

const BotSaveRedirect = model("BotSaveRedirect", BotSaveRedirectSchema);

export default BotSaveRedirect;