const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  userId: String,
  chatId: String,
  sender: String,
  message: String,
  timestamp: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Message", messageSchema);
