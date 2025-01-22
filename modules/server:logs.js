/* --------------------------------------------- */
/* server:logs                                   */
/* --------------------------------------------- */

const express = require("express");
const { isAuthenticated, ownsServer } = require("./server:core.js");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:logs",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  // GET /api/server/:id/logs - Get server activity logs
  router.get('/server/:id/logs', isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      
      // Get logs from database
      const activityLog = await db.get(`activity_log_${serverId}`) || [];
      
      // Calculate pagination
      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const totalLogs = activityLog.length;
      const totalPages = Math.ceil(totalLogs / limit);
      
      // Get paginated logs
      const paginatedLogs = activityLog.slice(startIndex, endIndex);
      
      // Format response with pagination metadata
      const response = {
        data: paginatedLogs,
        pagination: {
          current_page: page,
          total_pages: totalPages,
          total_items: totalLogs,
          items_per_page: limit,
          has_more: endIndex < totalLogs
        }
      };

      res.json(response);
    } catch (error) {
      console.error('Error fetching activity logs:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.use("/api", router);
};