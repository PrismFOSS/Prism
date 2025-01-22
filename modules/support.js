const loadConfig = require("../handlers/config.js");
const settings = loadConfig("./config.toml");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require('uuid');

/* Ensure platform release target is met */
const PrismModule = { 
  "name": "Support Tickets", 
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
  // Middleware to check admin status
  async function checkAdmin(req, res, settings, db) {
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

  // Get ticket statistics (admin only)
  app.get("/api/tickets/stats", async (req, res) => {
    if (!await checkAdmin(req, res, settings, db)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      const tickets = await db.get('tickets') || [];
      
      const stats = {
        total: tickets.length,
        open: tickets.filter(t => t.status === 'open').length,
        closed: tickets.filter(t => t.status === 'closed').length,
        priorities: {
          low: tickets.filter(t => t.priority === 'low').length,
          medium: tickets.filter(t => t.priority === 'medium').length,
          high: tickets.filter(t => t.priority === 'high').length,
          urgent: tickets.filter(t => t.priority === 'urgent').length
        },
        categories: {
          technical: tickets.filter(t => t.category === 'technical').length,
          billing: tickets.filter(t => t.category === 'billing').length,
          general: tickets.filter(t => t.category === 'general').length,
          abuse: tickets.filter(t => t.category === 'abuse').length
        },
        averageResponseTime: calculateAverageResponseTime(tickets),
        ticketsLastWeek: tickets.filter(t => t.created > Date.now() - 7 * 24 * 60 * 60 * 1000).length
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching ticket statistics:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/notifications/:id/read", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });
  
    try {
      let notifications = await db.get(`notifications-${req.session.userinfo.id}`) || [];
      const notificationIndex = notifications.findIndex(n => n.id === req.params.id);
  
      if (notificationIndex === -1) {
        return res.status(404).json({ error: "Notification not found" });
      }
  
      notifications[notificationIndex].read = true;
      await db.set(`notifications-${req.session.userinfo.id}`, notifications);
  
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Get ticket count for user
  app.get("/api/tickets/count", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });
  
    try {
      const tickets = await db.get('tickets') || [];
      const userTickets = tickets.filter(ticket => ticket.userId === req.session.userinfo.id);
  
      const counts = {
        total: userTickets.length,
        open: userTickets.filter(t => t.status === 'open').length,
        closed: userTickets.filter(t => t.status === 'closed').length
      };
  
      res.json(counts);
    } catch (error) {
      console.error("Error fetching ticket counts:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Get recent activity for admin dashboard
  app.get("/api/tickets/activity", async (req, res) => {
    if (!await checkAdmin(req, res, settings, db)) {
      return res.status(403).json({ error: "Unauthorized" });
    }
  
    try {
      const tickets = await db.get('tickets') || [];
      const activity = [];
  
      // Get recent messages from all tickets
      tickets.forEach(ticket => {
        ticket.messages.forEach(message => {
          activity.push({
            type: 'message',
            ticketId: ticket.id,
            subject: ticket.subject,
            timestamp: message.timestamp,
            isStaff: message.isStaff,
            content: message.content
          });
        });
      });
  
      // Sort by timestamp descending and limit to 50 items
      activity.sort((a, b) => b.timestamp - a.timestamp);
      const recentActivity = activity.slice(0, 50);
  
      res.json(recentActivity);
    } catch (error) {
      console.error("Error fetching ticket activity:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Search tickets (admin only)
  app.get("/api/tickets/search", async (req, res) => {
    if (!await checkAdmin(req, res, settings, db)) {
      return res.status(403).json({ error: "Unauthorized" });
    }
  
    try {
      const { query, status, priority, category } = req.query;
      let tickets = await db.get('tickets') || [];
  
      // Apply filters
      if (query) {
        const searchQuery = query.toLowerCase();
        tickets = tickets.filter(ticket => 
          ticket.subject.toLowerCase().includes(searchQuery) ||
          ticket.messages.some(msg => msg.content.toLowerCase().includes(searchQuery))
        );
      }
  
      if (status) {
        tickets = tickets.filter(ticket => ticket.status === status);
      }
  
      if (priority) {
        tickets = tickets.filter(ticket => ticket.priority === priority);
      }
  
      if (category) {
        tickets = tickets.filter(ticket => ticket.category === category);
      }
  
      // Format tickets for display
      const formattedTickets = tickets.map(ticket => formatTicketForDisplay(ticket, false));
  
      res.json(formattedTickets);
    } catch (error) {
      console.error("Error searching tickets:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Export tickets to CSV (admin only)
  app.get("/api/tickets/export", async (req, res) => {
    if (!await checkAdmin(req, res, settings, db)) {
      return res.status(403).json({ error: "Unauthorized" });
    }
  
    try {
      const tickets = await db.get('tickets') || [];
      let csv = 'Ticket ID,Subject,Status,Priority,Category,Created,Updated,Messages\n';
  
      tickets.forEach(ticket => {
        csv += `${ticket.id},${escapeCsvField(ticket.subject)},${ticket.status},${ticket.priority},${ticket.category},${new Date(ticket.created).toISOString()},${new Date(ticket.updated).toISOString()},${ticket.messages.length}\n`;
      });
  
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=tickets.csv');
      res.send(csv);
    } catch (error) {
      console.error("Error exporting tickets:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
  
  // Helper function to escape CSV fields
  function escapeCsvField(field) {
    if (typeof field !== 'string') return field;
    return `"${field.replace(/"/g, '""')}"`;
  }

  // Create a new ticket
  app.post("/api/tickets", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { subject, description, priority, category } = req.body;

      // Validate required fields
      if (!subject || !description || !priority || !category) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate priority
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      if (!validPriorities.includes(priority.toLowerCase())) {
        return res.status(400).json({ error: "Invalid priority level" });
      }

      // Validate category
      const validCategories = ['technical', 'billing', 'general', 'abuse'];
      if (!validCategories.includes(category.toLowerCase())) {
        return res.status(400).json({ error: "Invalid category" });
      }

      const ticket = {
        id: uuidv4(),
        userId: req.session.userinfo.id,
        subject: subject.trim(),
        description: description.trim(),
        priority: priority.toLowerCase(),
        category: category.toLowerCase(),
        status: 'open',
        created: Date.now(),
        updated: Date.now(),
        messages: [{
          id: uuidv4(),
          userId: req.session.userinfo.id,
          content: description.trim(),
          timestamp: Date.now(),
          isStaff: false
        }]
      };

      // Get existing tickets or initialize new array
      let tickets = await db.get('tickets') || [];
      tickets.push(ticket);
      await db.set('tickets', tickets);

      // Create user notification
      let notifications = await db.get(`notifications-${req.session.userinfo.id}`) || [];
      notifications.push({
        id: uuidv4(),
        type: 'ticket_created',
        message: `Ticket #${ticket.id.slice(0, 8)} has been created`,
        timestamp: Date.now(),
        read: false
      });
      await db.set(`notifications-${req.session.userinfo.id}`, notifications);

      res.status(201).json(ticket);
    } catch (error) {
      console.error("Error creating ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get all tickets (admin only)
  app.get("/api/tickets/all", async (req, res) => {
    if (!await checkAdmin(req, res, settings, db)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      const tickets = await db.get('tickets') || [];
      
      // Add user information to each ticket
      const ticketsWithUserInfo = await Promise.all(tickets.map(async (ticket) => {
        const userInfo = await fetch(
          `${settings.pterodactyl.domain}/api/application/users/${await db.get("users-" + ticket.userId)}`,
          {
            method: "get",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${settings.pterodactyl.key}`
            }
          }
        ).then(r => r.json());

        return {
          ...ticket,
          user: {
            username: userInfo.attributes.username,
            email: userInfo.attributes.email
          }
        };
      }));

      res.json(ticketsWithUserInfo);
    } catch (error) {
      console.error("Error fetching tickets:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get user's tickets
  app.get("/api/tickets", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });

    try {
      const tickets = await db.get('tickets') || [];
      const userTickets = tickets.filter(ticket => ticket.userId === req.session.userinfo.id);
      res.json(userTickets);
    } catch (error) {
      console.error("Error fetching user tickets:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Get specific ticket
  app.get("/api/tickets/:id", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });

    try {
      const tickets = await db.get('tickets') || [];
      const ticket = tickets.find(t => t.id === req.params.id);

      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      // Check if user owns ticket or is admin
      const isAdmin = await checkAdmin(req, res, settings, db);
      if (ticket.userId !== req.session.userinfo.id && !isAdmin) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      res.json(ticket);
    } catch (error) {
      console.error("Error fetching ticket:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Add message to ticket
  app.post("/api/tickets/:id/messages", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { content } = req.body;
      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Message content is required" });
      }

      let tickets = await db.get('tickets') || [];
      const ticketIndex = tickets.findIndex(t => t.id === req.params.id);

      if (ticketIndex === -1) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const ticket = tickets[ticketIndex];
      const isAdmin = await checkAdmin(req, res, settings, db);

      // Check if user owns ticket or is admin
      if (ticket.userId !== req.session.userinfo.id && !isAdmin) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      const message = {
        id: uuidv4(),
        userId: req.session.userinfo.id,
        content: content.trim(),
        timestamp: Date.now(),
        isStaff: isAdmin
      };

      ticket.messages.push(message);
      ticket.updated = Date.now();
      ticket.status = 'open'; // Reopen ticket if it was closed

      tickets[ticketIndex] = ticket;
      await db.set('tickets', tickets);

      // Create notification for the other party
      const notifyUserId = isAdmin ? ticket.userId : await db.get("admin-notifications");
      if (notifyUserId) {
        let notifications = await db.get(`notifications-${notifyUserId}`) || [];
        notifications.push({
          id: uuidv4(),
          type: 'ticket_reply',
          message: `New reply on ticket #${ticket.id.slice(0, 8)}`,
          timestamp: Date.now(),
          read: false
        });
        await db.set(`notifications-${notifyUserId}`, notifications);
      }

      res.json(message);
    } catch (error) {
      console.error("Error adding message:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update ticket status (open/closed)
  app.patch("/api/tickets/:id/status", async (req, res) => {
    if (!req.session.pterodactyl) return res.status(401).json({ error: "Unauthorized" });

    try {
      const { status } = req.body;
      if (!status || !['open', 'closed'].includes(status)) {
        return res.status(400).json({ error: "Invalid status" });
      }

      let tickets = await db.get('tickets') || [];
      const ticketIndex = tickets.findIndex(t => t.id === req.params.id);

      if (ticketIndex === -1) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const ticket = tickets[ticketIndex];
      const isAdmin = await checkAdmin(req, res, settings, db);

      // Check if user owns ticket or is admin
      if (ticket.userId !== req.session.userinfo.id && !isAdmin) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      ticket.status = status;
      ticket.updated = Date.now();

      // Add system message about status change
      ticket.messages.push({
        id: uuidv4(),
        userId: req.session.userinfo.id,
        content: `Ticket ${status} by ${isAdmin ? 'staff' : 'user'}`,
        timestamp: Date.now(),
        isSystem: true
      });

      tickets[ticketIndex] = ticket;
      await db.set('tickets', tickets);

      // Create notification for the other party
      const notifyUserId = isAdmin ? ticket.userId : await db.get("admin-notifications");
      if (notifyUserId) {
        let notifications = await db.get(`notifications-${notifyUserId}`) || [];
        notifications.push({
          id: uuidv4(),
          type: 'ticket_status',
          message: `Ticket #${ticket.id.slice(0, 8)} has been ${status}`,
          timestamp: Date.now(),
          read: false
        });
        await db.set(`notifications-${notifyUserId}`, notifications);
      }

      res.json(ticket);
    } catch (error) {
      console.error("Error updating ticket status:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Update ticket priority (admin only)
  app.patch("/api/tickets/:id/priority", async (req, res) => {
    if (!await checkAdmin(req, res, settings, db)) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    try {
      const { priority } = req.body;
      const validPriorities = ['low', 'medium', 'high', 'urgent'];
      
      if (!priority || !validPriorities.includes(priority.toLowerCase())) {
        return res.status(400).json({ error: "Invalid priority level" });
      }

      let tickets = await db.get('tickets') || [];
      const ticketIndex = tickets.findIndex(t => t.id === req.params.id);

      if (ticketIndex === -1) {
        return res.status(404).json({ error: "Ticket not found" });
      }

      const ticket = tickets[ticketIndex];
      ticket.priority = priority.toLowerCase();
      ticket.updated = Date.now();

      // Add system message about priority change
      ticket.messages.push({
        id: uuidv4(),
        userId: req.session.userinfo.id,
        content: `Ticket priority changed to ${priority}`,
        timestamp: Date.now(),
        isSystem: true
      });

      tickets[ticketIndex] = ticket;
      await db.set('tickets', tickets);

      // Notify user of priority change
      let notifications = await db.get(`notifications-${ticket.userId}`) || [];
      notifications.push({
        id: uuidv4(),
        type: 'ticket_priority',
        message: `Ticket #${ticket.id.slice(0, 8)} priority changed to ${priority}`,
        timestamp: Date.now(),
        read: false
      });
      await db.set(`notifications-${ticket.userId}`, notifications);

      res.json(ticket);
    } catch (error) {
      console.error("Error updating ticket priority:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });
};

// Helper function to calculate average response time
function calculateAverageResponseTime(tickets) {
    let totalResponseTime = 0;
    let responsesCount = 0;
  
    tickets.forEach(ticket => {
      if (ticket.messages.length > 1) {
        for (let i = 1; i < ticket.messages.length; i++) {
          const currentMessage = ticket.messages[i];
          const previousMessage = ticket.messages[i - 1];
  
          // Only count response time if messages are from different users
          if (currentMessage.userId !== previousMessage.userId) {
            totalResponseTime += currentMessage.timestamp - previousMessage.timestamp;
            responsesCount++;
          }
        }
      }
    });
  
    return responsesCount > 0 ? Math.floor(totalResponseTime / responsesCount) : 0;
  }
  
  // Helper function to format tickets for display
  function formatTicketForDisplay(ticket, includeMessages = true) {
    const displayTicket = {
      id: ticket.id,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      created: ticket.created,
      updated: ticket.updated,
      displayId: ticket.id.slice(0, 8).toUpperCase(),
      timeAgo: getTimeAgo(ticket.updated)
    };
  
    if (includeMessages) {
      displayTicket.messages = ticket.messages.map(msg => ({
        id: msg.id,
        content: msg.content,
        timestamp: msg.timestamp,
        timeAgo: getTimeAgo(msg.timestamp),
        isStaff: msg.isStaff,
        isSystem: msg.isSystem
      }));
    }
  
    return displayTicket;
  }
  
  // Helper function to get time ago string
  function getTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
  
    const intervals = {
      year: 31536000,
      month: 2592000,
      week: 604800,
      day: 86400,
      hour: 3600,
      minute: 60
    };
  
    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
      const interval = Math.floor(seconds / secondsInUnit);
      if (interval >= 1) {
        return interval === 1 ? `1 ${unit} ago` : `${interval} ${unit}s ago`;
      }
    }
  
    return 'just now';
  }