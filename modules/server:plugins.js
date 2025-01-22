/* --------------------------------------------- */
/* server:plugins                                */
/* --------------------------------------------- */

const express = require("express");
const axios = require("axios");
const FormData = require("form-data");
const { isAuthenticated, ownsServer, PANEL_URL, API_KEY } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:plugins",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();
  
  const SPIGOT_API_BASE = "https://api.spiget.org/v2";

  // GET /api/plugins/list - List plugins
  router.get("/plugins/list", async (req, res) => {
    try {
      const response = await axios.get(`${SPIGOT_API_BASE}/resources`, {
        params: {
          size: 100,
          sort: "-downloads", // Sort by most downloaded
        },
      });
      res.json(response.data);
    } catch (error) {
      console.error("Error fetching plugin list:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // GET /api/plugins/search - Search plugins
  router.get("/plugins/search", async (req, res) => {
    const { query } = req.query;
    if (!query) {
      return res.status(400).json({ error: "Search query is required" });
    }

    try {
      const response = await axios.get(
        `${SPIGOT_API_BASE}/search/resources/${query}`,
        {
          params: {
            size: 100,
            sort: "-downloads",
          },
        }
      );
      res.json(response.data);
    } catch (error) {
      console.error("Error searching plugins:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/plugins/install/:serverId - Install plugin
  router.post("/plugins/install/:serverId", isAuthenticated, ownsServer, async (req, res) => {
    const { serverId } = req.params;
    const { pluginId } = req.body;

    if (!pluginId) {
      return res.status(400).json({ error: "Plugin ID is required" });
    }

    try {
      // Get plugin details
      const pluginDetails = await axios.get(
        `${SPIGOT_API_BASE}/resources/${pluginId}`
      );
      const downloadUrl = `https://api.spiget.org/v2/resources/${pluginId}/download`;

      // Download the plugin
      const pluginResponse = await axios.get(downloadUrl, {
        responseType: "arraybuffer",
      });
      const pluginBuffer = Buffer.from(pluginResponse.data, "binary");

      // Get upload URL from Pterodactyl
      const uploadUrlResponse = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/files/upload`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
          },
        }
      );

      const uploadUrl = uploadUrlResponse.data.attributes.url;

      // Upload plugin using multipart/form-data
      const form = new FormData();
      const tempFileName = `temp_${Date.now()}_${pluginId}.jar`;
      form.append("files", pluginBuffer, {
        filename: tempFileName,
        contentType: "application/java-archive",
      });

      const headers = form.getHeaders();
      await axios.post(uploadUrl, form, {
        headers: {
          ...headers,
          "Content-Length": form.getLengthSync(),
        },
      });

      // Move plugin to plugins directory
      await axios.put(
        `${PANEL_URL}/api/client/servers/${serverId}/files/rename`,
        {
          root: "/",
          files: [
            {
              from: tempFileName,
              to: `plugins/${pluginDetails.data.name}.jar`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
          },
        }
      );

      res.json({ message: "Plugin installed successfully" });
    } catch (error) {
      console.error("Error installing plugin:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.use("/api", router);
};