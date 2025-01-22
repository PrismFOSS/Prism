/* --------------------------------------------- */
/* server:files_write                            */
/* --------------------------------------------- */

const express = require("express");
const axios = require("axios");
const { isAuthenticated, ownsServer, logActivity, PANEL_URL, API_KEY } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:files_write",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // POST /api/server/:id/files/write
  router.post("/server/:id/files/write", isAuthenticated, ownsServer, async (req, res) => {
    try {
      console.log('Saving ' + req.query.file + ' to server ' + req.params.id);
      const serverId = req.params.id;
      const file = req.query.file;
      const content = req.body;

      const response = await axios.post(
        `${PANEL_URL}/api/client/servers/${serverId}/files/write?file=${file}`,
        content,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
            "Content-Type": "text/plain",
          },
        }
      );

      // Log response status & text if error
      if (response.status !== 204) {
        console.error("Error writing file:", response.statusText);
        return res.status(response.status).json({ error: response.statusText });
      } else {
        await logActivity(db, serverId, 'Write File', { file });
        res.status(204).send();
      }

      await logActivity(db, serverId, 'Write File', { file });
      res.status(204).send();
    } catch (error) {
      console.error("Error writing file:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST /api/server/:id/files/create-folder
  router.post("/server/:id/files/create-folder", isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const { root, name } = req.body;

      if (!name) {
        return res.status(400).json({ error: 'Folder name is required' });
      }

      await axios.post(
        `${PANEL_URL}/api/client/servers/${serverId}/files/create-folder`,
        { root, name },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      await logActivity(db, serverId, 'Create Folder', { root, name });
      res.status(204).send();
    } catch (error) {
      console.error("Error creating folder:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // PUT /api/server/:id/files/rename
  router.put("/server/:id/files/rename", isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const { root, files } = req.body;

      if (!files || !Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: 'Files array is required' });
      }

      await axios.put(
        `${PANEL_URL}/api/client/servers/${serverId}/files/rename`,
        { root, files },
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            Accept: "application/json",
            "Content-Type": "application/json",
          },
        }
      );

      await logActivity(db, serverId, 'Rename Files', { root, files });
      res.status(204).send();
    } catch (error) {
      console.error("Error renaming file/folder:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.use("/api", router);
};