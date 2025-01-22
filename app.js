"use strict";

/**
 * @fileoverview Prism - © Matt James 2025
 */

const startTime = process.hrtime();
const { spawn } = require('child_process');
const fs = require("fs").promises;
const fsSync = require("fs");
const express = require("express");
const session = require("express-session");
const nocache = require('nocache');
const cookieParser = require('cookie-parser');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// Redis
const Redis = require('ioredis');
const RedisStore = require('connect-redis').default;

const app = express();

require("./handlers/console.js")();

const loadConfig = require("./handlers/config");
const Database = require("./db.js");

const settings = loadConfig("./config.toml");

// Initialize database
const db = new Database(settings.database);

// Setup Redis
const redisClient = new Redis({
  host: settings.redis?.host || 'localhost',
  port: settings.redis?.port || 6379,
  password: settings.redis?.password || undefined,
  db: settings.redis?.database || 0,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  }
});

redisClient.on('error', (err) => {
  console.error('Redis Client Error:', err);
});

redisClient.on('connect', () => {
  // console.log('Connected to Redis successfully');
});

// Version information
const VERSION = "0.5.0";
const PLATFORM_CODENAME = "Adelante";
const PLATFORM_LEVEL = 'release 130';

console.log(`Prism ${VERSION} (${PLATFORM_CODENAME} ${PLATFORM_LEVEL})`);

// Update Manager
class UpdateManager {
  constructor(settings) {
    this.currentVersion = VERSION;
    this.githubApiUrl = 'https://api.github.com/repos/PrismFOSS/Prism/releases/latest';
    this.settings = settings;
    this.excludePatterns = [
      'config.toml',
      'prism.*'
    ];
  }

  async init() {
    if (this.settings.auto_update) {
      console.log('Auto-update is enabled - checking for updates...');
      await this.checkForUpdates();
      // Check every 30 minutes
      setInterval(() => this.checkForUpdates(), 30 * 60 * 1000);
    }
  }

  async checkForUpdates() {
    try {
      console.log('Checking for updates...');
      const latestRelease = await this.fetchLatestRelease();
      
      if (!latestRelease || !latestRelease.tag_name) {
        console.error('Unable to fetch latest release information');
        return;
      }

      console.log(`Current version: ${this.currentVersion}`);
      console.log(`Latest version: ${latestRelease.tag_name}`);

      if (this.currentVersion !== latestRelease.tag_name) {
        console.log(`Update available: ${this.currentVersion} → ${latestRelease.tag_name}`);
        await this.performUpdate(latestRelease);
      } else {
        console.log('System is up to date');
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
  }

  fetchLatestRelease() {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          'User-Agent': 'Prism-Update-Checker',
          'Accept': 'application/vnd.github.v3+json'
        }
      };

      https.get(this.githubApiUrl, options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }).on('error', reject);
    });
  }

  async performUpdate(release) {
    console.log('Starting update process...');
    const tempDir = path.join(__dirname, 'temp_update');
    const backupDir = path.join(__dirname, 'backup_' + Date.now());

    try {
      // Create temp directory
      console.log('Creating temporary directory...');
      await fs.mkdir(tempDir, { recursive: true });
      
      // Download and extract release
      console.log(`Downloading version ${release.tag_name}...`);
      await execAsync(`git clone --depth 1 --branch ${release.tag_name} https://github.com/PrismFOSS/Prism.git ${tempDir}`);

      // Create backup
      console.log('Creating backup...');
      await fs.mkdir(backupDir, { recursive: true });
      await this.backupCurrentFiles(backupDir);

      // Update files
      console.log('Updating files...');
      await this.updateFiles(tempDir);

      // Clean up
      console.log('Cleaning up temporary files...');
      await fs.rm(tempDir, { recursive: true, force: true });
      
      console.log('Update completed successfully');
      
      // Restart application
      this.restartApplication();
      
    } catch (error) {
      console.error('Error during update:', error);
      if (await fs.access(backupDir).then(() => true).catch(() => false)) {
        console.log('Attempting rollback...');
        await this.rollback(backupDir);
      }
    }
  }

  async backupCurrentFiles(backupDir) {
    const files = await fs.readdir(__dirname);
    
    for (const file of files) {
      if (this.shouldExcludeFile(file)) {
        console.log(`Skipping backup of excluded file: ${file}`);
        continue;
      }
      
      const sourcePath = path.join(__dirname, file);
      const destPath = path.join(backupDir, file);
      
      try {
        const stats = await fs.stat(sourcePath);
        if (stats.isDirectory()) {
          console.log(`Backing up directory: ${file}`);
          await fs.cp(sourcePath, destPath, { recursive: true });
        } else {
          console.log(`Backing up file: ${file}`);
          await fs.copyFile(sourcePath, destPath);
        }
      } catch (error) {
        console.error(`Error backing up ${file}:`, error);
      }
    }
  }

  async updateFiles(tempDir) {
    const files = await fs.readdir(tempDir);
    
    for (const file of files) {
      if (this.shouldExcludeFile(file)) {
        console.log(`Skipping update of excluded file: ${file}`);
        continue;
      }
      
      const sourcePath = path.join(tempDir, file);
      const destPath = path.join(__dirname, file);
      
      try {
        const stats = await fs.stat(sourcePath);
        if (stats.isDirectory()) {
          console.log(`Updating directory: ${file}`);
          await fs.rm(destPath, { recursive: true, force: true });
          await fs.cp(sourcePath, destPath, { recursive: true });
        } else {
          console.log(`Updating file: ${file}`);
          await fs.copyFile(sourcePath, destPath);
        }
      } catch (error) {
        console.error(`Error updating ${file}:`, error);
        throw error;
      }
    }
  }

  async rollback(backupDir) {
    console.log('Rolling back to previous version...');
    const files = await fs.readdir(backupDir);
    
    for (const file of files) {
      const sourcePath = path.join(backupDir, file);
      const destPath = path.join(__dirname, file);
      
      try {
        const stats = await fs.stat(sourcePath);
        if (stats.isDirectory()) {
          console.log(`Rolling back directory: ${file}`);
          await fs.rm(destPath, { recursive: true, force: true });
          await fs.cp(sourcePath, destPath, { recursive: true });
        } else {
          console.log(`Rolling back file: ${file}`);
          await fs.copyFile(sourcePath, destPath);
        }
      } catch (error) {
        console.error(`Error rolling back ${file}:`, error);
      }
    }
    console.log('Rollback completed');
  }

  shouldExcludeFile(filename) {
    return this.excludePatterns.some(pattern => {
      if (pattern.endsWith('*')) {
        return filename.startsWith(pattern.slice(0, -1));
      }
      return filename === pattern;
    });
  }

  restartApplication() {
    console.log('Killing process - your Prism dashboard has been updated!');
    console.log('Please start the application again to boot the new version');
    if (global.server) {
      global.server.close(() => {
        process.exit(0);
      });
    } else {
      process.exit(0);
    }
  }
}

// Set up Express
app.set('view engine', 'ejs');
require("express-ws")(app);

// Configure middleware
app.use(cookieParser());
app.use(express.text());
app.use(nocache());
app.use(express.json({
  limit: "500kb"
}));

const sessionConfig = {
  store: new RedisStore({ 
    client: redisClient,
    prefix: 'prism_sess:',
  }),
  secret: settings.website.secret,
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7 // 1 week
  },
  proxy: true
};

app.use(session(sessionConfig));
app.use((req, res, next) => {
  if (!req.session) {
    console.error('Session store error occurred');
    return req.session.regenerate((err) => {
      if (err) {
        console.error('Failed to regenerate session:', err);
        return res.status(500).send('Internal Server Error');
      }
      next();
    });
  }
  next();
});

// Headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader("X-Powered-By", `1st Gen Prism (${PLATFORM_CODENAME} ${VERSION})`);
  res.setHeader("X-Heliactyl", `prism v${VERSION} - "${PLATFORM_CODENAME}"`);
  res.setHeader("X-Prism", `v${VERSION} - "${PLATFORM_CODENAME}"`);
  next();
});

const moduleExports = {
  app,
  db,
};

module.exports = moduleExports;

global.__rootdir = __dirname;
(async () => {
  // Initialize update manager
  const updateManager = new UpdateManager(settings);
  await updateManager.init();

  const apifiles = fsSync.readdirSync("./modules")
    .filter(file => file.endsWith(".js"));

  for (const file of apifiles) {
    try {
      const moduleFile = require(`./modules/${file}`);
      if (moduleFile.load && moduleFile.PrismModule) {
        await moduleFile.load(app, db);
      }
    } catch (error) {
      console.error(`Error loading module ${file}:`, error);
    }
  }

  // Serve assets under the /assets/* route
  app.use('/assets', express.static(path.join(__dirname, 'assets')));

  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/app/')) return next();
    if (req.path.startsWith('/assets/')) return next();
    const appPath = '/app' + req.path;
    const fullPath = appPath + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '');
    
    res.redirect(301, fullPath);
  });

  const server = app.listen(settings.website.port, () => {
    const bootTime = process.hrtime(startTime);
    const bootTimeMs = (bootTime[0] * 1000 + bootTime[1] / 1000000).toFixed(2);
    console.log(`Systems operational - booted in ${bootTimeMs > 1000 ? (bootTimeMs/1000).toFixed(2) + 's' : bootTimeMs + 'ms'}`);
  });

  // Store it globally for access during reboot
  global.server = server;
})();

// Error handling
process.on('uncaughtException', console.error);
process.on('unhandledRejection', console.error);