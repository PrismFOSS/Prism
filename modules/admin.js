const express = require('express');
const { spawn } = require('child_process');
const { exec } = require('child_process');
const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs').promises;
const TOML = require('@iarna/toml');
const log = require('../handlers/log.js');
const loadConfig = require('../handlers/config.js');
const settings = loadConfig('./config.toml');

// Check admin status utility function
async function checkAdminStatus(req, res, settings, db) {
  if (!req.session.pterodactyl) return false;

  try {
    let cacheaccount = await fetch(
      `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
      {
        method: "get",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.pterodactyl.key}`
        }
      }
    );

    if ((await cacheaccount.statusText) === "Not Found") return false;
    let cacheaccountinfo = JSON.parse(await cacheaccount.text());
    return cacheaccountinfo.attributes.root_admin === true;
  } catch (error) {
    console.error("Error checking admin status:", error);
    return false;
  }
}

let checkAdmin = checkAdminStatus;

/* Ensure platform release target is met */
const PrismModule = { "name": "Admin", "api_level": 3, "target_platform": "0.5.0" };

if (PrismModule.target_platform !== settings.version) {
  console.log('Module ' + PrismModule.name + ' does not support this platform release of Prism. The module was built for platform ' + PrismModule.target_platform + ' but is attempting to run on version ' + settings.version + '.')
  process.exit()
}

/* Module */
module.exports.PrismModule = PrismModule;
module.exports.load = async function(app, db) {
  let configNeedsReboot = false;

  // New /api/admin endpoint
  app.get("/api/admin", async (req, res) => {
    const isAdmin = await checkAdminStatus(req, res, settings, db);
    res.json({ admin: isAdmin });
  });

  // Update dashboard name
  app.patch("/api/config/name", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const { name } = req.body;
  
      if (!name || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: "Invalid name" });
      }
  
      // Read the current config
      const configPath = path.join(process.cwd(), 'config.toml');
      const configContent = await fs.readFile(configPath, 'utf8');
      
      // Parse TOML
      const parsedConfig = TOML.parse(configContent);
      
      // Update name
      parsedConfig.name = name.trim();
  
      // Convert back to TOML and write
      const updatedConfigContent = TOML.stringify(parsedConfig);
      await fs.writeFile(configPath, updatedConfigContent, 'utf8');
  
      // Mark that config needs reboot
      configNeedsReboot = true;
  
      log(
        "config updated",
        `${req.session.userinfo.username} updated the dashboard name to "${name}".`
      );
  
      res.json({ 
        success: true, 
        message: "Dashboard name updated successfully" 
      });
    } catch (error) {
      console.error("Error updating dashboard name:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Update dashboard logo
  app.patch("/api/config/logo", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const { logo } = req.body;
  
      if (!logo || typeof logo !== 'string') {
        return res.status(400).json({ error: "Invalid logo" });
      }
  
      // Read the current config
      const configPath = path.join(process.cwd(), 'config.toml');
      const configContent = await fs.readFile(configPath, 'utf8');
      
      // Parse TOML
      const parsedConfig = TOML.parse(configContent);
      
      // Update logo
      parsedConfig.logo = logo.trim();
  
      // Convert back to TOML and write
      const updatedConfigContent = TOML.stringify(parsedConfig);
      await fs.writeFile(configPath, updatedConfigContent, 'utf8');
  
      // Mark that config needs reboot
      configNeedsReboot = true;
  
      log(
        "config updated",
        `${req.session.userinfo.username} updated the dashboard logo.`
      );
  
      res.json({ 
        success: true, 
        message: "Dashboard logo updated successfully" 
      });
    } catch (error) {
      console.error("Error updating dashboard logo:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Rebuild panel
  app.post("/api/panel/rebuild", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      // Path to the panel directory
      const panelPath = path.join(process.cwd(), '..', 'panel');
  
      // Send immediate response
      res.json({ 
        success: true, 
        message: "Panel rebuild initiated" 
      });
  
      // Execute rebuild in a child process
      const buildProcess = exec('npm run build', {
        cwd: panelPath
      }, (error, stdout, stderr) => {
        if (error) {
          console.error(`Panel rebuild error: ${error}`);
          log(
            "panel rebuild failed",
            `${req.session.userinfo.username} attempted to rebuild the panel but encountered an error.`
          );
          return;
        }
        
        log(
          "panel rebuilt",
          `${req.session.userinfo.username} successfully rebuilt the panel.`
        );
        console.log(`Panel rebuild output: ${stdout}`);
        if (stderr) console.error(`Panel rebuild stderr: ${stderr}`);
      });
    } catch (error) {
      console.error("Error initiating panel rebuild:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
    
      // Get config backups
      app.get("/api/config/backups", async (req, res) => {
        if (!await checkAdmin(req, res, settings, db)) {
          return res.status(403).json({ error: "Unauthorized" });
        }
    
        try {
          const backupsDir = path.join(process.cwd(), 'backups');
          await fs.mkdir(backupsDir, { recursive: true });
          
          const files = await fs.readdir(backupsDir);
          const backups = files
            .filter(file => file.startsWith('config-') && file.endsWith('.toml'))
            .map(file => ({
              name: file,
              timestamp: parseInt(file.replace('config-', '').replace('.toml', '')),
              path: path.join('backups', file)
            }))
            .sort((a, b) => b.timestamp - a.timestamp);
    
          res.json(backups);
        } catch (error) {
          console.error("Error getting backups:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      });
  
      app.get("/api/config", async (req, res) => {
        if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
    
        try {
          let cacheaccount = await fetch(
            `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
            {
              method: "get",
              headers: { 
                "Content-Type": "application/json",
                "Authorization": `Bearer ${settings.pterodactyl.key}`
              }
            }
          );
    
          if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
          let cacheaccountinfo = JSON.parse(await cacheaccount.text());
          
          if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
    
          const config = await loadConfig("./config.toml");
          res.json(config);
        } catch (error) {
          console.error("Error fetching config:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      });
    
      // Get specific backup
      app.get("/api/config/backups/:file", async (req, res) => {
        if (!await checkAdmin(req, res, settings, db)) {
          return res.status(403).json({ error: "Unauthorized" });
        }
    
        try {
          const fileName = req.params.file.replace(/[^a-zA-Z0-9\-\.]/g, ''); // Basic sanitization
          const backupPath = path.join(process.cwd(), 'backups', fileName);
          
          const content = await fs.readFile(backupPath, 'utf8');
          res.type('text/plain').send(content);
        } catch (error) {
          console.error("Error reading backup:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      });
    
      // Restore from backup
      app.post("/api/config/backups/:file/restore", async (req, res) => {
        if (!await checkAdmin(req, res, settings, db)) {
          return res.status(403).json({ error: "Unauthorized" });
        }
    
        try {
          const fileName = req.params.file.replace(/[^a-zA-Z0-9\-\.]/g, ''); // Basic sanitization
          const backupPath = path.join(process.cwd(), 'backups', fileName);
          const configPath = path.join(process.cwd(), 'config.toml');
    
          // Verify backup exists and is valid TOML
          const backupContent = await fs.readFile(backupPath, 'utf8');
          try {
            TOML.parse(backupContent);
          } catch (e) {
            return res.status(400).json({ error: "Invalid TOML in backup file" });
          }
    
          // Create backup of current config before restore
          const newBackupPath = path.join(process.cwd(), 'backups', `config-${Date.now()}.toml`);
          await fs.copyFile(configPath, newBackupPath);
    
          // Restore from backup
          await fs.copyFile(backupPath, configPath);
    
          // Mark that config needs reboot
          configNeedsReboot = true;
    
          log(
            "config restored",
            `${req.session.userinfo.username} restored the dashboard configuration from backup: ${fileName}`
          );
    
          res.json({ 
            success: true, 
            message: "Configuration restored successfully",
            newBackup: newBackupPath
          });
        } catch (error) {
          console.error("Error restoring backup:", error);
          res.status(500).json({ error: "Internal server error" });
        }
      });
  
    // Check if reboot is needed
    app.get("/api/reboot/status", async (req, res) => {
      if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
      try {
        let cacheaccount = await fetch(
          `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
          {
            method: "get",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${settings.pterodactyl.key}`
            }
          }
        );
  
        if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        
        if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
        res.json({
          needsReboot: configNeedsReboot
        });
      } catch (error) {
        console.error("Error checking reboot status:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
   
  // Improved reboot endpoint
  app.post("/api/reboot", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      log(
        "dashboard reboot",
        `${req.session.userinfo.username} initiated a dashboard reboot.`
      );
  
      // Send response before reboot
      res.json({ success: true, message: "Initiating dashboard reboot" });
  
      // Reset the reboot flag
      configNeedsReboot = false;
  
      // Schedule the restart after response is sent
      setTimeout(() => {
        // Kill all child processes
        if (global.tailwindProcess) {
          global.tailwindProcess.kill();
        }
  
        // Close the database connection
        if (db && typeof db.close === 'function') {
          db.close();
        }
  
        // Close the Express server
        if (global.server) {
          global.server.close();
        }
  
        // Get the current process's PID
        const oldPid = process.pid;
  
        // Spawn a new process
        const scriptPath = path.join(process.cwd(), 'app.js');
        const child = spawn('bun', [scriptPath], {
          detached: true,
          stdio: 'inherit',
          env: { ...process.env, REBOOT_OLD_PID: oldPid }
        });
  
        // Unref child to allow old process to exit
        child.unref();
  
        // Kill the old process and any remaining children
        process.kill(oldPid);
      }, 1000);
  
    } catch (error) {
      console.error("Error initiating reboot:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
    app.get("/api/radar/nodes", async (req, res) => {
      if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
      try {
        let cacheaccount = await fetch(
          `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
          {
            method: "get",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${settings.pterodactyl.key}`
            }
          }
        );
  
        if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        
        if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
        const nodes = await db.get("radar-nodes") || [];
        
        // Check status of each node
        const nodesWithStatus = await Promise.all(nodes.map(async (node) => {
          try {
            const response = await fetch(`http://${node.fqdn}:${node.port}/api/stats`, {
              timeout: 5000
            });
            const stats = await response.json();
            return {
              ...node,
              status: "online",
              stats
            };
          } catch (error) {
            return {
              ...node,
              status: "offline",
              stats: null
            };
          }
        }));
  
        res.json(nodesWithStatus);
      } catch (error) {
        console.error("Error fetching radar nodes:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  
    // Get specific radar node
    app.get("/api/radar/nodes/:id", async (req, res) => {
      if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
      try {
        let cacheaccount = await fetch(
          `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
          {
            method: "get",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${settings.pterodactyl.key}`
            }
          }
        );
  
        if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        
        if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
        const nodes = await db.get("radar-nodes") || [];
        const node = nodes.find(n => n.id === req.params.id);
  
        if (!node) return res.status(404).json({ error: "Node not found" });
  
        try {
          const response = await fetch(`http://${node.fqdn}:${node.port}/api/stats`, {
            timeout: 5000
          });
          const stats = await response.json();
          res.json({
            ...node,
            status: "online",
            stats
          });
        } catch (error) {
          res.json({
            ...node,
            status: "offline",
            stats: null
          });
        }
      } catch (error) {
        console.error("Error fetching radar node:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  
    // Add new radar node
    app.post("/api/radar/nodes", async (req, res) => {
      if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
      try {
        let cacheaccount = await fetch(
          `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
          {
            method: "get",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${settings.pterodactyl.key}`
            }
          }
        );
  
        if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        
        if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
        const { name, fqdn, port, webhookUrl } = req.body;
  
        if (!name || !fqdn || !port) {
          return res.status(400).json({ error: "Missing required fields" });
        }
  
        const nodes = await db.get("radar-nodes") || [];
        const id = Math.random().toString(36).substring(2, 15);
  
        const newNode = {
          id,
          name,
          fqdn,
          port,
          webhookUrl,
          createdAt: new Date().toISOString()
        };
  
        nodes.push(newNode);
        await db.set("radar-nodes", nodes);
  
        log(
          "radar node added",
          `${req.session.userinfo.username} added a new Radar node: ${name} (${fqdn}:${port})`
        );
  
        res.status(201).json(newNode);
      } catch (error) {
        console.error("Error adding radar node:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  
    // Update radar node
    app.patch("/api/radar/nodes/:id", async (req, res) => {
      if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
      try {
        let cacheaccount = await fetch(
          `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
          {
            method: "get",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${settings.pterodactyl.key}`
            }
          }
        );
  
        if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        
        if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
        const nodes = await db.get("radar-nodes") || [];
        const nodeIndex = nodes.findIndex(n => n.id === req.params.id);
  
        if (nodeIndex === -1) return res.status(404).json({ error: "Node not found" });
  
        const updatedNode = {
          ...nodes[nodeIndex],
          ...req.body,
          id: nodes[nodeIndex].id // Prevent ID from being changed
        };
  
        nodes[nodeIndex] = updatedNode;
        await db.set("radar-nodes", nodes);
  
        log(
          "radar node updated",
          `${req.session.userinfo.username} updated Radar node: ${updatedNode.name}`
        );
  
        res.json(updatedNode);
      } catch (error) {
        console.error("Error updating radar node:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  
    // Delete radar node
    app.delete("/api/radar/nodes/:id", async (req, res) => {
      if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
      try {
        let cacheaccount = await fetch(
          `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
          {
            method: "get",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${settings.pterodactyl.key}`
            }
          }
        );
  
        if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        
        if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
        const nodes = await db.get("radar-nodes") || [];
        const nodeIndex = nodes.findIndex(n => n.id === req.params.id);
  
        if (nodeIndex === -1) return res.status(404).json({ error: "Node not found" });
  
        const deletedNode = nodes[nodeIndex];
        nodes.splice(nodeIndex, 1);
        await db.set("radar-nodes", nodes);
  
        log(
          "radar node deleted",
          `${req.session.userinfo.username} deleted Radar node: ${deletedNode.name}`
        );
  
        res.status(204).send();
      } catch (error) {
        console.error("Error deleting radar node:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  
    // Get analytics across all nodes
    app.get("/api/radar/analytics", async (req, res) => {
      if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
      try {
        let cacheaccount = await fetch(
          `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
          {
            method: "get",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${settings.pterodactyl.key}`
            }
          }
        );
  
        if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        
        if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
        const nodes = await db.get("radar-nodes") || [];
        
        // Collect stats from all online nodes
        const nodeStats = await Promise.all(nodes.map(async (node) => {
          try {
            const response = await fetch(`http://${node.fqdn}:${node.port}/api/stats`, {
              timeout: 5000
            });
            const stats = await response.json();
            return {
              node: node.name,
              status: "online",
              stats
            };
          } catch (error) {
            return {
              node: node.name,
              status: "offline",
              stats: null
            };
          }
        }));
  
        // Aggregate statistics
        const analytics = {
          total_nodes: nodes.length,
          online_nodes: nodeStats.filter(n => n.status === "online").length,
          total_detections: nodeStats.reduce((acc, n) => 
            acc + (n.stats?.total_detections || 0), 0),
          detections_by_type: {},
          detections_by_node: {},
          recent_detections: nodeStats.reduce((acc, n) => 
            acc + (n.stats?.recent_detections || 0), 0)
        };
  
        // Combine detection types across nodes
        nodeStats.forEach(nodeStat => {
          if (nodeStat.stats?.detection_types) {
            Object.entries(nodeStat.stats.detection_types).forEach(([type, count]) => {
              analytics.detections_by_type[type] = (analytics.detections_by_type[type] || 0) + count;
            });
          }
        });
  
        res.json(analytics);
      } catch (error) {
        console.error("Error fetching radar analytics:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  
    // Get detections from a specific node
    app.get("/api/radar/nodes/:id/detections", async (req, res) => {
      if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
      try {
        let cacheaccount = await fetch(
          `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
          {
            method: "get",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${settings.pterodactyl.key}`
            }
          }
        );
  
        if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
        let cacheaccountinfo = JSON.parse(await cacheaccount.text());
        
        if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
        const nodes = await db.get("radar-nodes") || [];
        const node = nodes.find(n => n.id === req.params.id);
  
        if (!node) return res.status(404).json({ error: "Node not found" });
  
        try {
          const response = await fetch(`http://${node.fqdn}:${node.port}/api/detections`, {
            timeout: 5000
          });
          const detections = await response.json();
          res.json(detections);
        } catch (error) {
          res.status(502).json({ error: "Unable to connect to Radar node" });
        }
      } catch (error) {
        console.error("Error fetching node detections:", error);
        res.status(500).json({ error: "Internal server error" });
      }
    });
  
  app.get("/api/servers", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
    
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      // Get servers with pagination
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
  
      const serversResponse = await fetch(
        `${settings.pterodactyl.domain}/api/application/servers?page=${page}&per_page=10000`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      const servers = await serversResponse.json();
      res.json(servers);
    } catch (error) {
      console.error("Error fetching servers:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/servers/:id", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const serverResponse = await fetch(
        `${settings.pterodactyl.domain}/api/application/servers/${req.params.id}?include=allocations,user,subusers,pack,nest,egg,variables,location,node,databases`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if (serverResponse.status === 404) return res.status(404).json({ error: "Server not found" });
      const server = await serverResponse.json();
      res.json(server);
    } catch (error) {
      console.error("Error fetching server:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/servers/:id/suspend", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/servers/${req.params.id}/suspend`,
        {
          method: "post",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error suspending server:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/servers/:id/unsuspend", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/servers/${req.params.id}/unsuspend`,
        {
          method: "post",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error unsuspending server:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/servers/:id", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const force = req.query.force === 'true';
      const endpoint = force ? 
        `${settings.pterodactyl.domain}/api/application/servers/${req.params.id}/force` :
        `${settings.pterodactyl.domain}/api/application/servers/${req.params.id}`;
  
      const response = await fetch(endpoint, {
        method: "delete",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.pterodactyl.key}`
        }
      });
  
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting server:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Nests endpoints
  app.get("/api/nests", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/nests?page=${page}&per_page=10000`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      const nests = await response.json();
      res.json(nests);
    } catch (error) {
      console.error("Error fetching nests:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/nests/:id/eggs", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      
      const includes = req.query.include ? req.query.include.split(',').join(',') : 'nest,servers,config,script,variables';
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/nests/${req.params.id}/eggs?include=${includes}&page=${page}&per_page=10000`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if (response.status === 404) return res.status(404).json({ error: "Nest not found" });
      const eggs = await response.json();
      res.json(eggs);
    } catch (error) {
      console.error("Error fetching eggs:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Users endpoints
  app.get("/api/users", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/users?page=${page}&per_page=10000`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      const users = await response.json();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/users/:id", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${req.params.id}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if (response.status === 404) return res.status(404).json({ error: "User not found" });
      const user = await response.json();
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.post("/api/users", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const { email, username, first_name, last_name, password } = req.body;
  
      if (!email || !username || !first_name || !last_name || !password) {
        return res.status(400).json({ error: "Missing required fields" });
      }
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/users`,
        {
          method: "post",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          },
          body: JSON.stringify({
            email,
            username,
            first_name,
            last_name,
            password,
            root_admin: false // Default to non-admin for safety
          })
        }
      );
  
      if (!response.ok) {
        const error = await response.json();
        return res.status(response.status).json(error);
      }
  
      const newUser = await response.json();
      console.log(response.text());
      res.status(201).json(newUser);
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.patch("/api/users/:id", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const { email, username, first_name, last_name, password } = req.body;
      const updateData = {};
  
      // Only include fields that are provided
      if (email) updateData.email = email;
      if (username) updateData.username = username;
      if (first_name) updateData.first_name = first_name;
      if (last_name) updateData.last_name = last_name;
      if (password) updateData.password = password;
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${req.params.id}`,
        {
          method: "patch",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          },
          body: JSON.stringify(updateData)
        }
      );
  
      if (response.status === 404) return res.status(404).json({ error: "User not found" });
      if (!response.ok) {
        const error = await response.json();
        return res.status(response.status).json(error);
      }
  
      const updatedUser = await response.json();
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.delete("/api/users/:id", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${req.params.id}`,
        {
          method: "delete",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if (response.status === 404) return res.status(404).json({ error: "User not found" });
      if (!response.ok) {
        const error = await response.json();
        return res.status(response.status).json(error);
      }
  
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Nodes endpoints
  app.get("/api/nodes", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/nodes?page=${page}&per_page=10000`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      const nodes = await response.json();
      res.json(nodes);
    } catch (error) {
      console.error("Error fetching nodes:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  app.get("/api/nodes/:id", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/nodes/${req.params.id}?include=allocations,location,servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if (response.status === 404) return res.status(404).json({ error: "Node not found" });
      const node = await response.json();
      res.json(node);
    } catch (error) {
      console.error("Error fetching node:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Get node configuration details
  app.get("/api/nodes/:id/configuration", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(403).json({ error: "Unauthorized" });
  
    try {
      let cacheaccount = await fetch(
        `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + req.session.userinfo.id)}?include=servers`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if ((await cacheaccount.statusText) == "Not Found") return res.status(404).json({ error: "User not found" });
      let cacheaccountinfo = JSON.parse(await cacheaccount.text());
      
      if (!cacheaccountinfo.attributes.root_admin) return res.status(403).json({ error: "Unauthorized" });
  
      const response = await fetch(
        `${settings.pterodactyl.domain}/api/application/nodes/${req.params.id}/configuration`,
        {
          method: "get",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
  
      if (response.status === 404) return res.status(404).json({ error: "Node not found" });
      const config = await response.json();
      res.json(config);
    } catch (error) {
      console.error("Error fetching node configuration:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

// Add these helper function and endpoints

// Helper function to get Prism user ID from Pterodactyl ID
async function getPrismUserId(pterodactylId, db) {
  try {
    console.log('Looking up Prism ID for Pterodactyl ID:', pterodactylId);

    // Get all keys starting with users-
    const keys = await db.getAll();
    console.log('Found database keys:', Object.keys(keys));

    // Look for the user mapping
    for (const [key, value] of Object.entries(keys)) {
      console.log(`Checking key: ${key}, value: ${value}`);
      if (key.startsWith('users-') && value === parseInt(pterodactylId)) {
        const userId = key.replace('users-', '');
        console.log('Found matching user ID:', userId);
        return userId;
      }
    }

    console.log('No matching user found for Pterodactyl ID:', pterodactylId);
    return null;
  } catch (error) {
    console.error("Error getting Prism user ID:", error);
    return null;
  }
}

// Get user coins
app.get("/api/users/:id/coins", async (req, res) => {
  if (!await checkAdminStatus(req, res, settings, db)) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const pterodactylId = req.params.id;
    console.log('Received request for Pterodactyl ID:', pterodactylId);

    // First check if this is already a Prism user ID
    const directCheck = await db.get("users-" + pterodactylId);
    let userId;

    if (directCheck) {
      // The ID provided was a Prism user ID
      userId = pterodactylId;
      console.log('ID was already a Prism user ID:', userId);
    } else {
      // Try to find the Prism user ID from Pterodactyl ID
      userId = await getPrismUserId(pterodactylId, db);
      console.log('Looked up Prism user ID:', userId);
    }

    if (!userId) {
      console.log('No user ID found for:', pterodactylId);
      return res.status(404).json({ error: "User not found" });
    }

    const coins = await db.get("coins-" + userId) || 0;
    console.log('Retrieved coins for user:', userId, 'Coins:', coins);
    res.json({ coins });
  } catch (error) {
    console.error("Error fetching user coins:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get user resources
app.get("/api/users/:id/resources", async (req, res) => {
  if (!await checkAdminStatus(req, res, settings, db)) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const pterodactylId = req.params.id;
    console.log('Received request for Pterodactyl ID:', pterodactylId);

    // First check if this is already a Prism user ID
    const directCheck = await db.get("users-" + pterodactylId);
    let userId;

    if (directCheck) {
      // The ID provided was a Prism user ID
      userId = pterodactylId;
      console.log('ID was already a Prism user ID:', userId);
    } else {
      // Try to find the Prism user ID from Pterodactyl ID
      userId = await getPrismUserId(pterodactylId, db);
      console.log('Looked up Prism user ID:', userId);
    }
    
    if (!userId) {
      console.log('No user ID found for:', pterodactylId);
      return res.status(404).json({ error: "User not found" });
    }

    const resources = await db.get("extra-" + userId) || {
      ram: 0,
      disk: 0,
      cpu: 0,
      servers: 0
    };
    
    console.log('Retrieved resources for user:', userId, 'Resources:', resources);
    res.json(resources);
  } catch (error) {
    console.error("Error fetching user resources:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user coins
app.patch("/api/users/:id/coins", async (req, res) => {
  if (!await checkAdminStatus(req, res, settings, db)) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const pterodactylId = req.params.id;
    console.log('Received update coins request for Pterodactyl ID:', pterodactylId);

    // First check if this is already a Prism user ID
    const directCheck = await db.get("users-" + pterodactylId);
    let userId;

    if (directCheck) {
      // The ID provided was a Prism user ID
      userId = pterodactylId;
      console.log('ID was already a Prism user ID:', userId);
    } else {
      // Try to find the Prism user ID from Pterodactyl ID
      userId = await getPrismUserId(pterodactylId, db);
      console.log('Looked up Prism user ID:', userId);
    }
    
    if (!userId) {
      console.log('No user ID found for:', pterodactylId);
      return res.status(404).json({ error: "User not found" });
    }

    const { coins } = req.body;

    if (typeof coins !== 'number' || coins < 0 || coins > 999999999999999) {
      return res.status(400).json({ error: "Invalid coin amount" });
    }

    if (coins === 0) {
      await db.delete("coins-" + userId);
    } else {
      await db.set("coins-" + userId, coins);
    }

    console.log('Updated coins for user:', userId, 'New amount:', coins);

    log(
      "coins updated",
      `${req.session.userinfo.username} updated coins to ${coins} for user ID ${userId}`
    );

    res.json({ success: true, coins });
  } catch (error) {
    console.error("Error updating user coins:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update user resources
app.patch("/api/users/:id/resources", async (req, res) => {
  if (!await checkAdminStatus(req, res, settings, db)) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  try {
    const pterodactylId = req.params.id;
    console.log('Received update resources request for Pterodactyl ID:', pterodactylId);

    // First check if this is already a Prism user ID
    const directCheck = await db.get("users-" + pterodactylId);
    let userId;

    if (directCheck) {
      // The ID provided was a Prism user ID
      userId = pterodactylId;
      console.log('ID was already a Prism user ID:', userId);
    } else {
      // Try to find the Prism user ID from Pterodactyl ID
      userId = await getPrismUserId(pterodactylId, db);
      console.log('Looked up Prism user ID:', userId);
    }
    
    if (!userId) {
      console.log('No user ID found for:', pterodactylId);
      return res.status(404).json({ error: "User not found" });
    }

    const { ram, disk, cpu, servers } = req.body;

    // Validate all resource values
    const resources = {
      ram: parseInt(ram) || 0,
      disk: parseInt(disk) || 0,
      cpu: parseInt(cpu) || 0,
      servers: parseInt(servers) || 0
    };

    for (const [key, value] of Object.entries(resources)) {
      if (value < 0 || value > 999999999999999) {
        return res.status(400).json({ error: `Invalid ${key} amount` });
      }
    }

    if (Object.values(resources).every(v => v === 0)) {
      await db.delete("extra-" + userId);
    } else {
      await db.set("extra-" + userId, resources);
    }

    console.log('Updated resources for user:', userId, 'New resources:', resources);

    // Handle server suspension
    await suspendIfNeeded(userId, settings, db);

    log(
      "resources updated",
      `${req.session.userinfo.username} updated resources for user ID ${userId}`
    );

    res.json({ success: true, ...resources });
  } catch (error) {
    console.error("Error updating user resources:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

  // Config management endpoints
  app.get("/api/config/raw", async (req, res) => {
    if (!await checkAdminStatus(req, res, settings, db)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      const configPath = path.join(process.cwd(), 'config.toml');
      const configContent = await fs.readFile(configPath, 'utf8');
      res.type('text/plain').send(configContent);
    } catch (error) {
      console.error("Error reading config:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/config/raw", express.text(), async (req, res) => {
    if (!await checkAdminStatus(req, res, settings, db)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      const configPath = path.join(process.cwd(), 'config.toml');
      const backupPath = path.join(process.cwd(), 'backups', `config-${Date.now()}.toml`);
      
      // Create backup
      await fs.mkdir(path.join(process.cwd(), 'backups'), { recursive: true });
      await fs.copyFile(configPath, backupPath);
      
      // Write new config
      await fs.writeFile(configPath, req.body, 'utf8');
      
      configNeedsReboot = true;

      log(
        "config updated",
        `${req.session.userinfo.username} updated dashboard configuration`
      );

      res.json({ success: true, backup: backupPath });
    } catch (error) {
      console.error("Error updating config:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Reboot management endpoints
  app.get("/api/reboot/status", async (req, res) => {
    if (!await checkAdminStatus(req, res, settings, db)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    res.json({ needsReboot: configNeedsReboot });
  });

  app.post("/api/reboot", async (req, res) => {
    if (!await checkAdminStatus(req, res, settings, db)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    log(
      "dashboard reboot",
      `${req.session.userinfo.username} initiated a dashboard reboot`
    );

    res.json({ success: true, message: "Initiating reboot" });

    // Reset reboot flag and handle restart
    configNeedsReboot = false;
    setTimeout(handleReboot, 1000);
  });
};

// Utility function to handle reboot
async function handleReboot() {
  // Kill child processes
  if (global.tailwindProcess) {
    global.tailwindProcess.kill();
  }

  // Close DB connection
  if (db && typeof db.close === 'function') {
    db.close();
  }

  // Close Express server
  if (global.server) {
    global.server.close();
  }

  // Spawn new process
  const scriptPath = path.join(process.cwd(), 'app.js');
  const child = spawn('node', [scriptPath], {
    detached: true,
    stdio: 'inherit'
  });

  child.unref();
  process.exit();
}

// Utility function to check and handle server suspension
async function suspendIfNeeded(userId, settings, db) {
  const pterodactylId = await db.get("users-" + userId);
  
  try {
    const userResponse = await fetch(
      `${settings.pterodactyl.domain}/api/application/users/${pterodactylId}?include=servers`,
      {
        method: "get",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${settings.pterodactyl.key}`
        }
      }
    );

    if (!userResponse.ok) return;
    
    const userData = await userResponse.json();
    const servers = userData.attributes.relationships.servers.data;
    
    // Calculate resource usage
    const usage = servers.reduce((acc, server) => ({
      ram: acc.ram + server.attributes.limits.memory,
      disk: acc.disk + server.attributes.limits.disk,
      cpu: acc.cpu + server.attributes.limits.cpu
    }), { ram: 0, disk: 0, cpu: 0 });

    // Get user's resource limits
    const packageName = await db.get("package-" + userId);
    const package = settings.api.client.packages.list[packageName || settings.api.client.packages.default];
    const extra = await db.get("extra-" + userId) || { ram: 0, disk: 0, cpu: 0, servers: 0 };

    // Check if over limits
    const isOverLimit = 
      usage.ram > (package.ram + extra.ram) ||
      usage.disk > (package.disk + extra.disk) ||
      usage.cpu > (package.cpu + extra.cpu) ||
      servers.length > (package.servers + extra.servers);

    // Suspend/unsuspend servers as needed
    for (const server of servers) {
      await fetch(
        `${settings.pterodactyl.domain}/api/application/servers/${server.attributes.id}/${isOverLimit ? 'suspend' : 'unsuspend'}`,
        {
          method: "post",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          }
        }
      );
    }
  } catch (error) {
    console.error("Error in suspendIfNeeded:", error);
  }
}