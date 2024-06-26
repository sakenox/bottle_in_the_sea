const mongoose = require('mongoose');
const { Message, Report, SeriousReport } = require('./models');

const uri = "mongodb+srv://jotaro:Change.m3@bottleinthesea.xcebefl.mongodb.net/?retryWrites=true&w=majority&appName=bottleInTheSea";

mongoose.connect(uri)
  .then(async () => {
    console.log('Connected to MongoDB');

    // Drop existing collections
    await Message.collection.drop().catch(err => console.log("Messages collection doesn't exist"));
    await Report.collection.drop().catch(err => console.log("Reports collection doesn't exist"));
    await SeriousReport.collection.drop().catch(err => console.log("Serious Reports collection doesn't exist"));

    console.log('Dropped existing collections');

    mongoose.connection.close();
  })
  .catch(err => {
    console.error('Error connecting to MongoDB', err);
  });
