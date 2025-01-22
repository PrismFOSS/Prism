/* --------------------------------------------- */
/* server:variables                              */
/* --------------------------------------------- */

const express = require("express");
const axios = require("axios");
const { isAuthenticated, ownsServer, PANEL_URL, API_KEY } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:variables",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // GET /api/server/:id/variables - Get server variables
  router.get('/server/:id/variables', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const response = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/startup`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: 'application/json',
          },
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error('Error fetching server variables:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // PUT /api/server/:id/variables - Update server variable
  router.put('/server/:id/variables', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const { key, value } = req.body;

      if (!key || value === undefined) {
        return res.status(400).json({ error: 'Missing key or value' });
      }

      const response = await axios.put(
        `${PANEL_URL}/api/client/servers/${serverId}/startup/variable`,
        { key, value },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error('Error updating server variable:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use("/api", router);
};