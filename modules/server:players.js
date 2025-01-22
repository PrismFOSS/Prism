/* --------------------------------------------- */
/* server:players                                */
/* --------------------------------------------- */

const express = require("express");
const { isAuthenticated, ownsServer, sendCommandAndGetResponse } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:players",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // Get current players
  router.get('/server/:id/players', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      
      const consoleLines = await sendCommandAndGetResponse(serverId, 'list');
      
      // Parse player list from console output
      const playerListLine = consoleLines.find(line => line.includes('players online:'));
      let players = [];
      
      if (playerListLine) {
        const match = playerListLine.match(/There are \d+ of a max of \d+ players online: (.*)/);
        if (match && match[1]) {
          players = match[1].split(',').map(p => p.trim()).filter(p => p);
        }
      }

      res.json({ players });
    } catch (error) {
      console.error('Error getting player list:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use("/api", router);
};