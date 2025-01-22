const express = require('express');
const loadConfig = require("../handlers/config");
const settings = loadConfig("./config.toml");
const WebSocket = require('ws');
const axios = require('axios');

/* Ensure platform release target is met */
const PrismModule = {
    "name": "Settings",
    "api_level": 3,
    "target_platform": "0.5.0"
};

if (PrismModule.target_platform !== settings.version) {
    console.log('Module ' + PrismModule.name + ' does not support this platform release of Prism. The module was built for platform ' + PrismModule.target_platform + ' but is attempting to run on version ' + settings.version + '.')
    process.exit()
}

/* Module */
module.exports.PrismModule = PrismModule;
module.exports.load = async function(app, db) {
    const router = express.Router();

    // Middleware to check if user is authenticated
    const isAuthenticated = (req, res, next) => {
        if (req.session.pterodactyl) {
            next();
        } else {
            res.status(401).json({ error: "Unauthorized" });
        }
    };

    // Middleware to check if user owns the server
    const ownsServer = (req, res, next) => {
        const serverId = req.params.id;
        const userServers = req.session.pterodactyl.relationships.servers.data;
        const serverOwned = userServers.some(server => server.attributes.identifier === serverId);
        
        if (serverOwned) {
            next();
        } else {
            res.status(403).json({ error: "Forbidden. You don't have access to this server." });
        }
    };

    // POST Reinstall server
    router.post('/server/:id/reinstall', isAuthenticated, ownsServer, async (req, res) => {
        try {
            const serverId = req.params.id;
            await axios.post(`${settings.pterodactyl.domain}/api/client/servers/${serverId}/settings/reinstall`, {}, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.client_key}`
                }
            });
            res.status(204).send(); // No content response on success
        } catch (error) {
            console.error('Error reinstalling server:', error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    // POST Rename server
    router.post('/server/:id/rename', isAuthenticated, ownsServer, async (req, res) => {
        try {
            const serverId = req.params.id;
            const { name } = req.body; // Expecting the new name for the server in the request body

            await axios.post(`${settings.pterodactyl.domain}/api/client/servers/${serverId}/settings/rename`, 
            { name: name }, 
            {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${settings.pterodactyl.client_key}`
                }
            });
            res.status(204).send(); // No content response on success
        } catch (error) {
            console.error('Error renaming server:', error);
            res.status(500).json({ error: "Internal server error" });
        }
    });

    // Use the router with the '/api' prefix
    app.use('/api', router);
};