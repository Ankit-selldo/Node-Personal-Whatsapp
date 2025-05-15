const { Client, LocalAuth } = require("whatsapp-web.js");
const QRCode = require("qrcode");
const Message = require("../models/Message");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");

function createClient(userId, clients) {
  return new Promise((resolve, reject) => {
    const client = new Client({
      authStrategy: new LocalAuth({ clientId: userId }),
      puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    const state = { client, qr: null, isAuthenticated: false };
    clients.set(userId, state);

    client.on("qr", async (qr) => {
      console.log(`QR for ${userId}`);
      qrcode.generate(qr, { small: true });
      try {
        state.qr = await QRCode.toDataURL(qr);
        resolve(state.qr);
      } catch (err) {
        reject("QR Code generation failed");
      }
    });

    client.on("authenticated", async () => {
      console.log(`Authenticated: ${userId}`);
      try {
        await axios.post(
          "http://localhost:8888/client/personal-whatsapps/notify.json",
          {
            userId,
            status: "success",
          }
        );

        clients.set(userId, {
          ...state,
          isAuthenticated: true,
          qr: null,
        });
      } catch (error) {
        console.log("Error during authentication:", error.message);
      }
    });
    client.on("loading_screen", async () => {
      console.log(`Loading screen for ${userId}`);
      try {
        await axios.post(
          "http://localhost:8888/client/personal-whatsapps/notify.json",
          {
            userId,
            status: "loading",
          }
        );
      } catch (error) {
        console.log("Error during loading screen:", error.message);
      }
    });

    client.on("auth_failure", async (message) => {
      console.log(`Authentication failure for ${userId}: ${message}`);
      axios.post("http://localhost:8888/client/personal-whatsapps/notify.json", {
        userId,
        status: "failed",
        message: "Failed to authenticate, Please try again",
      });
      state.isAuthenticated = false;
      state.qr = null;
    });

    client.on("message_create", async (message) => {
      const { from, fromMe, body, timestamp } = message;
      console.log(message);
      const messageData = {
        userId,
        chatId: from,
        sender: fromMe ? "me" : from,
        message: body,
        timestamp: new Date(timestamp * 1000).toLocaleString(),
        createdAt: new Date(timestamp * 1000),
      };
      try {
        const res = await Message.create(messageData);
        console.log("Message saved:", res);
      } catch (err) {
        console.error("Error saving message:", err);
      }
    });

    client.on("disconnected", async (reason) => {
      console.log(`Client: ${userId} disconnected`, reason);

      axios.post("http://localhost:8888/client/personal-whatsapps/notify.json", {
        userId,
        status: "disconnect",
        message: "Client disconnected",
      });

      try {
        await client.destroy();

        const authDir = path.join(".wwebjs_auth", `session-${userId}`);
        if (fs.existsSync(authDir)) {
          fs.rmSync(authDir, { recursive: true, force: true });
        }

        clients.delete(userId);
      } catch (error) {
        console.error(
          "Error cleaning up auth directory or destroying the client session:",
          error.message
        );
      }
    });

    client.initialize();
  });
}

module.exports = {
  createClient,
};
