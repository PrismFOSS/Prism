/* --------------------------------------------- */
/* server:users_legacy                           */
/* --------------------------------------------- */

const express = require("express");
const { isAuthenticated } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:users_legacy",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // GET /api/subuser-servers - List servers where user is a subuser
  router.get('/subuser-servers', isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.pterodactyl.username;
      let subuserServers = await db.get(`subuser-servers-${userId}`) || [];
      res.json(subuserServers);
    } catch (error) {
      console.error('Error fetching subuser servers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/sync-user-servers - Sync user's servers and subuser permissions
  router.post('/subuser-servers-sync', isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.pterodactyl.id;
      
      // Add the current user to the all_users list
      await addUserToAllUsersList(userId);

      // Sync owned servers
      const ownedServers = req.session.pterodactyl.relationships.servers.data;
      for (const server of ownedServers) {
        await updateSubuserInfo(server.attributes.identifier, userId);
      }

      // Fetch and sync subuser servers
      const subuserServers = await db.get(`subuser-servers-${userId}`) || [];
      for (const server of subuserServers) {
        await updateSubuserInfo(server.id, server.ownerId);
      }

      res.json({ message: 'User servers synced successfully' });
    } catch (error) {
      console.error('Error syncing user servers:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  async function addUserToAllUsersList(userId) {
    let allUsers = await db.get('all_users') || [];
    if (!allUsers.includes(userId)) {
      allUsers.push(userId);
      await db.set('all_users', allUsers);
    }
  }

  app.use("/api", router);
};