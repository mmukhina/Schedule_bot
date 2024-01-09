import mongoose, { Schema, model } from "mongoose";

const BotHwCompSchema = new Schema({
  userUserName: {
    type: String,
    required: true,
  },
  messageId: {
    type: Number,
    required: true,
  }
});

const BotHwComp = model("BotHwComp", BotHwCompSchema);

export default BotHwComp;
