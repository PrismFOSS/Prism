const loadConfig = require("../handlers/config");
const settings = loadConfig("./config.toml");

/* Ensure platform release target is met */
const PrismModule = {
    "name": "API v5",
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
    app.get("/api/state", async (req, res) => {
        const userId = req.session.userinfo.id;
        if (!userId) {
            return res.status(401).json({
                error: "Not authenticated"
            });
        } else {
            return res.json({
                message: "Authenticated",
                user: req.session.userinfo
            });
        }
    });

    app.get("/api/coins", async (req, res) => {
        if (!req.session.userinfo) {
            return res.status(401).json({
                error: "Not authenticated"
            });
        }
        const userId = req.session.userinfo.id;
        const coins = await db.get(`coins-${userId}`) || 0;
        res.json({
            coins
        });
    });

    // User
    app.get("/api/user", async (req, res) => {
        if (!req.session.userinfo) {
            return res.status(401).json({
                error: "Not authenticated"
            });
        }
        res.json(req.session.userinfo);
    });
}