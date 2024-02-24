import mongoose, { Schema, model } from "mongoose";

const botUserDataSchema = new Schema({
  userUserName: {
    type: String,
    required: true,
    unique: true,
  },
  name: {
    type: String,
  },
  status: {
    type: String,
    required: true,
  }
});

const BotUserData = model("BotUserData", botUserDataSchema);

export default BotUserData;
