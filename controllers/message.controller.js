const { getClient } = require("../helpers/create-client-helper");
const Message = require("../models/Message");
const WhatsAppClient = require("../models/WhatsAppClient");

exports.getMessages = async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "userId is required" });

  try {
    const messages = await Message.find({ userId })
      .sort({ createdAt: -1 })
      .limit(40);
    return res.json(messages);
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch messages" });
  }
};

exports.sendMessage = async (req, res) => {
  const { userId, number, message, sender } = req.body;

  if (!userId || !number || !message || !sender) {
    return res
      .status(400)
      .json({ error: "userID, number, message, and sender are required" });
  }

  const state = await WhatsAppClient.findOne({ userId });

  if (!state || !state.isAuthenticated) {
    return res
      .status(400)
      .json({ error: "WhatsApp client not ready or not authenticated" });
  }

  try {
    const chatId = number.includes("@c.us") 
      ? number 
      : `${number.replace(/[^\d]/g, "")}@c.us`;

    console.log("Sending message to chatId:", chatId);
    const client = await getClient(userId);
    await client.sendMessage(chatId, message);

    const newMessage = new Message({
      userId,
      chatId,
      sender,
      message,
      timestamp: new Date().toISOString(),
    });

    await newMessage.save();

    return res.status(200).json({
      success: true,
      msg: "Message sent and saved",
      data: newMessage,
    });
  } catch (err) {
    console.error("Error sending message:", err);
    return res.status(500).json({ error: "Failed to send WhatsApp message" });
  }
};
