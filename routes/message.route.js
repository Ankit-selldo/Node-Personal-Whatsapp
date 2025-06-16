const express = require("express");
const {
  getMessages,
  sendMessage,
} = require("../controllers/message.controller");

const router = express.Router();

router.get("/:userId", getMessages);
router.post("/send", sendMessage);

module.exports = router;
