/* --------------------------------------------- */
/* server:players_ban                            */
/* --------------------------------------------- */

const express = require("express");
const { isAuthenticated, ownsServer, sendCommandAndGetResponse, logActivity } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:players_ban",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // Kick player
  router.post('/server/:id/players/:player/kick', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const { id: serverId, player } = req.params;
      const { reason = 'You have been kicked from the server' } = req.body;

      await sendCommandAndGetResponse(serverId, `kick ${player} ${reason}`, 2000);
      await logActivity(db, serverId, 'Kick Player', { player, reason });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error kicking player:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Ban player
  router.post('/server/:id/players/:player/ban', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const { id: serverId, player } = req.params;
      const { reason = 'You have been banned from the server' } = req.body;

      await sendCommandAndGetResponse(serverId, `ban ${player} ${reason}`, 2000);
      await logActivity(db, serverId, 'Ban Player', { player, reason });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error banning player:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Unban player
  router.post('/server/:id/players/:player/unban', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const { id: serverId, player } = req.params;

      await sendCommandAndGetResponse(serverId, `pardon ${player}`, 2000);
      await logActivity(db, serverId, 'Unban Player', { player });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Error unbanning player:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Get banned players list
  router.get('/server/:id/players/banned', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const consoleLines = await sendCommandAndGetResponse(serverId, 'banlist');
      
      // Parse banned players from console output
      const bannedPlayers = [];
      let collectingBans = false;
      
      for (const line of consoleLines) {
        if (line.includes('Banned players:')) {
          collectingBans = true;
          continue;
        }
        
        if (collectingBans && line.trim()) {
          const players = line.split(',').map(p => p.trim()).filter(p => p);
          bannedPlayers.push(...players);
        }
      }

      res.json({ bannedPlayers });
    } catch (error) {
      console.error('Error getting banned players:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use("/api", router);
};