const https = require('https');
const http = require('http');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const { Message, Report, SeriousReport } = require('./models');
const path = require('path');


const app = express();
app.use(express.json());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

const options = {
  key: fs.readFileSync('ca/private.key'),
  cert: fs.readFileSync('ca/certificate.crt')
};


const uri = "mongodb+srv://jotaro:Change.m3@bottleinthesea.xcebefl.mongodb.net/?retryWrites=true&w=majority&appName=bottleInTheSea";
mongoose.connect(uri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB', err));

  let ipTimestamps = {};

// Middleware to check rate limit
function rateLimit(req, res, next) {
  const ip = req.ipAddress;
  const currentTime = Date.now();
  const timeLimit = 60 * 1000; // 60 seconds in milliseconds

  SeriousReport.findOne({ ip_created: ip })
    .then(isBanned => {
      if (isBanned) {
        // If IP is banned, skip rate limiting and proceed to next middleware
        return next();
      }

      // If IP is not banned, proceed with rate limiting logic
      if (ipTimestamps[ip] && (currentTime - ipTimestamps[ip] < timeLimit)) {
        const waitTime = (timeLimit - (currentTime - ipTimestamps[ip])) / 1000;
        return res.status(429).send(`You can create a new message in ${waitTime.toFixed(1)} seconds.`);
      }

      // Update the timestamp for this IP
      ipTimestamps[ip] = currentTime;
      next();
    })
    .catch(err => {
      console.error('Error checking ban status:', err);
      next(); // Proceed anyway if there's an error
    });

}


app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log(`Incoming request from IP: ${ip}`);
  req.ipAddress = ip; // Add the IP address to the request object
  next();
});



// Serve index.html at the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve create.html at /create-note
app.get('/create-note', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'create.html'));
});

// Serve open.html at /open-bottle
/*app.get('/open-bottle', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'open.html'));
}); */

// Apply the rateLimit middleware to the create-note endpoint
app.post('/create-note', rateLimit, async (req, res) => {
  const { content } = req.body;
  const ip_created = req.ipAddress;

  if (!content || content.trim() === '') {
    return res.status(400).send('Content is required.');
  }
  
  if (content.length > 512) {
    return res.status(400).send("Message is too long. Please limit to 512 characters.");
  }

  const isBanned = await SeriousReport.findOne({ ip_created });
  if (isBanned) {
    return res.status(403).send("You have been banned from making bottles. Email us at appeal@seanotes.se to appeal.");
  }

  const message_id = await Message.countDocuments() + 1;

  const newMessage = new Message({
    message_id,
    content,
    unique_id: generateUniqueId(),
    ip_created
  });

  await newMessage.save();
  res.status(201).send("Message created successfully!");
});

app.get('/api/message/:unique_id', async (req, res) => {
  const { unique_id } = req.params;
  try {
    let message = await Message.findOne({ unique_id });
    if (message) {
      const now = new Date();
      const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

      if (!message.opened_at || message.opened_at < tenMinutesAgo) {
        message.unique_id = generateUniqueId();
        message.opened_at = now;
      }
      message.opened = true;
      await message.save();
      res.json(message);
    } else {
      res.status(404).send("Message not found.");
    }
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).send("Server error.");
  }
});


app.get('/message/:unique_id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'message.html'));
});


app.get('/api/open-bottle', async (req, res) => {
  console.log("Received request to open a bottle.");
  const count = await Message.countDocuments({ opened: false });
  console.log(`Count of unopened messages: ${count}`);
  if (count === 0) {
    console.log("No unopened messages found.");
    return res.status(404).send("No unopened messages found.");
  }

  const random = Math.floor(Math.random() * count);
  console.log(`Random index generated: ${random}`);
  const message = await Message.findOne({ opened: false }).skip(random);

  if (message) {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    if (!message.opened_at || message.opened_at < tenMinutesAgo) {
      message.unique_id = generateUniqueId();
      message.opened_at = now;
    }

    message.opened = true;
    await message.save();
    console.log("Message found and opened:", message);
    res.json(message);
  } else {
    console.log("No unopened messages found after querying.");
    res.status(404).send("No unopened messages found.");
  }
});

app.post('/report', async (req, res) => {
  const { message_id } = req.body;
  const ip_created = req.ipAddress; // Get the IP address from the request

  if (!message_id) {
    return res.status(400).send('Message ID is required.');
  }

  // Find the report document for the given message_id
  const report = await Report.findOne({ message_id });

  if (report) {
    // Check if the IP address has already reported this message
    if (report.reported_by_ips.includes(ip_created)) {
      return res.status(400).send('You have already reported this message.');
    }

    // Add the IP address to the reported_by_ips array and increment the report count
    report.reported_by_ips.push(ip_created);
    report.report_count += 1;
    await report.save();
  } else {
    // If no report document exists, create a new one
    const newReport = new Report({
      message_id,
      report_count: 1,
      reported_by_ips: [ip_created]
    });
    await newReport.save();
  }

  // Check if the report count exceeds the threshold for a serious report
  if (report && report.report_count > 10) {
    // Find the original message to get the ip_created
    const message = await Message.findOne({ message_id });
    if (message) {
      const seriousReport = await SeriousReport.findOneAndUpdate(
        { message_id },
        { 
          $inc: { report_count: 1 },
          $set: { ip_created: message.ip_created } // Set the ip_created field
        },
        { new: true, upsert: true }
      );
      await seriousReport.save();
    }
  }

  res.status(200).send("Report recorded successfully!");
});

function generateUniqueId() {
  return Math.random().toString(36).substr(2, 9);
}

https.createServer(options, app).listen(443, () => {
  console.log('HTTPS Server running on port 443');
});

// Redirect HTTP to HTTPS
http.createServer((req, res) => {
  res.writeHead(301, { "Location": "https://" + req.headers['host'] + req.url });
  res.end();
}).listen(80);
