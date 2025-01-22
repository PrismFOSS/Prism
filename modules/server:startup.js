/* --------------------------------------------- */
/* server:startup                                */
/* --------------------------------------------- */

const express = require("express");
const axios = require("axios");
const { isAuthenticated, ownsServer, PANEL_URL, API_KEY } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:startup",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // PUT /api/server/:id/startup - Update startup configuration
  router.put('/server/:serverId/startup', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.serverId;
      const { startup, environment, egg, image, skip_scripts } = req.body;

      // First, get the current server details
      const serverDetailsResponse = await axios.get(
        `${PANEL_URL}/api/application/servers/${serverId}?include=container`,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      const currentServerDetails = serverDetailsResponse.data.attributes;

      // Prepare the update payload
      const updatePayload = {
        startup: startup || currentServerDetails.container.startup_command,
        environment: environment || currentServerDetails.container.environment,
        egg: egg || currentServerDetails.egg,
        image: image || currentServerDetails.container.image,
        skip_scripts: skip_scripts !== undefined ? skip_scripts : false,
      };

      // Send the update request
      const response = await axios.patch(
        `${PANEL_URL}/api/application/servers/${serverId}/startup`,
        updatePayload,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      res.json(response.data);
    } catch (error) {
      console.error('Error updating server startup:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use("/api", router);
};