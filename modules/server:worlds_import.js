/* --------------------------------------------- */
/* server:worlds_import                          */
/* --------------------------------------------- */

const express = require("express");
const axios = require("axios");
const { isAuthenticated, ownsServer, logActivity, PANEL_URL, API_KEY } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:worlds_import",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // Import world preparation endpoint
  router.post('/server/:id/worlds/import', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const { worldName } = req.body;

      if (!worldName) {
        return res.status(400).json({ error: 'World name is required' });
      }

      // Create temp directory if it doesn't exist
      try {
        await axios.post(
          `${PANEL_URL}/api/client/servers/${serverId}/files/create-folder`,
          {
            root: '/',
            name: 'temp'
          },
          {
            headers: {
              'Authorization': `Bearer ${API_KEY}`,
              'Accept': 'application/json',
            },
          }
        );
      } catch (error) {
        // Ignore error if folder already exists
      }

      // Get upload URL
      const uploadUrlResponse = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/files/upload`,
        {
          params: { directory: '/temp' },
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      res.json({
        url: uploadUrlResponse.data.attributes.url,
        worldName: worldName
      });
    } catch (error) {
      console.error('Error preparing world import:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Complete world import endpoint
  router.post('/server/:id/worlds/import/complete', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const { worldName, fileName } = req.body;

      if (!worldName || !fileName) {
        return res.status(400).json({ error: 'World name and file name are required' });
      }

      // Move zip to temp directory
      await axios.put(
        `${PANEL_URL}/api/client/servers/${serverId}/files/rename`,
        {
          root: '/',
          files: [
            {
              from: fileName,
              to: `temp/${fileName}`
            }
          ]
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      // Decompress the zip in temp directory
      await axios.post(
        `${PANEL_URL}/api/client/servers/${serverId}/files/decompress`,
        {
          root: '/temp',
          file: fileName
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      // Delete the zip file
      await axios.post(
        `${PANEL_URL}/api/client/servers/${serverId}/files/delete`,
        {
          root: '/temp',
          files: [fileName]
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      // List contents of temp directory
      const tempContents = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/files/list`,
        {
          params: { directory: '/temp' },
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      // Create the final world directory
      await axios.post(
        `${PANEL_URL}/api/client/servers/${serverId}/files/create-folder`,
        {
          root: '/',
          name: worldName
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      // Move files to final location
      const items = tempContents.data.data;
      if (items.length === 1 && items[0].attributes.mimetype === "inode/directory") {
        // If there's a single directory, move its contents
        const srcDirName = items[0].attributes.name;
        const srcContents = await axios.get(
          `${PANEL_URL}/api/client/servers/${serverId}/files/list`,
          {
            params: { directory: `/temp/${srcDirName}` },
            headers: {
              'Authorization': `Bearer ${API_KEY}`,
              'Accept': 'application/json',
            },
          }
        );

        // Move each file/folder from the source directory
        for (const item of srcContents.data.data) {
          await axios.put(
            `${PANEL_URL}/api/client/servers/${serverId}/files/rename`,
            {
              root: `/temp/${srcDirName}`,
              files: [
                {
                  from: item.attributes.name,
                  to: `../../${worldName}/${item.attributes.name}`
                }
              ]
            },
            {
              headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json',
              },
            }
          );
        }
      } else {
        // Move all files directly
        for (const item of items) {
          await axios.put(
            `${PANEL_URL}/api/client/servers/${serverId}/files/rename`,
            {
              root: '/temp',
              files: [
                {
                  from: item.attributes.name,
                  to: `../${worldName}/${item.attributes.name}`
                }
              ]
            },
            {
              headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json',
              },
            }
          );
        }
      }

      // Clean up temp directory
      await axios.post(
        `${PANEL_URL}/api/client/servers/${serverId}/files/delete`,
        {
          root: '/',
          files: ['temp']
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      // Track the imported world in database
      const trackedWorlds = await db.get(`worlds-${serverId}`) || [];
      if (!trackedWorlds.includes(worldName)) {
        trackedWorlds.push(worldName);
        await db.set(`worlds-${serverId}`, trackedWorlds);
      }

      await logActivity(db, serverId, 'Import World', { worldName });
      res.json({ success: true });
    } catch (error) {
      console.error('Error completing world import:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use("/api", router);
};