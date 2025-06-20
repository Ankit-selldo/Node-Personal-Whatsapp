const WhatsAppClient = require("../models/WhatsAppClient");
const { createClient } = require("../helpers/create-client-helper");

exports.connectSession = async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: "userId is required" });
  console.log("Connecting session for userId:", userId);

  let state = await WhatsAppClient.findOne({ userId });
  console.log("Current session state:", state);

  if (state) {
    if (state.isAuthenticated) {
      console.log("User is already authenticated");
      return res.json({ status: "authenticated" });
    }
    if (state.qr) {
      console.log("Session is pending, returning existing QR code");
      return res.json({ status: "pending", qr: state.qr });
    }
  }

  try {
    console.log("Creating new client for userId:", userId);
    const qr = await createClient(userId);
    return res.json({ status: "pending", qr });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to generate QR" });
  }
};

exports.checkSessionStatus = async (req, res) => {
  console.log("Checking session status...");
  console.log("Request query:", req.query); // Correct log for query parameters
  const { userId } = req.query;

  if (!userId) {
    console.log("userId is missing in the request query");
    return res.status(400).json({ error: "userId is required" });
  }

  const lead = await WhatsAppClient.findOne({ userId });

  if (!lead) {
    console.log("No session found for userId:", userId);
    return res.status(404).json({ error: "Session not found" });
  }

  console.log("Session status:", { authenticated: lead.isAuthenticated });
  return res.status(200).json({ authenticated: lead.isAuthenticated });
};
