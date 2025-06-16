const Message = require("../models/Message");
const WhatsAppClient = require("../models/WhatsAppClient");
const { getClient } = require("../helpers/create-client-helper");

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
  const { userId, number, message } = req.body;

  if (!userId || !number || !message) {
    return res
      .status(400)
      .json({ error: "userId, number, and message are required" });
  }

  try {
    // Get WhatsApp client state
    const state = await WhatsAppClient.findOne({ userId });

    if (!state || !state.isAuthenticated) {
      return res
        .status(400)
        .json({ error: "WhatsApp client not ready or not authenticated" });
    }

    // Get active client instance - CHANGED: Now using await since getClient is async
    const client = await getClient(userId);
    if (!client) {
      return res
        .status(400)
        .json({ error: "WhatsApp client instance not found" });
    }

    // Verify client state before sending message
    try {
      const clientState = await client.getState();
      if (clientState !== 'CONNECTED') {
        return res
          .status(400)
          .json({ error: `WhatsApp client is not connected. Current state: ${clientState}` });
      }
    } catch (stateError) {
      console.error("Error checking client state:", stateError);
      return res
        .status(400)
        .json({ error: "WhatsApp client connection error" });
    }

    // Format the chat ID
    const chatId = number.includes("@c.us") 
      ? number 
      : `${number.replace(/[^\d]/g, "")}@c.us`;

    // Send the message
    const result = await client.sendMessage(chatId, message);

    // Save the message to database
    const newMessage = await Message.create({
      userId,
      chatId,
      sender: "me",
      message,
      timestamp: new Date().toISOString(),
      createdAt: new Date(),
      messageId: result.id._serialized, // Store WhatsApp message ID
      status: "sent"
    });

    return res.status(200).json({
      success: true,
      message: "Message sent and saved successfully",
      data: newMessage
    });

  } catch (err) {
    console.error("Error sending message:", err);
    return res.status(500).json({ 
      error: "Failed to send WhatsApp message",
      details: err.message 
    });
  }
};