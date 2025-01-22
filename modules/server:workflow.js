/* --------------------------------------------- */
/* server:workflow                               */
/* --------------------------------------------- */

const express = require("express");
const schedule = require("node-schedule");
const { isAuthenticated, ownsServer, logActivity, workflowsFilePath } = require("./server:core.js");
const fs = require("fs");

/* --------------------------------------------- */
/* Prism Module                                  */
/* --------------------------------------------- */
const PrismModule = {
  name: "server:workflow",
  api_level: 3,
  target_platform: "0.5.0",
};

module.exports.PrismModule = PrismModule;
module.exports.load = async function (app, db) {
  const router = express.Router();

  function saveWorkflowToFile(instanceId, workflow) {
    try {
      let workflows = {};
      if (fs.existsSync(workflowsFilePath)) {
        const data = fs.readFileSync(workflowsFilePath, "utf8");
        workflows = JSON.parse(data);
      }
      workflows[instanceId] = workflow;
      fs.writeFileSync(workflowsFilePath, JSON.stringify(workflows, null, 2), "utf8");
    } catch (error) {
      console.error("Error saving workflow to file:", error);
    }
  }

  function loadWorkflowFromFile(instanceId) {
    try {
      if (fs.existsSync(workflowsFilePath)) {
        const data = fs.readFileSync(workflowsFilePath, "utf8");
        const workflows = JSON.parse(data);
        return workflows[instanceId] || null;
      }
      return null;
    } catch (error) {
      console.error("Error loading workflow from file:", error);
      return null;
    }
  }

  // GET workflow
  router.get("/server/:id/workflow", isAuthenticated, ownsServer, async (req, res) => {
    try {
      const serverId = req.params.id;
      let workflow = await db.get(serverId + "_workflow");
      if (!workflow) {
        workflow = loadWorkflowFromFile(serverId);
      }

      if (!workflow) {
        workflow = {};
      }

      res.json(workflow);
    } catch (error) {
      console.error("Error fetching workflow:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // POST save workflow
  router.post("/server/:instanceId/workflow/save-workflow", isAuthenticated, ownsServer, async (req, res) => {
    const { instanceId } = req.params;
    const workflow = req.body;

    if (!instanceId || !workflow) {
      return res.status(400).json({ success: false, message: "Missing required data" });
    }

    try {
      const scheduledJob = schedule.scheduledJobs[`job_${instanceId}`];
      if (scheduledJob) {
        scheduledJob.cancel();
      }

      await db.set(instanceId + "_workflow", workflow);
      saveWorkflowToFile(instanceId, workflow);

      scheduleWorkflowExecution(instanceId, workflow);
      saveScheduledWorkflows();

      await logActivity(db, instanceId, 'Save Workflow', { workflowDetails: workflow });

      res.json({ success: true, message: "Workflow saved successfully" });
    } catch (error) {
      console.error("Error saving workflow:", error);
      res.status(500).json({ success: false, message: "Internal server error" });
    }
  });

  function scheduleWorkflowExecution(instanceId, workflow) {
    const blocks = workflow.blocks;
    const intervalBlock = blocks.find((block) => block.type === "interval");

    if (intervalBlock) {
      const intervalMinutes = parseInt(intervalBlock.meta.selectedValue, 10);
      const rule = new schedule.RecurrenceRule();
      rule.minute = new schedule.Range(0, 59, intervalMinutes);

      schedule.scheduleJob(`job_${instanceId}`, rule, () => {
        executeWorkflow(instanceId);
      });
    }
  }

  function executeWorkflow(instanceId) {
    const workflow = loadWorkflowFromFile(instanceId);
    if (workflow) {
      const blocks = workflow.blocks;
      blocks.filter((block) => block.type === "power").forEach((block) => {
        executePowerAction(instanceId, block.meta.selectedValue);
      });
    }
  }

  function saveScheduledWorkflows() {
    try {
      const scheduledWorkflows = {};
      for (const job of Object.values(schedule.scheduledJobs)) {
        if (job.name.startsWith("job_")) {
          const instanceId = job.name.split("_")[1];
          scheduledWorkflows[instanceId] = job.nextInvocation();
        }
      }
      const scheduledWorkflowsFilePath = path.join(__dirname, "../storage/scheduledWorkflows.json");
      fs.writeFileSync(scheduledWorkflowsFilePath, JSON.stringify(scheduledWorkflows, null, 2), "utf8");
    } catch (error) {
      console.error("Error saving scheduled workflows:", error);
    }
  }

  app.use("/api", router);
};