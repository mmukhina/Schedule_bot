import mongoose, { Schema, model } from "mongoose";

const BotHwInfoSchema = new Schema({
  messageId: {
    type: Number,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  date: {
    type: String,
    required: true,
  },
  manyfiles: {
    type: Boolean,
    required: true,
  },
});

const BotHwInfo = model("BotHwInfo", BotHwInfoSchema);

export default BotHwInfo;
