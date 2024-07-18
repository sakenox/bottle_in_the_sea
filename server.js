const https = require('https');
const http = require('http');
const fs = require('fs');
const express = require('express');
const mongoose = require('mongoose');
const { Message, Report, SeriousReport} = require('./models');
const path = require('path');
const Filter = require('bad-words');  // Import the bad-words library
const rateLimiter = require('express-rate-limit');
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');


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
const profanityTimestamps = {};
const filter = new Filter();

const openBottleLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 5 requests per `window` (here, per 1 minute)
  message: 'Too many requests, please try again after a minute'
});

const emailLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 1, // Limit each IP to 5 requests per `window` (here, per 1 minute)
  message: 'Too many requests, please try again after a minute'
});

// Rate limiter for the message endpoint
const messageLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 5 requests per `window` (here, per 1 minute)
  message: 'Too many requests, please try again after a minute'
});
  


// Middleware to check rate limit
function rateLimit(req, res, next) {
  const ip = req.ipAddress;
  const currentTime = Date.now();
  const timeLimit = profanityTimestamps[ip] ? 20 * 1000 : 60 * 1000; // 20 seconds if profanity, else 60 seconds

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

// Middleware to redirect from IP to domain name
app.use((req, res, next) => {
  const host = req.headers.host;
  const domainName = 'seanotes.se'; // Your domain name
  const serverIp = '164.92.167.248'; // Your server IP address
  if (host === serverIp) {
    return res.redirect(301, `https://${domainName}${req.url}`);
  }
  next();
});


app.use((req, res, next) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  console.log(`Incoming request from IP: ${ip}`);
  req.ipAddress = ip; // Add the IP address to the request object
  next();
});


// Middleware to check referer
function checkReferer(req, res, next) {
  const referer = req.get('referer');
  if (referer && referer.startsWith('https://seanotes.se')) {
    next();
  } else {
    res.status(403).send('Forbidden');
  }
}


// Serve index.html at the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve create.html at /create-note
app.get('/create-note', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'create.html'));
});

app.get('/terms', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/legal', 'terms.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/legal', 'privacy.html'));
}); 

app.get('/about', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/info', 'about.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/info', 'contact.html'));
});

app.get('/faq', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/info', 'faq.html'));
});

app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/info', 'blog.html'));
});

// Middleware to log IP and redirect
app.get('/redirect', (req, res) => {
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

  // Log the IP address
  const logMessage = `${new Date().toISOString()} - ${ip}\n`;
  fs.appendFile(path.join(__dirname, 'logs', 'ips.txt'), logMessage, (err) => {
      if (err) {
          console.error('Error writing to log file:', err);
      }
  });

  // Redirect to a TikTok video
  const tiktokUrl = 'https://www.tiktok.com/@lnozza123/video/7390509089987497248?is_from_webapp=1&sender_device=pc';
  res.redirect(tiktokUrl);
});

// Apply the rateLimit middleware to the create-note endpoint
app.post('/create-note', rateLimit, async (req, res) => {
  const { content } = req.body;
  const ip_created = req.ipAddress;

  if (!content || content.trim() === '') {
    return res.status(400).send('Content is required.');
  }
  
  if (content.length > 1000) {
    return res.status(400).send("Message is too long. Please limit to 1000 characters.");
  }

  if (filter.isProfane(content)) {
    profanityTimestamps[ip_created] = Date.now();
    return res.status(400).send("Your message contains inappropriate language.");
  } else {
    delete profanityTimestamps[ip_created];
  }

  

  const isBanned = await SeriousReport.findOne({ ip_created });
  if (isBanned) {
    return res.status(403).send("You have been banned from making bottles. Email us at appeal@seanotes.se to appeal.");
  }

  const message_id = await Message.countDocuments() + 1;
  let uniqueMessageId = false;

  while (!uniqueMessageId) {
    const existingMessage = await Message.findOne({ message_id });
    if (!existingMessage) {
      uniqueMessageId = true;
    } else {
      message_id++;
    }
  }

  const newMessage = new Message({
    message_id,
    content,
    unique_id: generateUniqueId(),
    ip_created
  });

  await newMessage.save();
  res.status(201).send("Message created successfully!");
});

app.get('/api/message/:unique_id', checkReferer, messageLimiter, async (req, res) => {
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
      res.json({ 
        unique_id: message.unique_id, 
        content: message.content 
      });
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


app.get('/api/open-bottle', openBottleLimiter, checkReferer, async (req, res) => {
  console.log("Received request to open a bottle.");
  const count = await Message.countDocuments();
  /*const count = await Message.countDocuments({ opened: false });
  console.log(`Count of unopened messages: ${count}`);
  if (count === 0) {
    console.log("No unopened messages found.");
    return res.status(404).send("No unopened messages found.");
  }
 */
  const random = Math.floor(Math.random() * count);
  console.log(`Random index generated: ${random}`);
  //const message = await Message.findOne({ opened: false }).skip(random);
  const message = await Message.findOne().skip(random);

  if (message) {
    const now = new Date();
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    if (!message.opened_at || message.opened_at < tenMinutesAgo) {
      message.unique_id = generateUniqueId();
      message.opened_at = now;
    }

    message.opened = true;
    await message.save();
    res.json({
      unique_id: message.unique_id
    });
  } else {
    console.log("No unopened messages found after querying.");
    res.status(404).send("No unopened messages found.");
  }
});

app.post('/report', checkReferer, async (req, res) => {
  const { the_id } = req.body;
  const ip_created = req.ipAddress; // Get the IP address from the request

  if (!the_id) {
    return res.status(400).send('Message ID is required.');
  }
  const actual = await Message.findOne({ the_id });
  let message_id = actual.message_id;
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

app.post('/send-message', emailLimiter, async (req, res) => {
  const { name, email, subject, message } = req.body;

  if (!name || !email || !subject || !message) {
    return res.status(400).send('All fields are required.');
  }

  // Configure the email transport using nodemailer
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'smolpixelstudio@gmail.com',
      pass: 'zaqr wwno smhy bgpw'
    }
  });

  const mailOptions = {
    from: "send@seanotes.se",
    to: 'support@seanotes.se',
    subject: subject,
    text: `Name: ${name}\nEmail: ${email}\n\n${message}`
  };

  try {
    await transporter.sendMail(mailOptions);
    res.status(200).send('Message sent successfully.');
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).send('Error sending email.');
  }
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
