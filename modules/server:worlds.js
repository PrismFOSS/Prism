/* --------------------------------------------- */
/* server:worlds                                 */
/* --------------------------------------------- */

const express = require("express");
const axios = require("axios");
const { isAuthenticated, ownsServer, logActivity, PANEL_URL, API_KEY } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:worlds",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // Helper function to get world type
  function getWorldType(worldName, defaultWorld) {
    if (worldName === defaultWorld) return 'default';
    if (worldName === `${defaultWorld}_nether`) return 'nether';
    if (worldName === `${defaultWorld}_the_end`) return 'end';
    return 'custom';
  }

  // Helper function to check if directory is a valid world
  async function isValidWorld(fileData, serverId) {
    try {
      if (fileData.attributes.mimetype !== "inode/directory" || 
          fileData.attributes.name.startsWith('.')) {
        return false;
      }

      if (fileData.attributes.name.endsWith('_nether') || 
          fileData.attributes.name.endsWith('_the_end')) {
        return true;
      }

      const worldContents = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/files/list`,
        {
          params: { directory: `/${fileData.attributes.name}` },
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      return worldContents.data.data.some(file => 
        file.attributes.name === 'level.dat' && 
        !file.attributes.mimetype.startsWith('inode/')
      );
    } catch (error) {
      console.error(`Error checking if ${fileData.attributes.name} is a valid world:`, error);
      return false;
    }
  }

  // List worlds endpoint
  router.get('/server/:id/worlds', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      
      // Get server.properties to find level-name
      const serverPropsResponse = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/files/contents`,
        {
          params: { file: '/server.properties' },
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      const serverProps = serverPropsResponse.data
        .split('\n')
        .reduce((acc, line) => {
          const [key, value] = line.split('=');
          if (key && value) acc[key.trim()] = value.trim();
          return acc;
        }, {});

      const defaultWorld = serverProps['level-name'] || 'world';

      // List contents of root directory
      const response = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/files/list`,
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      // Filter for world folders
      const fl = await Promise.all(
        response.data.data.map(async (folder) => {
          const isWorld = await isValidWorld(folder, serverId);
          return isWorld ? folder : null;
        })
      );

      const worldFolders = fl.filter(folder => folder !== null);

      // Get tracked custom worlds from database
      const trackedWorlds = await db.get(`worlds-${serverId}`) || [];
      const trackedWorldNames = new Set(trackedWorlds);

      // Categorize worlds
      const worlds = {
        default: null,
        nether: null,
        end: null,
        custom: []
      };

      for (const folder of worldFolders) {
        const worldName = folder.attributes.name;
        const worldType = getWorldType(worldName, defaultWorld);
        
        const worldData = {
          attributes: {
            ...folder.attributes,
            type: worldType,
            isCustom: trackedWorldNames.has(worldName)
          }
        };

        if (worldType === 'custom') {
          worlds.custom.push(worldData);
        } else {
          worlds[worldType] = worldData;
        }
      }

      res.json(worlds);
    } catch (error) {
      console.error('Error listing worlds:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Delete world endpoint
  router.delete('/server/:id/worlds/:worldName', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const { id: serverId, worldName } = req.params;

      // Get server.properties to check if trying to delete default world
      const serverPropsResponse = await axios.get(
        `${PANEL_URL}/api/client/servers/${serverId}/files/contents`,
        {
          params: { file: '/server.properties' },
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      const serverProps = serverPropsResponse.data
        .split('\n')
        .reduce((acc, line) => {
          const [key, value] = line.split('=');
          if (key && value) acc[key.trim()] = value.trim();
          return acc;
        }, {});

      const defaultWorld = serverProps['level-name'] || 'world';

      // Prevent deletion of default world and its dimensions
      if (worldName === defaultWorld ||
          worldName === `${defaultWorld}_nether` ||
          worldName === `${defaultWorld}_the_end`) {
        return res.status(400).json({ error: 'Cannot delete default world or its dimensions' });
      }

      // Delete the world folder
      await axios.post(
        `${PANEL_URL}/api/client/servers/${serverId}/files/delete`,
        {
          root: '/',
          files: [worldName]
        },
        {
          headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Accept': 'application/json',
          },
        }
      );

      // Remove from tracked worlds
      const trackedWorlds = await db.get(`worlds-${serverId}`) || [];
      const updatedWorlds = trackedWorlds.filter(w => w !== worldName);
      await db.set(`worlds-${serverId}`, updatedWorlds);

      await logActivity(db, serverId, 'Delete World', { worldName });
      res.json({ success: true });
    } catch (error) {
      console.error('Error deleting world:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use("/api", router);
};