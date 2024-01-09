import mongoose, { Schema, model } from "mongoose";

const botUserDataSchema = new Schema({
  userUserName: {
    type: String,
    required: true,
    unique: true,
  },
  status: {
    type: String,
    required: true,
  }
});

const BotUserData = model("BotUserData", botUserDataSchema);

export default BotUserData;
