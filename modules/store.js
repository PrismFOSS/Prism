const indexjs = require("../app.js");
const fs = require("fs");
const WebSocket = require('ws');
const loadConfig = require("../handlers/config.js");
const settings = loadConfig("./config.toml");

const PrismModule = { 
  "name": "Staking", 
  "api_level": 2,
  "target_platform": "0.5.0" 
};

module.exports.PrismModule = PrismModule;

class AFKRewardsManager {
  constructor(db) {
    this.db = db;
    this.COINS_PER_MINUTE = 1.5;
    this.INTERVAL_MS = 60000;
    this.timeouts = new Map();
    this.stateTimeouts = new Map();
    this.sessions = new Map();
  }

  hasActiveSession(userId) {
    const session = this.sessions.get(userId);
    if (!session) return false;
    return Date.now() - session.lastUpdate < 60000;
  }

  createSession(userId, clusterId) {
    this.sessions.set(userId, {
      clusterId,
      lastReward: Date.now(),
      lastUpdate: Date.now()
    });
  }

  updateSession(userId) {
    const session = this.sessions.get(userId);
    if (session) {
      session.lastReward = Date.now();
      session.lastUpdate = Date.now();
    }
  }

  removeSession(userId) {
    this.sessions.delete(userId);
  }

  async processReward(userId, ws) {
    try {
      const currentCoins = await this.db.get(`coins-${userId}`) || 0;
      const newBalance = currentCoins + this.COINS_PER_MINUTE;
      await this.db.set(`coins-${userId}`, newBalance);
      
      this.updateSession(userId);
      
      this.sendState(userId, ws);
      this.scheduleNextReward(userId, ws);
    } catch (error) {
      console.error(`[ERROR] Failed to process reward for ${userId}:`, error);
      ws.close(4000, 'Failed to process reward');
    }
  }

  scheduleNextReward(userId, ws) {
    const timeout = setTimeout(() => {
      this.processReward(userId, ws);
    }, this.INTERVAL_MS);

    this.timeouts.set(userId, timeout);
  }

  getLastReward(userId) {
    return this.sessions.get(userId)?.lastReward || Date.now();
  }

  sendState(userId, ws) {
    const lastRewardTime = this.getLastReward(userId);
    const nextRewardIn = Math.max(0, this.INTERVAL_MS - (Date.now() - lastRewardTime));
    
    ws.send(JSON.stringify({
      type: 'afk_state',
      coinsPerMinute: this.COINS_PER_MINUTE,
      nextRewardIn,
      timestamp: Date.now()
    }));
  }

  startStateUpdates(userId, ws) {
    const updateState = () => {
      this.sendState(userId, ws);
      const timeout = setTimeout(updateState, 1000);
      this.stateTimeouts.set(userId, timeout);
    };
    updateState();
  }

  cleanup(userId) {
    const timeout = this.timeouts.get(userId);
    if (timeout) {
      clearTimeout(timeout);
      this.timeouts.delete(userId);
    }

    const stateTimeout = this.stateTimeouts.get(userId);
    if (stateTimeout) {
      clearTimeout(stateTimeout);
      this.stateTimeouts.delete(userId);
    }

    this.removeSession(userId);
  }
}

const RENEWAL_BYPASS_PRICE = 3500;
const RESOURCE_PRICES = {
  ram: settings.api.client.coins.store.ram.cost,
  disk: settings.api.client.coins.store.disk.cost,
  cpu: settings.api.client.coins.store.cpu.cost,
  servers: settings.api.client.coins.store.servers.cost
};

const RESOURCE_MULTIPLIERS = {
  ram: 1024,
  disk: 5120,
  cpu: 100,
  servers: 1
};

const MAX_RESOURCE_LIMITS = {
  ram: 96,
  disk: 200,
  cpu: 36,
  servers: 20
};

class StoreError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'StoreError';
    this.code = code;
  }
}

class Store {
  constructor(db) {
    this.db = db;
  }

  async purchaseRenewalBypass(userId) {
    const userCoins = await this.db.get(`coins-${userId}`) || 0;
    
    if (userCoins < RENEWAL_BYPASS_PRICE) {
      throw new StoreError('Insufficient funds', 'INSUFFICIENT_FUNDS');
    }

    const newBalance = userCoins - RENEWAL_BYPASS_PRICE;
    await this.db.set(`coins-${userId}`, newBalance);
    await this.db.set(`renewbypass-${userId}`, true);

    const purchase = await this.logPurchase(userId, 'renewal_bypass', 1, RENEWAL_BYPASS_PRICE);

    return { purchase, remainingCoins: newBalance };
  }

  async hasRenewalBypass(userId) {
    return await this.db.get(`renewbypass-${userId}`) || false;
  }

  validateResourceAmount(resourceType, amount) {
    if (!RESOURCE_PRICES[resourceType]) throw new StoreError('Invalid resource type', 'INVALID_RESOURCE');
    if (!Number.isInteger(amount) || amount < 1) throw new StoreError('Amount must be a positive integer', 'INVALID_AMOUNT');
    return true;
  }

  async updateResourceLimits(userId, resourceType, amount) {
    const extra = await this.db.get(`extra-${userId}`) || {
      ram: 0, disk: 0, cpu: 0, servers: 0
    };

    const actualAmount = amount * RESOURCE_MULTIPLIERS[resourceType];
    const newAmount = extra[resourceType] + actualAmount;

    const maxLimit = MAX_RESOURCE_LIMITS[resourceType] * RESOURCE_MULTIPLIERS[resourceType];
    if (newAmount > maxLimit) {
      throw new StoreError(`Resource limit exceeded`, 'RESOURCE_LIMIT_EXCEEDED');
    }

    extra[resourceType] = newAmount;
    await this.db.set(`extra-${userId}`, extra);
    return extra;
  }

  async logPurchase(userId, resourceType, amount, cost) {
    const purchase = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId, resourceType, amount, cost,
      timestamp: Date.now()
    };
    
    const history = await this.db.get(`purchases-${userId}`) || [];
    history.push(purchase);
    await this.db.set(`purchases-${userId}`, history);
    return purchase;
  }
}

module.exports.load = function(app, db) {
  const afkManager = new AFKRewardsManager(db);
  const clusterId = process.env.CLUSTER_ID || `cluster-${Math.random().toString(36).substring(7)}`;
  const store = new Store(db);

  app.ws('/ws', async function(ws, req) {
    if (!req.session.userinfo) {
      ws.close(4001, 'Unauthorized');
      return;
    }

    const userId = req.session.userinfo.id;

    try {
      if (afkManager.hasActiveSession(userId)) {
        ws.close(4002, 'Already connected');
        return;
      }

      afkManager.createSession(userId, clusterId);
      afkManager.scheduleNextReward(userId, ws);
      afkManager.startStateUpdates(userId, ws);

      ws.on('close', () => {
        afkManager.cleanup(userId);
      });

    } catch (error) {
      console.error(`[ERROR] Failed to setup AFK session for ${userId}:`, error);
      ws.close(4000, 'Failed to setup AFK session');
    }
  });

  app.get('/api/store/config', async (req, res) => {
    try {
      if (!req.session.userinfo) return res.status(401).json({ error: 'Unauthorized' });
  
      const userId = req.session.userinfo.id;
      const userCoins = await db.get(`coins-${userId}`) || 0;
  
      res.json({
        prices: {
          resources: RESOURCE_PRICES,
          renewalBypass: RENEWAL_BYPASS_PRICE
        },
        multipliers: RESOURCE_MULTIPLIERS,
        limits: MAX_RESOURCE_LIMITS,
        userBalance: userCoins,
        canAfford: {
          ram: userCoins >= RESOURCE_PRICES.ram,
          disk: userCoins >= RESOURCE_PRICES.disk,
          cpu: userCoins >= RESOURCE_PRICES.cpu,
          servers: userCoins >= RESOURCE_PRICES.servers,
          renewalBypass: userCoins >= RENEWAL_BYPASS_PRICE
        }
      });
  
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/store/renewal-bypass', async (req, res) => {
    try {
      if (!req.session.userinfo) return res.status(401).json({ error: 'Unauthorized' });

      const userId = req.session.userinfo.id;
      if (await store.hasRenewalBypass(userId)) {
        return res.status(400).json({ error: 'Already purchased', code: 'ALREADY_PURCHASED' });
      }

      const result = await store.purchaseRenewalBypass(userId);
      res.json({
        success: true,
        purchase: result.purchase,
        remainingCoins: result.remainingCoins
      });

    } catch (error) {
      if (error instanceof StoreError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/store/renewal-bypass', async (req, res) => {
    try {
      if (!req.session.userinfo) return res.status(401).json({ error: 'Unauthorized' });

      const userId = req.session.userinfo.id;
      const hasBypass = await store.hasRenewalBypass(userId);
      const userCoins = await db.get(`coins-${userId}`) || 0;
      
      res.json({
        hasRenewalBypass: hasBypass,
        price: RENEWAL_BYPASS_PRICE,
        canAfford: userCoins >= RENEWAL_BYPASS_PRICE,
        currentBalance: userCoins
      });
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/api/store/buy', async (req, res) => {
    try {
      if (!req.session.userinfo) return res.status(401).json({ error: 'Unauthorized' });

      const userId = req.session.userinfo.id;
      const { resourceType, amount } = req.body;

      store.validateResourceAmount(resourceType, amount);
      const cost = RESOURCE_PRICES[resourceType] * amount;
      const userCoins = await db.get(`coins-${userId}`) || 0;

      if (userCoins < cost) {
        return res.status(402).json({ 
          error: 'Insufficient funds',
          required: cost,
          balance: userCoins
        });
      }

      const updatedResources = await store.updateResourceLimits(userId, resourceType, amount);
      const newBalance = userCoins - cost;
      await db.set(`coins-${userId}`, newBalance);
      const purchase = await store.logPurchase(userId, resourceType, amount, cost);

      res.json({
        success: true,
        purchase,
        resources: updatedResources,
        remainingCoins: newBalance
      });

    } catch (error) {
      if (error instanceof StoreError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/store/history', async (req, res) => {
    try {
      if (!req.session.userinfo) return res.status(401).json({ error: 'Unauthorized' });
      const history = await db.get(`purchases-${req.session.userinfo.id}`) || [];
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.get('/api/store/resources', async (req, res) => {
    try {
      if (!req.session.userinfo) return res.status(401).json({ error: 'Unauthorized' });
      const resources = await db.get(`extra-${req.session.userinfo.id}`) || {
        ram: 0, disk: 0, cpu: 0, servers: 0
      };
      res.json(resources);
    } catch (error) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  let maxram = null;
  let maxcpu = null;
  let maxservers = null;
  let maxdisk = null;
  app.get("/buyram", async (req, res) => {
    let newsettings = await enabledCheck(req, res);
    if (newsettings) {
      let amount = req.query.amount;
      
      if (!amount) return res.send("missing amount");

      amount = parseFloat(amount);

      if (isNaN(amount)) return res.send("amount is not a number");

      if (amount < 1 || amount > 10) return res.send("amount must be 1-10");
      
      let theme = indexjs.get(req);
      let failedcallback = theme.settings.redirect.failedpurchaseram ? theme.settings.redirect.failedpurchaseram : "/";

      let usercoins = await db.get("coins-" + req.session.userinfo.id);
      usercoins = usercoins ? usercoins : 0;
        
      let ramcap = await db.get("ram-" + req.session.userinfo.id);
      ramcap = ramcap ? ramcap : 0;
        
      if (ramcap + amount > settings.storelimits.ram) return res.redirect(failedcallback + "?err=MAXRAMEXCEETED");

      let per = newsettings.api.client.coins.store.ram.per * amount;
      let cost = newsettings.api.client.coins.store.ram.cost * amount;

      if (usercoins < cost) return res.redirect(failedcallback + "?err=CANNOTAFFORD");

      let newusercoins = usercoins - cost;
      let newram = ramcap + amount;
      if(newram > settings.storelimits.ram) return res.send("You reached max ram limit!");
      if (newusercoins == 0) {
        await db.delete("coins-" + req.session.userinfo.id);
        await db.set("ram-" + req.session.userinfo.id, newram);
      } else {
        await db.set("coins-" + req.session.userinfo.id, newusercoins);
        await db.set("ram-" + req.session.userinfo.id, newram);
      }

      let extra = await db.get("extra-" + req.session.userinfo.id);
      extra = extra ? extra : {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
      };

      extra.ram = extra.ram + per;

      if (extra.ram == 0 && extra.disk == 0 && extra.cpu == 0 && extra.servers == 0) {
        await db.delete("extra-" + req.session.userinfo.id);
      } else {
        await db.set("extra-" + req.session.userinfo.id, extra);
      }

      adminjs.suspend(req.session.userinfo.id);

      log(`Resources Purchased`, `${req.session.userinfo.username}#${req.session.userinfo.discriminator} bought ${per}\MB ram from the store for \`${cost}\` Credits.`)

      res.redirect((theme.settings.redirect.purchaseram ? theme.settings.redirect.purchaseram : "/") + "?err=none");
    }
  });

  app.get("/buydisk", async (req, res) => {
    let newsettings = await enabledCheck(req, res);
    if (newsettings) {
      let amount = req.query.amount;

      if (!amount) return res.send("missing amount");

      amount = parseFloat(amount);

      if (isNaN(amount)) return res.send("amount is not a number");

      if (amount < 1 || amount > 10) return res.send("amount must be 1-10");
      
      let theme = indexjs.get(req);
      let failedcallback = theme.settings.redirect.failedpurchasedisk ? theme.settings.redirect.failedpurchasedisk : "/";

      let usercoins = await db.get("coins-" + req.session.userinfo.id);
      usercoins = usercoins ? usercoins : 0;
        
      let diskcap = await db.get("disk-" + req.session.userinfo.id);
      diskcap = diskcap ? diskcap : 0;
        
      if (diskcap + amount > settings.storelimits.disk) return res.redirect(failedcallback + "?err=MAXDISKEXCEETED");

      let per = newsettings.api.client.coins.store.disk.per * amount;
      let cost = newsettings.api.client.coins.store.disk.cost * amount;

      if (usercoins < cost) return res.redirect(failedcallback + "?err=CANNOTAFFORD");

      let newusercoins = usercoins - cost;
      let newdisk = diskcap + amount;
      if(newdisk > settings.storelimits.disk) return res.send("You reached max disk limit!");
      if (newusercoins == 0) {
        await db.delete("coins-" + req.session.userinfo.id);
        await db.set("disk-" + req.session.userinfo.id, newdisk);
      } else {
        await db.set("coins-" + req.session.userinfo.id, newusercoins);
        await db.set("disk-" + req.session.userinfo.id, newdisk);
      }

      let extra = await db.get("extra-" + req.session.userinfo.id);
      extra = extra ? extra : {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
      };

      extra.disk = extra.disk + per;

      if (extra.ram == 0 && extra.disk == 0 && extra.cpu == 0 && extra.servers == 0) {
        await db.delete("extra-" + req.session.userinfo.id);
      } else {
        await db.set("extra-" + req.session.userinfo.id, extra);
      }

      adminjs.suspend(req.session.userinfo.id);

      log(`Resources Purchased`, `${req.session.userinfo.username}#${req.session.userinfo.discriminator} bought ${per}MB disk from the store for \`${cost}\` Credits.`)

      res.redirect((theme.settings.redirect.purchasedisk ? theme.settings.redirect.purchasedisk : "/") + "?err=none");
    }
  });

  app.get("/buycpu", async (req, res) => {
    let newsettings = await enabledCheck(req, res);
    if (newsettings) {
      let amount = req.query.amount;

      if (!amount) return res.send("missing amount");

      amount = parseFloat(amount);

      if (isNaN(amount)) return res.send("amount is not a number");

      if (amount < 1 || amount > 10) return res.send("amount must be 1-10");
      
      let theme = indexjs.get(req);
      let failedcallback = theme.settings.redirect.failedpurchasecpu ? theme.settings.redirect.failedpurchasecpu : "/";

      let usercoins = await db.get("coins-" + req.session.userinfo.id);
      usercoins = usercoins ? usercoins : 0;
        
      let cpucap = await db.get("cpu-" + req.session.userinfo.id);
      cpucap = cpucap ? cpucap : 0;
        
      if (cpucap + amount > settings.storelimits.cpu) return res.redirect(failedcallback + "?err=MAXCPUEXCEETED");

      let per = newsettings.api.client.coins.store.cpu.per * amount;
      let cost = newsettings.api.client.coins.store.cpu.cost * amount;

      if (usercoins < cost) return res.redirect(failedcallback + "?err=CANNOTAFFORD");

      let newusercoins = usercoins - cost;
      let newcpu = cpucap + amount;
      if(newcpu > settings.storelimits.cpu) return res.send("Reached max CPU limit!");
      if (newusercoins == 0) {
        await db.delete("coins-" + req.session.userinfo.id);
        await db.set("cpu-" + req.session.userinfo.id, newcpu);
      } else {
        await db.set("coins-" + req.session.userinfo.id, newusercoins);
        await db.set("cpu-" + req.session.userinfo.id, newcpu);
      }

      let extra = await db.get("extra-" + req.session.userinfo.id);
      extra = extra ? extra : {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
      };

      extra.cpu = extra.cpu + per;

      if (extra.ram == 0 && extra.disk == 0 && extra.cpu == 0 && extra.servers == 0) {
        await db.delete("extra-" + req.session.userinfo.id);
      } else {
        await db.set("extra-" + req.session.userinfo.id, extra);
      }

      adminjs.suspend(req.session.userinfo.id);

      log(`Resources Purchased`, `${req.session.userinfo.username}#${req.session.userinfo.discriminator} bought ${per}% CPU from the store for \`${cost}\` Credits.`)

      res.redirect((theme.settings.redirect.purchasecpu ? theme.settings.redirect.purchasecpu : "/") + "?err=none");
    }
  });

  app.get("/buyservers", async (req, res) => {
    let newsettings = await enabledCheck(req, res);
    if (newsettings) {
      let amount = req.query.amount;

      if (!amount) return res.send("missing amount");

      amount = parseFloat(amount);

      if (isNaN(amount)) return res.send("amount is not a number");

      if (amount < 1 || amount > 10) return res.send("amount must be 1-10");
      
      let theme = indexjs.get(req);
      let failedcallback = theme.settings.redirect.failedpurchaseservers ? theme.settings.redirect.failedpurchaseservers : "/";

      let usercoins = await db.get("coins-" + req.session.userinfo.id);
      usercoins = usercoins ? usercoins : 0;
        
      let serverscap = await db.get("servers-" + req.session.userinfo.id);
      serverscap = serverscap ? serverscap : 0;
        
      if (serverscap + amount > settings.storelimits.servers) return res.redirect(failedcallback + "?err=MAXSERVERSEXCEETED");

      let per = newsettings.api.client.coins.store.servers.per * amount;
      let cost = newsettings.api.client.coins.store.servers.cost * amount;

      if (usercoins < cost) return res.redirect(failedcallback + "?err=CANNOTAFFORD");

      let newusercoins = usercoins - cost;
      let newservers = serverscap + amount;
      if(newservers > settings.storelimits.servers) return res.send("Reached max server limit!");
      if (newusercoins == 0) {
        await db.delete("coins-" + req.session.userinfo.id);
        await db.set("servers-" + req.session.userinfo.id, newservers);
      } else {
        await db.set("coins-" + req.session.userinfo.id, newusercoins);
        await db.set("servers-" + req.session.userinfo.id, newservers);
      }

      let extra = await db.get("extra-" + req.session.userinfo.id);
      extra = extra ? extra : {
        ram: 0,
        disk: 0,
        cpu: 0,
        servers: 0
      };

      extra.servers = extra.servers + per;

      if (extra.ram == 0 && extra.disk == 0 && extra.cpu == 0 && extra.servers == 0) {
        await db.delete("extra-" + req.session.userinfo.id);
      } else {
        await db.set("extra-" + req.session.userinfo.id, extra);
      }

      adminjs.suspend(req.session.userinfo.id);

      log(`Resources Purchased`, `${req.session.userinfo.username}#${req.session.userinfo.discriminator} bought ${per} Slots from the store for \`${cost}\` Credits.`)

      res.redirect((theme.settings.redirect.purchaseservers ? theme.settings.redirect.purchaseservers : "/") + "?err=none");
    }
  });

  async function enabledCheck(req, res) {
    let newsettings = loadConfig("./config.toml");
    if (newsettings.api.client.coins.store.enabled == true) return newsettings;
    let theme = indexjs.get(req);
    ejs.renderFile(
      `./themes/${theme.name}/${theme.settings.notfound}`, 
      await eval(indexjs.renderdataeval),
      null,
    function (err, str) {
      delete req.session.newaccount;
      if (err) {
        console.log(`[WEBSITE] An error has occured on path ${req._parsedUrl.pathname}:`);
        console.log(err);
        return res.send("An error has occured while attempting to load this page. Please contact an administrator to fix this.");
      };
      res.status(200);
      res.send(str);
    });
    return null;
  }
};