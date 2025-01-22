/* --------------------------------------------- */
/* server:allocations                            */
/* --------------------------------------------- */

const express = require("express");
const axios = require("axios");
const { isAuthenticated, ownsServer, PANEL_URL, API_KEY } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:allocations",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // Get server allocations
  router.get('/server/:id/allocations', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;

      // Fetch allocations from Pterodactyl Panel
      const response = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/network/allocations`, 
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      // Transform Pterodactyl's response to the expected format
      const allocations = response.data.data.map(allocation => ({
        id: allocation.attributes.id,
        ip: allocation.attributes.ip,
        port: allocation.attributes.port,
        is_primary: allocation.attributes.primary,
        alias: allocation.attributes.alias || null,
      }));

      res.json(allocations);
    } catch (error) {
      console.error('Error fetching allocations:', error);
      res.status(500).json({ 
        error: 'Failed to fetch allocations', 
        details: error.response?.data || error.message 
      });
    }
  });

  // Add new allocation
  router.post('/server/:id/allocations', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;

      const response = await axios.post(
        `${PANEL_URL}/api/client/servers/${serverId}/network/allocations`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      // Transform the new allocation to match the expected format
      const newAllocation = {
        id: response.data.attributes.id,
        ip: response.data.attributes.ip,
        port: response.data.attributes.port,
        is_primary: response.data.attributes.primary,
        alias: response.data.attributes.alias || null,
      };

      res.status(201).json(newAllocation);
    } catch (error) {
      console.error('Error adding allocation:', error);
      res.status(500).json({ 
        error: 'Failed to add allocation', 
        details: error.response?.data || error.message 
      });
    }
  });

  // Remove allocation
  router.delete('/server/:id/allocations/:allocationId', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const { id: serverId, allocationId } = req.params;

      await axios.delete(
        `${PANEL_URL}/api/client/servers/${serverId}/network/allocations/${allocationId}`,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      res.status(200).json({ message: 'Allocation removed successfully' });
    } catch (error) {
      console.error('Error removing allocation:', error);
      res.status(500).json({ 
        error: 'Failed to remove allocation', 
        details: error.response?.data || error.message 
      });
    }
  });

  app.use("/api", router);
};