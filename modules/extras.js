/**
 *      __         ___            __        __
 *     / /_  ___  / (_)___ ______/ /___  __/ /
 *    / __ \/ _ \/ / / __ `/ ___/ __/ / / / / 
 *   / / / /  __/ / / /_/ / /__/ /_/ /_/ / /  
 *  /_/ /_/\___/_/_/\__,_/\___/\__/\__, /_/   
 *                               /____/      
 * 
 *     Heliactyl 19.0.0 (Bristol Ridge)
 * 
 */

const loadConfig = require("../handlers/config.js");
const settings = loadConfig("./config.toml");
const fs = require("fs");
const indexjs = require("../app.js");
const fetch = require("node-fetch");
const Queue = require("../handlers/Queue.js");

/* Ensure platform release target is met */
const PrismModule = { "name": "Extra Features", "api_level": 3, "target_platform": "0.5.0" };

if (PrismModule.target_platform !== settings.version) {
  console.log('Module ' + PrismModule.name + ' does not support this platform release of Prism. The module was built for platform ' + PrismModule.target_platform + ' but is attempting to run on version ' + settings.version + '.')
  process.exit()
}

/* Module */
module.exports.PrismModule = PrismModule;
module.exports.load = async function(app, db) {
  app.get(`/api/password`, async (req, res) => {
    if (!req.session.userinfo.id) return res.redirect("/login");

    let checkPassword = await db.get("password-" + req.session.userinfo.id);

    if (checkPassword) {
      return res.json({ password: checkPassword });
    } else {
      let newpassword = makeid(settings.api.client.passwordgenerator["length"]);

      await fetch(
        settings.pterodactyl.domain + "/api/application/users/" + req.session.pterodactyl.id,
        {
          method: "patch",
          headers: {
            'Content-Type': 'application/json',
            "Authorization": `Bearer ${settings.pterodactyl.key}`
          },
          body: JSON.stringify({
            username: req.session.pterodactyl.username,
            email: req.session.pterodactyl.email,
            first_name: req.session.pterodactyl.first_name,
            last_name: req.session.pterodactyl.last_name,
            password: newpassword
          })
        }
      );

      await db.set("password-" + req.session.userinfo.id, newpassword)
      return res.json({ password: newpassword });
    }
  });

  app.get("/panel", async (req, res) => {
    res.redirect(settings.pterodactyl.domain);
  });

  app.get("/notifications", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");

    let notifications = await db.get('notifications-' + req.session.userinfo.id) || [];

    res.json(notifications)
  });

  app.get("/regen", async (req, res) => {
    if (!req.session.pterodactyl) return res.redirect("/login");
    if (settings.api.client.allow.regen !== true) return res.send("You cannot regenerate your password currently.");

    let newpassword = makeid(settings.api.client.passwordgenerator["length"]);
    req.session.password = newpassword;

    await updatePassword(req.session.pterodactyl, newpassword, settings, db);
    res.redirect("/security");
  });

  app.post("/api/password/change", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });
    if (!settings.api.client.allow.regen) return res.status(403).json({ error: "Password changes are not allowed" });

    const { password, confirmPassword } = req.body;

    // Validate password
    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: "Invalid password provided" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: "Passwords do not match" });
    }

    // Password requirements
    const minLength = 8;
    const hasNumber = /\d/.test(password);
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
      return res.status(400).json({ error: `Password must be at least ${minLength} characters long` });
    }

    if (!(hasNumber && hasUpperCase && hasLowerCase)) {
      return res.status(400).json({ 
        error: "Password must contain at least one number, one uppercase letter, and one lowercase letter" 
      });
    }

    try {
      await updatePassword(req.session.pterodactyl, password, settings, db);
      res.json({ success: true, message: "Password updated successfully" });
    } catch (error) {
      console.error("Password update error:", error);
      res.status(500).json({ error: "Failed to update password" });
    }
  });

// Helper function to update password
async function updatePassword(userInfo, newPassword, settings, db) {
  await fetch(
    `${settings.pterodactyl.domain}/api/application/users/${userInfo.id}`,
    {
      method: "patch",
      headers: {
        'Content-Type': 'application/json',
        "Authorization": `Bearer ${settings.pterodactyl.key}`
      },
      body: JSON.stringify({
        username: userInfo.username,
        email: userInfo.email,
        first_name: userInfo.first_name,
        last_name: userInfo.last_name,
        password: newPassword
      })
    }
  );

  await db.set("password-" + userInfo.id, newPassword);
}
};

function makeid(length) {
  let result = '';
  let characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
     result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}