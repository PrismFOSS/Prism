/* --------------------------------------------- */
/* server:users                                  */
/* --------------------------------------------- */

const express = require("express");
const axios = require("axios");
const { isAuthenticated, ownsServer, PANEL_URL, API_KEY } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:users",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // GET /api/server/:id/users - List users
  router.get('/server/:id/users', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const response = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/users`,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );
      
      await updateSubuserInfo(serverId, req.session.userinfo.id);
      
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching users:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // POST /api/server/:id/users - Create user
  router.post('/server/:id/users', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const response = await axios.post(
        `${PANEL_URL}/api/client/servers/${serverId}/users`,
        { 
          email, 
          permissions: [
            "control.console", "control.start", "control.stop", "control.restart",
            "user.create", "user.read", "user.update", "user.delete",
            "file.create", "file.read", "file.update", "file.delete",
            "file.archive", "file.sftp", "backup.create", "backup.read",
            "backup.delete", "backup.update", "backup.download",
            "allocation.update", "startup.update", "startup.read",
            "database.create", "database.read", "database.update",
            "database.delete", "database.view_password", "schedule.create",
            "schedule.read", "schedule.update", "settings.rename",
            "schedule.delete", "settings.reinstall", "websocket.connect"
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      await updateSubuserInfo(serverId, req.session.userinfo.id);
      await addUserToAllUsersList(response.data.attributes.username);

      res.status(201).json(response.data);
    } catch (error) {
      console.error('Error creating user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // DELETE /api/server/:id/users/:userId - Delete user
  router.delete('/server/:id/users/:userId', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const { id: serverId, userId } = req.params;
      await axios.delete(
        `${PANEL_URL}/api/client/servers/${serverId}/users/${userId}`,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting user:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Helper functions
  async function updateSubuserInfo(serverId, serverOwnerId) {
    try {
      const response = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/users`,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      const subusers = response.data.data.map(user => ({
        id: user.attributes.username,
        username: user.attributes.username,
        email: user.attributes.email,
      }));

      await db.set(`subusers-${serverId}`, subusers);

      const serverName = await getServerName(serverId);
      for (const subuser of subusers) {
        let subuserServers = await db.get(`subuser-servers-${subuser.id}`) || [];
        if (!subuserServers.some(server => server.id === serverId)) {
          subuserServers.push({
            id: serverId,
            name: serverName,
            ownerId: serverOwnerId
          });
          await db.set(`subuser-servers-${subuser.id}`, subuserServers);
        }
      }
    } catch (error) {
      console.error(`Error updating subuser info:`, error);
    }
  }

  async function getServerName(serverId) {
    try {
      const response = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}`,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );
      return response.data.attributes.name;
    } catch (error) {
      return 'Unknown Server';
    }
  }

  async function addUserToAllUsersList(userId) {
    let allUsers = await db.get('all_users') || [];
    if (!allUsers.includes(userId)) {
      allUsers.push(userId);
      await db.set('all_users', allUsers);
    }
  }

  app.use("/api", router);
};