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

    // Check if client exists in activeClients but verify it's actually connected
    // Check if client exists in activeClients but verify it's actually connected
const { getClient } = require("../helpers/create-client-helper");
const activeClient = await getClient(userId);

// If client claims to be authenticated but no active client exists, it's disconnected
if (state && state.isAuthenticated && !activeClient) {
  console.log(`[connectSession] Client ${userId} claims authenticated but no active instance found - marking as disconnected`);
  
  // Update database to reflect actual disconnection
  await Promise.all([
    WhatsAppClient.findOneAndUpdate(
      { userId },
      {
        isAuthenticated: false,
        isActive: false,
        sessionStatus: 'DISCONNECTED',
        qr: null,
        lastActive: new Date()
      }
    ),
    WhatsAppSession.findOneAndUpdate(
      { userId },
      {
        state: { 
          status: 'DISCONNECTED', 
          reason: 'Client instance not found',
          disconnectedAt: new Date()
        },
        lastUpdate: new Date()
      }
    )
  ]);
  
  // Create new client instance
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
    if (state.sessionStatus === 'LOGGED_OUT' && session?.data && activeClient) {
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

    // Return existing session status only if client is actually active
    if (state.isAuthenticated && activeClient) {
      return res.json({ status: "authenticated" });
    }
    if (state.qr && !state.isAuthenticated) {
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