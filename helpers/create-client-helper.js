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

function ensureWwebjsDirectories() {
  const baseAuthDir = path.join(process.cwd(), '.wwebjs_auth');
  const undefinedDir = path.join(baseAuthDir, 'wwebjs_temp_session_undefined', 'Default');

  try {
    // Create the directories if they don't exist
    if (!fs.existsSync(undefinedDir)) {
      fs.mkdirSync(undefinedDir, { recursive: true });
      console.log('[Fix] Created missing wwebjs directories to prevent crash');
    }
  } catch (error) {
    console.log('[Fix] Could not create directories, but continuing...');
  }
}

function ensureAuthDirectory() {
  const authDir = path.join(process.cwd(), '.wwebjs_auth');
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
    console.log('[createClient] Created .wwebjs_auth directory');
  }
}

// Create a new WhatsApp client instance
async function createClient(userId, isRestoring = false) {
  return new Promise(async (resolve, reject) => {
    try {

      ensureWwebjsDirectories();
      ensureAuthDirectory();  

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
      // Step 5: Create new client instance
    // Step 5: Create new client instance
    console.log(`[createClient] Creating new WhatsApp client for ${userId}`);
    const client = new Client({
    authStrategy: new RemoteAuth({
    store: store,
    backupSyncIntervalMs: 300000,
    session: userId
    // Remove dataPath - let WhatsApp handle it automatically
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
          // Update client state
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
      
          // Only resolve if we haven't already resolved with a QR code
          if (!qrCodeGenerated) {
            resolve(null);
          }
        } catch (error) {
          console.error(`[createClient] Error during authentication for ${userId}:`, error);
          if (!qrCodeGenerated) {
            resolve(null);
          }
        }
      });
      // Add these event handlers after the "authenticated" event handler in createClient function

      client.on("ready", async () => {
        console.log(`[createClient] Client ready event received for ${userId}`);
        
        try {
          // Now save the session when client is fully ready
          setTimeout(async () => {
            try {
              // The session data will be available now
              console.log(`[createClient] Attempting to save session for ready client ${userId}`);
              await store.save({ session: userId });
              
              const savedSession = await WhatsAppSession.findOne({ userId });
              console.log(`[createClient] Session save attempt completed for ${userId}:`, {
                exists: !!savedSession,
                hasData: !!savedSession?.data
              });
            } catch (saveError) {
              console.error(`[createClient] Error saving session for ${userId}:`, saveError);
            }
          }, 3000); // Wait 3 seconds for session to be fully established
          
        } catch (error) {
          console.error(`[createClient] Error in ready event for ${userId}:`, error);
        }
      });

// NEW: Add disconnection event handler
client.on("disconnected", async (reason) => {
  console.log(`[createClient] Client disconnected for ${userId}:`, reason);
  
  // Update database to reflect disconnection
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
          reason: reason,
          disconnectedAt: new Date()
        },
        lastUpdate: new Date()
      }
    )
  ]);

  // Remove from active clients
  if (activeClients.has(userId)) {
    activeClients.delete(userId);
    console.log(`[createClient] Removed disconnected client ${userId} from activeClients`);
  }
});

// NEW: Add authentication failure event handler
client.on("auth_failure", async (message) => {
  console.log(`[createClient] Authentication failed for ${userId}:`, message);
  
  // Update database to reflect auth failure
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
          status: 'AUTH_FAILED', 
          error: message,
          failedAt: new Date()
        },
        lastUpdate: new Date()
      }
    )
  ]);

  // Remove from active clients
  if (activeClients.has(userId)) {
    activeClients.delete(userId);
    console.log(`[createClient] Removed failed auth client ${userId} from activeClients`);
  }
});

client.on("auth_failure", async (message) => {
  console.log(`[createClient] Authentication failed for ${userId}:`, message);
  
  // Update database to reflect auth failure
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
          status: 'AUTH_FAILED', 
          error: message,
          failedAt: new Date()
        },
        lastUpdate: new Date()
      }
    )
  ]);

  // Remove from active clients
  if (activeClients.has(userId)) {
    activeClients.delete(userId);
    console.log(`[createClient] Removed failed auth client ${userId} from activeClients`);
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
// Replace the existing getClient function
// UPDATED: Get an active client instance with connection verification
async function getClient(userId) {
  const client = activeClients.get(userId);
  if (!client) return null;
  
  try {
    // Verify client is actually connected
    const state = await client.getState();
    if (state !== 'CONNECTED') {
      console.log(`[getClient] Client ${userId} is not in CONNECTED state:`, state);
      
      // Update database and remove from active clients
      await Promise.all([
        WhatsAppClient.findOneAndUpdate(
          { userId },
          {
            isAuthenticated: false,
            isActive: false,
            sessionStatus: 'DISCONNECTED',
            lastActive: new Date()
          }
        ),
        WhatsAppSession.findOneAndUpdate(
          { userId },
          {
            state: { 
              status: 'DISCONNECTED', 
              reason: `Client state: ${state}`,
              disconnectedAt: new Date()
            },
            lastUpdate: new Date()
          }
        )
      ]);
      
      activeClients.delete(userId);
      return null;
    }
    
    return client;
  } catch (error) {
    console.log(`[getClient] Error checking client ${userId} state:`, error.message);
    
    // Client is likely disconnected, clean up
    await Promise.all([
      WhatsAppClient.findOneAndUpdate(
        { userId },
        {
          isAuthenticated: false,
          isActive: false,
          sessionStatus: 'DISCONNECTED',
          lastActive: new Date()
        }
      ),
      WhatsAppSession.findOneAndUpdate(
        { userId },
        {
          state: { 
            status: 'DISCONNECTED', 
            reason: error.message,
            disconnectedAt: new Date()
          },
          lastUpdate: new Date()
        }
      )
    ]);
    
    activeClients.delete(userId);
    return null;
  }
}
// Function to check if a client is actually connected
async function isClientConnected(userId) {
  const client = activeClients.get(userId);
  if (!client) return false;
  
  try {
    // Try to get client state - this will fail if disconnected
    const state = await client.getState();
    return state === 'CONNECTED';
  } catch (error) {
    console.log(`[isClientConnected] Client ${userId} connection check failed:`, error.message);
    return false;
  }
}

module.exports = {
  createClient,
  restoreSessions,
  getClient,
  cleanupInvalidSessions,
  resetAllSessions,
  isClientConnected // Export for debugging
};