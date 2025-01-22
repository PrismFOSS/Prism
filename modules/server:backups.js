/* --------------------------------------------- */
/* server:backups                                */
/* --------------------------------------------- */

const express = require("express");
const axios = require("axios");
const { isAuthenticated, ownsServer, PANEL_URL, API_KEY } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:backups",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // GET /api/server/:id/backups - List backups
  router.get("/server/:id/backups", isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const response = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/backups`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error("Error fetching backups:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/server/:id/backups - Create backup
  router.post("/server/:id/backups", isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const response = await axios.post(
        `${PANEL_URL}/api/client/servers/${serverId}/backups`,
        {},
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );
      res.status(201).json(response.data);
    } catch (error) {
      console.error("Error creating backup:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/server/:id/backups/:backupId/download - Get backup download URL
  router.get(
    "/server/:id/backups/:backupId/download",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const backupId = req.params.backupId;
        const response = await axios.get(
          `${PANEL_URL}/api/client/servers/${serverId}/backups/${backupId}/download`,
          {
            headers: {
              Authorization: `Bearer ${API_KEY}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        res.json(response.data);
      } catch (error) {
        console.error("Error generating backup download link:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  // DELETE /api/server/:id/backups/:backupId - Delete backup
  router.delete(
    "/server/:id/backups/:backupId",
    isAuthenticated,
    ownsServer,
    async (req, res) => {
      try {
        const serverId = req.params.id;
        const backupId = req.params.backupId;
        await axios.delete(
          `${PANEL_URL}/api/client/servers/${serverId}/backups/${backupId}`,
          {
            headers: {
              Authorization: `Bearer ${API_KEY}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
          }
        );
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting backup:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    }
  );

  app.use("/api", router);
};