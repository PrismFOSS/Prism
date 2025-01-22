/* --------------------------------------------- */
/* server:core                                   */
/* --------------------------------------------- */

const express = require("express");
const WebSocket = require("ws");
const axios = require("axios");
const path = require("path");
const fs = require("fs");
const Database = require("../db.js");
const db = new Database('sqlite://prism.db');
const getPteroUser = require('../handlers/getPteroUser');
const loadConfig = require("../handlers/config");
const settings = loadConfig("./config.toml");

const workflowsFilePath = path.join(__dirname, "../storage/workflows.json");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:core",
  api_level: 3,
  target_platform: "0.5.0",
};

const PANEL_URL = settings.pterodactyl.domain;
const API_KEY = settings.pterodactyl.client_key;

// Middleware for authentication check
const isAuthenticated = (req, res, next) => {
  if (req.session.pterodactyl) {
    next();
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
};

const ownsServer = async (req, res, next) => {
  try {
    const serverId = req.params.id || req.params.serverId || req.params.instanceId;
    if (!serverId) {
      return res.status(400).json({ error: 'No server ID provided' });
    }

    if (!req.session.pterodactyl) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Get user's servers from Pterodactyl API
    const user = await getPteroUser(req.session.userinfo.id, db);
    if (!user) {
      console.error(`Failed to fetch user data for ${req.session.userinfo.id}`);
      return res.status(404).json({ error: 'User not found' });
    }

    // Normalize IDs for comparison by taking first part before hyphen if it's a UUID
    const normalizeId = (id) => {
      if (!id || typeof id !== 'string') return '';
      // Handle both full UUIDs and short IDs
      return id.includes('-') ? id.split('-')[0] : id;
    };
    
    const normalizedTargetId = normalizeId(serverId);
    console.log(`Checking access for normalized server ID: ${normalizedTargetId}`);

    // Check if user owns the server
    const server = user.attributes.relationships.servers.data.find(s => {
      const serverIdentifier = s.attributes?.identifier;
      const serverId = s.attributes?.id;
      const normalizedIdentifier = normalizeId(serverIdentifier);
      const normalizedId = normalizeId(serverId);
      
      console.log(`Comparing with server - identifier: ${normalizedIdentifier}, id: ${normalizedId}`);
      return normalizedIdentifier === normalizedTargetId || 
             normalizedId === normalizedTargetId;
    });
    
    if (server) {
      console.log(`User ${req.session.userinfo.username} owns server ${serverId}`);
      return next();
    }

    // Check if user is a subuser of the server
    try {
      const subuserServers = await db.get(`subuser-servers-${req.session.pterodactyl.username}`);
      console.log('Subuser servers from DB:', subuserServers);

      if (!subuserServers) {
        console.log(`No subuser servers found for user ${req.session.userinfo.id}`);
        return res.status(403).json({ error: 'You do not have permission to access this server' });
      }

      const hasAccess = subuserServers.some(server => {
        const normalizedSubuserId = normalizeId(server?.id);
        console.log(`Checking subuser server ID: ${normalizedSubuserId} against target: ${normalizedTargetId}`);
        return normalizedSubuserId === normalizedTargetId;
      });
      
      if (hasAccess) {
        console.log(`User ${req.session.userinfo.username} is a subuser of server ${serverId}`);
        return next();
      } else {
        console.log(`Subuser check failed - no matching server ID found in subuser list`);
      }
    } catch (error) {
      console.error('Error checking subuser status:', error);
      console.error('Error details:', {
        userId: req.session.userinfo.id,
        serverId: serverId,
        error: error.message
      });
    }

    // If we reach here, user doesn't have access
    console.log(`User ${req.session.userinfo.username} (${req.session.userinfo.id}) does not have access to server ${serverId}`);
    return res.status(403).json({ error: 'You do not have permission to access this server' });
  } catch (error) {
    console.error('Error in ownsServer middleware:', error);
    return res.status(500).json({ error: 'Internal server error while checking server access' });
  }
};

// Activity logging helper
async function logActivity(db, serverId, action, details) {
  const timestamp = new Date().toISOString();
  const activityLog = await db.get(`activity_log_${serverId}`) || [];
  
  activityLog.unshift({ timestamp, action, details });
  
  // Keep only the last 100 activities
  if (activityLog.length > 100) {
    activityLog.pop();
  }
  
  await db.set(`activity_log_${serverId}`, activityLog);
}

// WebSocket helper function
async function withServerWebSocket(serverId, callback) {
  let ws = null;
  try {
    // Get WebSocket credentials
    const credsResponse = await axios.get(
      `${PANEL_URL}/api/client/servers/${serverId}/websocket`,
      {
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Accept': 'application/json',
        },
      }
    );

    const { socket, token } = credsResponse.data.data;

    // Connect to WebSocket
    return new Promise((resolve, reject) => {
      ws = new WebSocket(socket);
      const timeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.CLOSED) {
          ws.close();
        }
        reject(new Error('WebSocket operation timed out'));
      }, 10000); // 10 second timeout

      let consoleBuffer = [];
      let authenticated = false;

      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });

      ws.on('open', () => {
        console.log('WebSocket connection established');
        // Authenticate
        ws.send(JSON.stringify({
          event: "auth",
          args: [token]
        }));
      });

      ws.on('message', async (data) => {
        const message = JSON.parse(data.toString());

        if (message.event === 'auth success') {
          authenticated = true;
          try {
            await callback(ws, consoleBuffer);
            clearTimeout(timeout);
            resolve();
          } catch (error) {
            clearTimeout(timeout);
            reject(error);
          }
        }
        else if (message.event === 'console output') {
          consoleBuffer.push(message.args[0]);
        }
        else if (message.event === 'token expiring') {
          // Get new token
          const newCredsResponse = await axios.get(
            `${PANEL_URL}/api/client/servers/${serverId}/websocket`,
            {
              headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Accept': 'application/json',
              },
            }
          );
          // Send new token
          ws.send(JSON.stringify({
            event: "auth",
            args: [newCredsResponse.data.data.token]
          }));
        }
      });

      ws.on('close', () => {
        if (!authenticated) {
          clearTimeout(timeout);
          reject(new Error('WebSocket closed before authentication'));
        }
      });
    });
  } catch (error) {
    console.error(`WebSocket error for server ${serverId}:`, error);
    throw error;
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }
}

// Helper to send command and wait for response
async function sendCommandAndGetResponse(serverId, command, responseTimeout = 5000) {
  return withServerWebSocket(serverId, async (ws, consoleBuffer) => {
    return new Promise((resolve) => {
      // Clear existing buffer
      consoleBuffer.length = 0;

      // Send command
      ws.send(JSON.stringify({
        event: "send command",
        args: [command]
      }));

      // Wait for response
      setTimeout(() => {
        resolve([...consoleBuffer]); // Return a copy of the buffer
      }, responseTimeout);
    });
  });
}

// API request helper
async function apiRequest(endpoint, method = "GET", body = null) {
  const response = await fetch(`${PANEL_URL}/api/application${endpoint}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      Accept: "Application/vnd.pterodactyl.v1+json",
    },
    body: body ? JSON.stringify(body) : null,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${await response.text()}`);
  }

  return response.json();
}

module.exports = {
  PrismModule,
  isAuthenticated,
  ownsServer,
  logActivity,
  withServerWebSocket,
  sendCommandAndGetResponse,
  apiRequest,
  workflowsFilePath,
  PANEL_URL,
  API_KEY
};