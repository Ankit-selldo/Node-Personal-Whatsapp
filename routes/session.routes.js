const express = require("express");
const {
  connectSession,
  checkSessionStatus,
} = require("../controllers/session.controller");

const router = express.Router();

router.post("/connect", connectSession);
router.get("/details", checkSessionStatus);

module.exports = router;
