const express = require('express');
const mongoose = require('mongoose');
const { Message, Report, SeriousReport } = require('./models');
const path = require('path');


const app = express();
app.use(express.json());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

const uri = "mongodb+srv://jotaro:Change.m3@bottleinthesea.xcebefl.mongodb.net/?retryWrites=true&w=majority&appName=bottleInTheSea";
mongoose.connect(uri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB', err));


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
app.get('/open-bottle', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'open.html'));
});

app.post('/create-note', async (req, res) => {
  const { content } = req.body;
  const ip_created = req.ipAddress;

  if (!content || content.trim() === '') {
    return res.status(400).send('Content is required.');
  }
  
  if (content.length > 512) {
    return res.status(400).send("Message is too long. Please limit to 512 characters.");
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
    message.opened = true;
    message.unique_id = generateUniqueId();
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
  const report = await Report.findOneAndUpdate({ message_id }, { $inc: { report_count: 1 } }, { new: true, upsert: true });

  if (report.report_count > 5) {
    const seriousReport = new SeriousReport(report.toObject());
    await seriousReport.save();
  }
  
  res.status(200).send("Report recorded successfully!");
});

function generateUniqueId() {
  return Math.random().toString(36).substr(2, 9);
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
