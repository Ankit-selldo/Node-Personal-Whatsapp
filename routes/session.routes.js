const express = require("express");
const { 
  connectSession, 
  logoutSession,
  getActiveSessions 
} = require("../controllers/session.controller");

const router = express.Router();

router.post("/connect", connectSession);
router.post("/logout", logoutSession);
router.get("/active-sessions", getActiveSessions);

module.exports = router;
