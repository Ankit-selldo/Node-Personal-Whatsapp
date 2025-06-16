const WhatsAppSession = require('../models/WhatsAppSession');

class Store {
  constructor() {}

  async sessionExists(options) {
    try {
      console.log(`[Store] Checking session existence for: ${options.session}`);
      const session = await WhatsAppSession.findOne({ 
        userId: options.session,
        data: { $exists: true, $ne: null }
      });
      const exists = !!session;
      console.log(`[Store] Session exists for ${options.session}: ${exists}`);
      return exists;
    } catch (error) {
      console.error('[Store] Error checking session existence:', error); 
      return false;
    }
  }

  async save(options) {
    try {
      const { session } = options;
      console.log(`[Store] Attempting to save session for: ${session}`);
      
      // Don't save if session is invalid
      if (session === 'RemoteAuth' || !session || session.includes('undefined')) {
        console.log(`[Store] Invalid session identifier: ${session}, skipping save`);
        return;
      }

      // Get the session data from the options directly (RemoteAuth passes it)
      let sessionData = options.sessionData;
      
      // If no session data in options, return early
      if (!sessionData) {
        console.log(`[Store] No session data provided for ${session}`);
        return;
      }

      console.log(`[Store] Saving session data for ${session}`, {
        dataKeys: Object.keys(sessionData),
        dataSize: JSON.stringify(sessionData).length
      });

      // Update or create the session
      const updatedSession = await WhatsAppSession.findOneAndUpdate(
        { userId: session },
        {
          userId: session,
          sessionId: `session_${session}_${Date.now()}`,
          data: sessionData,
          state: { 
            status: 'AUTHENTICATED',
            lastAuthenticatedAt: new Date()
          },
          lastUpdate: new Date()
        },
        { upsert: true, new: true }
      );

      console.log(`[Store] Session saved successfully for user: ${session}`);
    } catch (error) {
      console.error('[Store] Error saving session:', error);
      // Don't throw error to prevent crashes
    }
  }

  async extract(options) {
    try {
      const { session } = options;
      console.log(`[Store] Extracting session data for: ${session}`);
      
      // Don't extract if session is invalid
      if (session === 'RemoteAuth' || !session || session.includes('undefined')) {
        console.log(`[Store] Invalid session identifier: ${session}, returning null`);
        return null;
      }
      
      const sessionRecord = await WhatsAppSession.findOne({ userId: session });
      const hasData = !!sessionRecord?.data;
      console.log(`[Store] Session data found for ${session}: ${hasData}`);
      if (hasData) {
        console.log(`[Store] Session data keys:`, Object.keys(sessionRecord.data));
      }
      return sessionRecord?.data || null;
    } catch (error) {
      console.error('[Store] Error extracting session:', error);
      return null;
    }
  }

  async delete(options) {
    try {
      const { session } = options;
      console.log(`[Store] Deleting session for: ${session}`);
      
      if (session === 'RemoteAuth' || !session || session.includes('undefined')) {
        console.log(`[Store] Invalid session identifier: ${session}, skipping delete`);
        return;
      }
      
      await WhatsAppSession.findOneAndUpdate(
        { userId: session },
        { 
          $unset: { data: 1 },
          state: { status: 'DELETED' },
          lastUpdate: new Date()
        }
      );
      console.log(`[Store] Session deleted for: ${session}`);
    } catch (error) {
      console.error('[Store] Error deleting session:', error);
    }
  }

  async getActiveSessions() {
    try {
      return await WhatsAppSession.find(
        {},
        { sessionId: 1, userId: 1, lastUpdate: 1, _id: 0 }
      ).sort({ lastUpdate: -1 });
    } catch (error) {
      console.error('Error getting active sessions:', error);
      return [];
    }
  }

  async restoreSession(userId) {
    try {
      console.log(`[Store] Attempting to restore session for: ${userId}`);
      const session = await WhatsAppSession.findOne({ 
        userId,
        data: { $exists: true, $ne: null }
      });

      if (!session) {
        console.log(`[Store] No session found for user: ${userId}`);
        return null;
      }

      if (!session.data || Object.keys(session.data).length === 0) {
        console.log(`[Store] Session found but has no valid data for user: ${userId}`);
        return null;
      }

      console.log(`[Store] Found valid session for user: ${userId}`, {
        state: session.state,
        dataKeys: Object.keys(session.data)
      });
      return session.data;
    } catch (error) {
      console.error('[Store] Error restoring session:', error);
      return null;
    }
  }
}

module.exports = Store;