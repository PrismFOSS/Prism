const express = require('express');
const rateLimit = require('express-rate-limit');
const loadConfig = require('../handlers/config');
const settings = loadConfig('./config.toml');
const fetch = require('node-fetch');
const getPteroUser = require('../handlers/getPteroUser');
const log = require('../handlers/log');

// Ensure Pterodactyl domain is properly formatted
if (settings.pterodactyl?.domain?.slice(-1) === '/') {
    settings.pterodactyl.domain = settings.pterodactyl.domain.slice(0, -1);
}

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
    name: "server:worlds",
    api_level: 3,
    target_platform: "0.5.0",
  };
  
module.exports.PrismModule = PrismModule;

// Rate limiters
const createServerLimiter = rateLimit({
    windowMs: 3000, // 3 seconds
    max: 1,
    message: { error: 'Too many server creation requests. Please wait 3 seconds.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Helper functions
async function checkUserResources(userId, db, additionalResources = { ram: 0, disk: 0, cpu: 0 }) {
    const packageName = await db.get(`package-${userId}`);
    const package = settings.api.client.packages.list[packageName || settings.api.client.packages.default];
    const extra = await db.get(`extra-${userId}`) || { ram: 0, disk: 0, cpu: 0, servers: 0 };
    
    const userServers = await getPteroUser(userId, db);
    if (!userServers) throw new Error('Failed to fetch user servers');

    const usage = userServers.attributes.relationships.servers.data.reduce((acc, server) => ({
        ram: acc.ram + server.attributes.limits.memory,
        disk: acc.disk + server.attributes.limits.disk,
        cpu: acc.cpu + server.attributes.limits.cpu,
        servers: acc.servers + 1
    }), { ram: 0, disk: 0, cpu: 0, servers: 0 });

    return {
        allowed: {
            ram: package.ram + extra.ram,
            disk: package.disk + extra.disk,
            cpu: package.cpu + extra.cpu,
            servers: package.servers + extra.servers
        },
        used: usage,
        remaining: {
            ram: (package.ram + extra.ram) - (usage.ram + additionalResources.ram),
            disk: (package.disk + extra.disk) - (usage.disk + additionalResources.disk),
            cpu: (package.cpu + extra.cpu) - (usage.cpu + additionalResources.cpu),
            servers: (package.servers + extra.servers) - usage.servers
        }
    };
}

// Main module export
module.exports.load = async function (app, db) {
    const router = express.Router();
    
    // Middleware to check authentication
    router.use((req, res, next) => {
        if (!req.session.pterodactyl) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        next();
    });

    router.get('/eggs', async (req, res) => {
        try {
          // Get package name for restriction checking
          const packageName = await db.get(`package-${req.session.userinfo.id}`);
          const userPackage = settings.api.client.packages.list[packageName || settings.api.client.packages.default];
    
          // Filter and format eggs
          const eggs = Object.entries(settings.api.client.eggs).map(([id, egg]) => {
            // Check if egg is restricted to specific packages
            if (egg.package && !egg.package.includes(packageName || settings.api.client.packages.default)) {
              return null;
            }
    
            return {
              id,
              name: egg.display || id,
              description: egg.description,
              minimum: {
                ram: egg.minimum?.ram || 0,
                disk: egg.minimum?.disk || 0,
                cpu: egg.minimum?.cpu || 0
              },
              maximum: egg.maximum || null,
              info: egg.info || {},
              startup: egg.info?.startup || '',
              image: egg.info?.image || '',
              requirements: {
                ram: Math.max(egg.minimum?.ram || 0, 1),
                disk: Math.max(egg.minimum?.disk || 0, 1),
                cpu: Math.max(egg.minimum?.cpu || 0, 1)
              }
            };
          }).filter(Boolean);
    
          res.json(eggs);
        } catch (error) {
          console.error('Error fetching eggs:', error);
          res.status(500).json({ error: 'Failed to fetch eggs' });
        }
      });
    
      // GET /api/locations - List all available locations
      router.get('/locations', async (req, res) => {
        try {
          // Get package name for restriction checking
          const packageName = await db.get(`package-${req.session.userinfo.id}`);
          const userPackage = settings.api.client.packages.list[packageName || settings.api.client.packages.default];
    
          // Filter and format locations
          const locations = Object.entries(settings.api.client.locations).map(([id, location]) => {
            // Check if location is restricted to specific packages
            if (location.package && !location.package.includes(packageName || settings.api.client.packages.default)) {
              return null;
            }
    
            return {
              id,
              name: location.name || id,
              description: location.description,
              full: location.full || false,
              flags: location.flags || []
            };
          }).filter(Boolean);
    
          res.json(locations);
        } catch (error) {
          console.error('Error fetching locations:', error);
          res.status(500).json({ error: 'Failed to fetch locations' });
        }
      });

    // GET /api/resources - Get user's resource usage and limits
    router.get('/resources', async (req, res) => {
      try {
          // Get package information
          const packageName = await db.get(`package-${req.session.userinfo.id}`);
          const package = settings.api.client.packages.list[packageName || settings.api.client.packages.default];
          
          // Get extra resources
          const extra = await db.get(`extra-${req.session.userinfo.id}`) || {
              ram: 0,
              disk: 0,
              cpu: 0,
              servers: 0
          };

          // Get current resource usage
          const resources = await checkUserResources(req.session.userinfo.id, db);

          // Calculate percentages
          const percentages = {
              ram: (resources.used.ram / (package.ram + extra.ram)) * 100,
              disk: (resources.used.disk / (package.disk + extra.disk)) * 100,
              cpu: (resources.used.cpu / (package.cpu + extra.cpu)) * 100,
              servers: (resources.used.servers / (package.servers + extra.servers)) * 100
          };

          res.json({
              package: {
                  name: packageName || settings.api.client.packages.default,
                  ...package
              },
              extra,
              current: {
                  ...resources.used,
                  percentages
              },
              limits: {
                  ...resources.allowed
              },
              remaining: {
                  ...resources.remaining
              }
          });
      } catch (error) {
          console.error('Error fetching resources:', error);
          res.status(500).json({ error: 'Failed to fetch resource information' });
      }
  });

    // GET /api/servers - List all servers
    router.get('/servers', async (req, res) => {
        try {
            const user = await getPteroUser(req.session.userinfo.id, db);
            if (!user) {
                return res.status(404).json({ error: 'User not found' });
            }
            res.json(user.attributes.relationships.servers.data);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch servers' });
        }
    });

    // GET /api/servers/:id - Get specific server
    router.get('/server/:id', async (req, res) => {
        try {
            const user = await getPteroUser(req.session.userinfo.id, db);
            const server = user.attributes.relationships.servers.data.find(
                s => s.attributes.id === req.params.id
            );
            
            if (!server) {
                return res.status(404).json({ error: 'Server not found' });
            }
            
            res.json(server);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch server' });
        }
    });

// POST /api/v5/servers - Create new server
router.post('/servers', async (req, res) => {
    try {
        if (!req.session.pterodactyl) return res.status(401).json({ error: 'Unauthorized' });

        const { name, egg, location, ram, disk, cpu } = req.body;

        // Validate required fields
        if (!name?.trim()) return res.status(400).json({ error: 'Server name is required' });
        if (!egg) return res.status(400).json({ error: 'Server type is required' });
        if (!location) return res.status(400).json({ error: 'Location is required' });
        if (!ram || !disk || !cpu) return res.status(400).json({ error: 'Resource values are required' });

        // Get user's current resource usage and limits
        const user = await getPteroUser(req.session.userinfo.id, db);
        const packageName = await db.get(`package-${req.session.userinfo.id}`);
        const package = settings.api.client.packages.list[packageName || settings.api.client.packages.default];
        const extra = await db.get(`extra-${req.session.userinfo.id}`) || {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: 0
        };

        // Calculate current usage
        const usage = user.attributes.relationships.servers.data.reduce((acc, server) => ({
            ram: acc.ram + server.attributes.limits.memory,
            disk: acc.disk + server.attributes.limits.disk,
            cpu: acc.cpu + server.attributes.limits.cpu,
            servers: acc.servers + 1
        }), { ram: 0, disk: 0, cpu: 0, servers: 0 });

        // Check resource limits
        if (usage.servers >= package.servers + extra.servers) {
            return res.status(400).json({ error: 'Server limit reached' });
        }
        if (usage.ram + ram > package.ram + extra.ram) {
            return res.status(400).json({ error: 'Insufficient RAM available' });
        }
        if (usage.disk + disk > package.disk + extra.disk) {
            return res.status(400).json({ error: 'Insufficient disk space available' });
        }
        if (usage.cpu + cpu > package.cpu + extra.cpu) {
            return res.status(400).json({ error: 'Insufficient CPU available' });
        }

        // Get egg configuration
        const eggInfo = settings.api.client.eggs[egg];
        if (!eggInfo) {
            return res.status(400).json({ error: 'Invalid egg specified' });
        }

        // Validate against egg minimums
        if (eggInfo.minimum) {
            if (ram < eggInfo.minimum.ram) {
                return res.status(400).json({ error: `Minimum RAM required is ${eggInfo.minimum.ram}MB` });
            }
            if (disk < eggInfo.minimum.disk) {
                return res.status(400).json({ error: `Minimum disk required is ${eggInfo.minimum.disk}MB` });
            }
            if (cpu < eggInfo.minimum.cpu) {
                return res.status(400).json({ error: `Minimum CPU required is ${eggInfo.minimum.cpu}%` });
            }
        }

        // Create server specification
        const serverSpec = {
            name: name.trim(),
            user: await db.get(`users-${req.session.userinfo.id}`),
            egg: eggInfo.info.egg,
            docker_image: eggInfo.info.docker_image,
            startup: eggInfo.info.startup,
            environment: eggInfo.info.environment,
            limits: {
                memory: ram,
                swap: -1,
                disk: disk,
                io: 500,
                cpu: cpu
            },
            feature_limits: {
                databases: 4,
                backups: 4,
                allocations: 10
            },
            deploy: {
                locations: [location],
                dedicated_ip: false,
                port_range: []
            }
        };

        // Create server on Pterodactyl
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(serverSpec)
            }
        );

        if (!response.ok) {
            const error = await response.json();
            console.error('Pterodactyl API Error:', error);
            return res.status(400).json(error);
        }

        const server = await response.json();

        // Log server creation
        log('server_created',
            `User ${req.session.userinfo.username} created server "${name}" ` +
            `(RAM: ${ram}MB, CPU: ${cpu}%, Disk: ${disk}MB)`
        );

        res.status(201).json(server);
    } catch (error) {
        console.error('Error creating server:', error);
        res.status(500).json({ error: 'Failed to create server' });
    }
});

// PATCH /api/v5/servers/:id - Modify server
router.patch('/servers/:id', async (req, res) => {
    try {
        if (!req.session.pterodactyl) return res.status(401).json({ error: 'Unauthorized' });

        const { ram, disk, cpu } = req.body;
        
        // Validate input
        if (!ram || !disk || !cpu) {
            return res.status(400).json({ error: 'Missing required resource values' });
        }

        // Get user's current resources and limits
        const user = await getPteroUser(req.session.userinfo.id, db);
        const packageName = await db.get(`package-${req.session.userinfo.id}`);
        const package = settings.api.client.packages.list[packageName || settings.api.client.packages.default];
        const extra = await db.get(`extra-${req.session.userinfo.id}`) || {
            ram: 0,
            disk: 0,
            cpu: 0,
            servers: 0
        };

        // Find the server being modified
        const server = user.attributes.relationships.servers.data.find(
            s => s.attributes.id.toString() === req.params.id
        );
        
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        // Calculate current usage excluding the server being modified
        const usage = user.attributes.relationships.servers.data.reduce((acc, s) => {
            if (s.attributes.id.toString() !== req.params.id) {
                return {
                    ram: acc.ram + s.attributes.limits.memory,
                    disk: acc.disk + s.attributes.limits.disk,
                    cpu: acc.cpu + s.attributes.limits.cpu
                };
            }
            return acc;
        }, { ram: 0, disk: 0, cpu: 0 });

        // Check resource limits with new values
        if (usage.ram + ram > package.ram + extra.ram) {
            return res.status(400).json({ 
                error: `Insufficient RAM. Maximum available is ${package.ram + extra.ram - usage.ram}MB` 
            });
        }
        if (usage.disk + disk > package.disk + extra.disk) {
            return res.status(400).json({ 
                error: `Insufficient disk space. Maximum available is ${package.disk + extra.disk - usage.disk}MB` 
            });
        }
        if (usage.cpu + cpu > package.cpu + extra.cpu) {
            return res.status(400).json({ 
                error: `Insufficient CPU. Maximum available is ${package.cpu + extra.cpu - usage.cpu}%` 
            });
        }

        // Get egg configuration to check minimums
        let eggInfo = null;
        for (const [_, egg] of Object.entries(settings.api.client.eggs)) {
            if (egg.info.egg === server.attributes.egg) {
                eggInfo = egg;
                break;
            }
        }

        if (eggInfo?.minimum) {
            if (ram < eggInfo.minimum.ram) {
                return res.status(400).json({ error: `Minimum RAM required is ${eggInfo.minimum.ram}MB` });
            }
            if (disk < eggInfo.minimum.disk) {
                return res.status(400).json({ error: `Minimum disk required is ${eggInfo.minimum.disk}MB` });
            }
            if (cpu < eggInfo.minimum.cpu) {
                return res.status(400).json({ error: `Minimum CPU required is ${eggInfo.minimum.cpu}%` });
            }
        }

        // Send update request to Pterodactyl
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers/${req.params.id}/build`,
            {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.key}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    allocation: server.attributes.allocation,
                    memory: ram,
                    swap: server.attributes.limits.swap,
                    disk: disk,
                    io: server.attributes.limits.io,
                    cpu: cpu,
                    feature_limits: server.attributes.feature_limits
                })
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return res.status(400).json(error);
        }

        const updatedServer = await response.json();
        
        // Log the modification
        log('server_modified',
            `User ${req.session.userinfo.username} modified server "${server.attributes.name}" ` +
            `(RAM: ${ram}MB, CPU: ${cpu}%, Disk: ${disk}MB)`
        );

        res.json(updatedServer);
    } catch (error) {
        console.error('Error modifying server:', error);
        res.status(500).json({ error: 'Failed to modify server' });
    }
});

// DELETE /api/v5/servers/:id - Delete server
router.delete('/servers/:id', async (req, res) => {
    try {
        if (!req.session.pterodactyl) return res.status(401).json({ error: 'Unauthorized' });

        // Validate server ownership
        const user = await getPteroUser(req.session.userinfo.id, db);
        const server = user.attributes.relationships.servers.data.find(
            s => s.attributes.id.toString() === req.params.id
        );
        
        if (!server) {
            return res.status(404).json({ error: 'Server not found' });
        }

        // Check if server is suspended
        const serverInfo = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers/${req.params.id}`,
            {
                headers: {
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                }
            }
        );
        
        const serverData = await serverInfo.json();
        if (serverData.attributes.suspended) {
            return res.status(400).json({ error: 'Cannot delete suspended server' });
        }

        // Send delete request to Pterodactyl
        const response = await fetch(
            `${settings.pterodactyl.domain}/api/application/servers/${req.params.id}/force`,
            {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${settings.pterodactyl.key}`
                }
            }
        );

        if (!response.ok) {
            const error = await response.json();
            return res.status(400).json(error);
        }

        // Log the deletion
        log('server_deleted',
            `User ${req.session.userinfo.username} deleted server "${server.attributes.name}"`
        );

        res.status(204).send();
    } catch (error) {
        console.error('Error deleting server:', error);
        res.status(500).json({ error: 'Failed to delete server' });
    }
});

    // Mount the router
    app.use('/api/v5/', router);
};