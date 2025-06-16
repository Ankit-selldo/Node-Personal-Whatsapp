const WhatsAppClient = require("../models/WhatsAppClient");
const WhatsAppSession = require("../models/WhatsAppSession");
const { createClient } = require("../helpers/create-client-helper");

exports.connectSession = async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: "userId is required" });

  try {
    // Check if user already exists
    let state = await WhatsAppClient.findOne({ userId });
    let session = await WhatsAppSession.findOne({ userId });

    // If no state exists, this is a new user
    if (!state) {
      const qr = await createClient(userId, false);
      return res.json({ status: "pending", qr });
    }

    // If user exists but session is logged out from WhatsApp
    if (session?.state?.status === 'DISCONNECTED' || state.sessionStatus === 'DISCONNECTED') {
      // Clear existing session data
      await WhatsAppSession.findOneAndUpdate(
        { userId },
        { $unset: { data: 1 }, state: { status: 'NEW' } }
      );
      
      // Update client state
      await WhatsAppClient.findOneAndUpdate(
        { userId },
        {
          isAuthenticated: false,
          qr: null,
          sessionStatus: 'ACTIVE'
        }
      );

      // Create new client instance
      const qr = await createClient(userId, false);
      return res.json({ status: "pending", qr });
    }

    // If user exists and was manually logged out (but not from WhatsApp)
    if (state.sessionStatus === 'LOGGED_OUT' && session?.data) {
      try {
        await createClient(userId, true); // try to restore session
        state = await WhatsAppClient.findOneAndUpdate(
          { userId },
          { 
            sessionStatus: 'ACTIVE',
            isActive: true,
            lastActive: new Date()
          },
          { new: true }
        );
        return res.json({ status: "restored", message: "Session restored successfully" });
      } catch (err) {
        console.error("Failed to restore session:", err);
        // If restoration fails, proceed with new QR code
        const qr = await createClient(userId, false);
        return res.json({ status: "pending", qr });
      }
    }

    // Return existing session status
    if (state.isAuthenticated) {
      return res.json({ status: "authenticated" });
    }
    if (state.qr) {
      return res.json({ status: "pending", qr: state.qr });
    }

    // If none of the above conditions match, create new session
    const qr = await createClient(userId, false);
    return res.json({ status: "pending", qr });
  } catch (err) {
    console.error("Session connection error:", err);
    return res.status(500).json({ error: "Failed to handle session" });
  }
};

exports.logoutSession = async (req, res) => {
  const { userId } = req.body;

  if (!userId) return res.status(400).json({ error: "userId is required" });

  try {
    const state = await WhatsAppClient.findOne({ userId });
    
    if (!state) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Update session status but keep the session data
    await WhatsAppClient.findOneAndUpdate(
      { userId },
      { 
        isActive: false,
        sessionStatus: 'LOGGED_OUT',
        lastActive: new Date()
      }
    );

    return res.json({ 
      status: "success", 
      message: "Logged out successfully. Session preserved for future login." 
    });
  } catch (err) {
    console.error("Logout error:", err);
    return res.status(500).json({ error: "Failed to logout" });
  }
};

exports.getActiveSessions = async (req, res) => {
  try {
    const sessions = await WhatsAppClient.find(
      { isAuthenticated: true },
      { userId: 1, sessionStatus: 1, lastActive: 1, _id: 0 }
    );
    return res.json(sessions);
  } catch (err) {
    console.error("Error fetching sessions:", err);
    return res.status(500).json({ error: "Failed to fetch active sessions" });
  }
};