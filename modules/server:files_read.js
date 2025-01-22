/* --------------------------------------------- */
/* server:files_read                             */
/* --------------------------------------------- */

const express = require("express");
const axios = require("axios");
const { isAuthenticated, ownsServer, PANEL_URL, API_KEY } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:files_read",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // GET /api/server/:id/files/contents
  router.get("/server/:id/files/contents", isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const file = encodeURIComponent(req.query.file); // URL-encode the file path
      
      const response = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/files/contents?file=${file}`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          responseType: "text", // Treat the response as plain text
        }
      );

      // Send the raw file content back to the client
      res.send(response.data);
    } catch (error) {
      console.error("Error getting file contents:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/server/:id/files/download
  router.get("/server/:id/files/download", isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const file = req.query.file;
      
      const response = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/files/download`,
        {
          params: { file },
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );
      
      res.json(response.data);
    } catch (error) {
      console.error("Error getting download link:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.use("/api", router);
};