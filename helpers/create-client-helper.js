const axios = require("axios");
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const { Client, RemoteAuth } = require("whatsapp-web.js");
const Store = require("./store");

const Message = require("../models/Message");
const WhatsAppClient = require("../models/WhatsAppClient");
const WhatsAppSession = require("../models/WhatsAppSession");

// Add a map to store active clients
const activeClients = new Map();

// Create a new WhatsApp client instance
async function createClient(userId, isRestoring = false) {
  return new Promise(async (resolve, reject) => {
    try {
      console.log(`[createClient] Starting client creation for user ${userId} (isRestoring: ${isRestoring})`);
      
      // Step 1: Check existing state
      const [existingClient, existingSession] = await Promise.all([
        WhatsAppClient.findOne({ userId }),
        WhatsAppSession.findOne({ userId })
      ]);

      console.log(`[createClient] Current state for ${userId}:`, {
        clientExists: !!existingClient,
        clientState: existingClient ? {
          isAuthenticated: existingClient.isAuthenticated,
          isActive: existingClient.isActive,
          sessionStatus: existingClient.sessionStatus
        } : null,
        sessionExists: !!existingSession,
        hasSessionData: !!existingSession?.data
      });

      // Step 2: Handle already authenticated case
      if (existingClient?.isAuthenticated && 
          existingClient?.isActive && 
          existingClient?.sessionStatus === 'ACTIVE' && 
          existingSession?.data && 
          activeClients.has(userId)) {
        console.log(`[createClient] Client ${userId} is already authenticated and active`);
        return resolve(null);
      }

      // Step 3: Clean up any existing client
      if (activeClients.has(userId)) {
        console.log(`[createClient] Cleaning up existing client for ${userId}`);
        const oldClient = activeClients.get(userId);
        try {
          await oldClient.destroy();
        } catch (error) {
          console.error(`[createClient] Error destroying old client for ${userId}:`, error);
        }
        activeClients.delete(userId);
      }

      // Step 4: Initialize store and check for session data
      const store = new Store();
      let sessionData = null;
      
      if (isRestoring && existingSession?.data) {
        console.log(`[createClient] Attempting to restore session for ${userId}`);
        sessionData = await store.restoreSession(userId);
        
        if (!sessionData) {
          console.log(`[createClient] No valid session data found for ${userId}, falling back to new session`);
          isRestoring = false;
        } else {
          console.log(`[createClient] Found valid session data for ${userId}`, {
            dataExists: true,
            dataKeys: Object.keys(sessionData)
          });
        }
      }

      // Step 5: Create new client instance
      console.log(`[createClient] Creating new WhatsApp client for ${userId}`);
      const client = new Client({
        authStrategy: new RemoteAuth({
          store: store,
          backupSyncIntervalMs: 300000,
          session: userId
        }),
        puppeteer: {
          headless: true,
          args: ["--no-sandbox", "--disable-setuid-sandbox"],
        },
      });

      // Step 6: Initialize client state
      activeClients.set(userId, client);
      console.log(`[createClient] Added client to activeClients map for ${userId}`);

      await Promise.all([
        WhatsAppClient.findOneAndUpdate(
          { userId },
          {
            userId,
            isAuthenticated: false,
            isActive: true,
            sessionStatus: 'INITIALIZING',
            lastActive: new Date(),
            updatedAt: new Date()
          },
          { upsert: true }
        ),
        WhatsAppSession.findOneAndUpdate(
          { userId },
          {
            userId,
            sessionId: `session_${userId}_${Date.now()}`,
            state: { status: 'INITIALIZING' },
            lastUpdate: new Date()
          },
          { upsert: true }
        )
      ]);

      // Step 7: Set up event handlers
      let authenticationResolved = false;
      let qrCodeGenerated = false;

      client.on("qr", async (qr) => {
        console.log(`[createClient] QR event received for ${userId}`);
        if (authenticationResolved) {
          console.log(`[createClient] Authentication already resolved for ${userId}, ignoring QR`);
          return;
        }

        qrCodeGenerated = true;
        qrcode.generate(qr, { small: true });
        
        try {
          const qrUrl = await QRCode.toDataURL(qr);
          await WhatsAppClient.findOneAndUpdate(
            { userId },
            { 
              qr: qrUrl,
              isAuthenticated: false,
              sessionStatus: 'ACTIVE',
              lastActive: new Date()
            }
          );
          console.log(`[createClient] QR code generated and saved for ${userId}`);
          resolve(qrUrl);
        } catch (err) {
          console.error(`[createClient] QR generation failed for ${userId}:`, err);
          reject(new Error("QR Code generation failed"));
        }
      });

      client.on("ready", async () => {
        console.log(`[createClient] Client ready event received for ${userId}`);
        authenticationResolved = true;
        
        // Update client state to reflect readiness
        await WhatsAppClient.findOneAndUpdate(
          { userId },
          {
            isAuthenticated: true,
            isActive: true,
            sessionStatus: 'ACTIVE',
            qr: null,
            lastActive: new Date()
          }
        );
      });

      client.on("authenticated", async () => {
        console.log(`[createClient] Authentication successful for ${userId}`);
        authenticationResolved = true;

        try {
          // First update the client state
          await WhatsAppClient.findOneAndUpdate(
            { userId },
            {
              isAuthenticated: true,
              isActive: true,
              sessionStatus: 'ACTIVE',
              qr: null,
              lastActive: new Date()
            }
          );

          console.log(`[createClient] Updated client state for ${userId}`);

          // Then extract and save session data
          const sessionData = await store.extract({ session: userId });
          if (!sessionData) {
            console.error(`[createClient] No session data found after authentication for ${userId}`);
            return reject(new Error("No session data found after authentication"));
          }

          console.log(`[createClient] Extracted session data for ${userId}`, {
            dataExists: true,
            dataKeys: Object.keys(sessionData),
            dataSize: JSON.stringify(sessionData).length
          });

          // Save session data and wait for it to complete
          await store.save({ session: userId });
          
          // Verify the session was saved
          const savedSession = await WhatsAppSession.findOne({ userId });
          console.log(`[createClient] Verified saved session for ${userId}:`, {
            exists: !!savedSession,
            hasData: !!savedSession?.data,
            dataKeys: savedSession?.data ? Object.keys(savedSession.data) : [],
            state: savedSession?.state
          });

          if (!savedSession?.data) {
            console.error(`[createClient] Session verification failed for ${userId}`);
            return reject(new Error("Session verification failed after save"));
          }

          console.log(`[createClient] Successfully completed authentication flow for ${userId}`);
          
          // Only resolve if we haven't already resolved with a QR code
          if (!qrCodeGenerated) {
            resolve(null);
          }
        } catch (error) {
          console.error(`[createClient] Error during authentication for ${userId}:`, error);
          reject(error);
        }
      });

      // Initialize the client
      await client.initialize();

    } catch (error) {
      console.error(`[createClient] Error creating client for ${userId}:`, error);
      reject(error);
    }
  });
}

// Cleanup function to remove invalid sessions
async function cleanupInvalidSessions() {
  try {
    // Remove any sessions with invalid IDs
    await WhatsAppSession.deleteMany({
      $or: [
        { sessionId: 'RemoteAuth' },
        { sessionId: { $regex: /[^a-zA-Z0-9_-]/ } }
      ]
    });
    
    // Remove any sessions without valid data
    await WhatsAppSession.deleteMany({
      $or: [
        { data: null },
        { data: {} }
      ]
    });
  } catch (error) {
    console.error('Error cleaning up invalid sessions:', error);
  }
}

// Reset all sessions (temporary function for debugging)
async function resetAllSessions() {
  try {
    console.log("Resetting all sessions...");
    
    await Promise.all([
      WhatsAppSession.deleteMany({}),
      WhatsAppClient.deleteMany({})
    ]);
    
    console.log("All sessions have been reset");
  } catch (error) {
    console.error("Error resetting sessions:", error);
  }
}

// Restore all active sessions
async function restoreSessions() {
  try {
    console.log("[restoreSessions] Starting session restoration...");
    
    // Get all sessions with valid data
    const sessions = await WhatsAppSession.find({
      $and: [
        // Must have session data
        { data: { $exists: true, $ne: null } },
        
        // Must have a valid session ID
        { 
          sessionId: { 
            $ne: 'RemoteAuth',
            $regex: /^[a-zA-Z0-9_-]+$/
          }
        }
      ]
    });

    console.log(`[restoreSessions] Found ${sessions.length} sessions with data`);

    // Log session details for debugging
    for (const session of sessions) {
      console.log(`[restoreSessions] Session details for ${session.userId}:`, {
        sessionId: session.sessionId,
        state: session.state,
        hasData: !!session.data,
        dataKeys: Object.keys(session.data || {}),
        lastUpdate: session.lastUpdate
      });
    }

    for (const session of sessions) {
      try {
        // Check if client is already active
        const existingClient = await WhatsAppClient.findOne({ 
          userId: session.userId,
          isAuthenticated: true,
          isActive: true,
          sessionStatus: 'ACTIVE'
        });

        if (existingClient && activeClients.has(session.userId)) {
          console.log(`[restoreSessions] Client ${session.userId} is already active, skipping restoration`);
          continue;
        }

        // Remove any existing client instance
        if (activeClients.has(session.userId)) {
          console.log(`[restoreSessions] Removing existing client instance for ${session.userId}`);
          const oldClient = activeClients.get(session.userId);
          try {
            await oldClient.destroy();
          } catch (error) {
            console.error(`[restoreSessions] Error destroying old client for ${session.userId}:`, error);
          }
          activeClients.delete(session.userId);
        }

        console.log(`[restoreSessions] Attempting to restore session for user: ${session.userId}`);
        await createClient(session.userId, true);
        console.log(`[restoreSessions] Successfully initiated restoration for ${session.userId}`);
        
        // Wait a bit before processing the next session
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error(
          `[restoreSessions] Failed to restore session for user ${session.userId}:`,
          error.message
        );
        
        // Update session status on failure
        await Promise.all([
          WhatsAppSession.findOneAndUpdate(
            { userId: session.userId },
            {
              state: { 
                status: 'FAILED_RESTORE', 
                error: error.message,
                lastAttempt: new Date()
              },
              lastUpdate: new Date()
            }
          ),
          WhatsAppClient.findOneAndUpdate(
            { userId: session.userId },
            {
              isAuthenticated: false,
              isActive: false,
              sessionStatus: 'DISCONNECTED',
              updatedAt: new Date()
            }
          )
        ]);
      }
    }
  } catch (error) {
    console.error("[restoreSessions] Error restoring sessions:", error);
  }
}

// Get an active client instance
function getClient(userId) {
  return activeClients.get(userId);
}

module.exports = {
  createClient,
  restoreSessions,
  getClient,
  cleanupInvalidSessions,
  resetAllSessions  // Export for debugging
};