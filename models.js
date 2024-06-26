const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new Schema({
  message_id: { type: Number, required: true, unique: true },
  content: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  opened: { type: Boolean, default: false },
  unique_id: { type: String, required: true, unique: true },
  ip_created: { type: String, required: true }
});

const reportSchema = new Schema({
  message_id: { type: Number, required: true },
  report_count: { type: Number, default: 1 }
});

const seriousReportSchema = new Schema({
  message_id: { type: Number, required: true },
  report_count: { type: Number, required: true }
});

const Message = mongoose.model('Message', messageSchema);
const Report = mongoose.model('Report', reportSchema);
const SeriousReport = mongoose.model('SeriousReport', seriousReportSchema);

module.exports = { Message, Report, SeriousReport };
