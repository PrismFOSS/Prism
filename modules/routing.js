const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const mime = require('mime-types');

const PrismModule = {
  name: "React Panel",
  api_level: 3,
  target_platform: "0.5.0"
};

const PROCESSABLE_EXTENSIONS = ['.html', '.js', '.css', '.json'];

async function processFileContent(content, userinfo) {
  if (!userinfo) return content;

  return content.replace(/%user\.(\w+)%/g, (match, key) => {
    return userinfo[key] || match;
  });
}

module.exports.PrismModule = PrismModule;
module.exports.load = async function(app, db) {
  const distPath = path.join(__dirname, '../app/dist');

  // Redirect / to /app
  app.get('/', (req, res) => {
    res.redirect('/app');
  });

  // Custom middleware to handle all panel files
  app.use('/app', async (req, res, next) => {
    try {
      // Get the relative file path from the URL
      let relativePath = req.path;
      let filePath = path.join(distPath, relativePath);

      // Check if the file exists
      try {
        await fs.access(filePath);
        const stats = await fs.stat(filePath);

        if (stats.isFile()) {
          // If it's a real file, process it
          const ext = path.extname(filePath);
          const shouldProcess = PROCESSABLE_EXTENSIONS.includes(ext.toLowerCase());

          if (!shouldProcess) {
            return res.sendFile(filePath);
          }

          const content = await fs.readFile(filePath, 'utf8');
          const processedContent = await processFileContent(content, req.session?.userinfo);
          const contentType = mime.lookup(filePath) || 'application/octet-stream';
          res.type(contentType);
          return res.send(processedContent);
        }
      } catch (err) {
        // File doesn't exist or other error - fall through to serve index.html
      }

      // If we get here, serve index.html for client-side routing
      const indexPath = path.join(distPath, 'index.html');
      const content = await fs.readFile(indexPath, 'utf8');
      const processedContent = await processFileContent(content, req.session?.userinfo);
      res.type('html');
      res.send(processedContent);

    } catch (err) {
      console.error('Error processing panel file:', err);
      res.status(500).send('Internal Server Error');
    }
  });
};