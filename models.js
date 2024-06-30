const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const messageSchema = new mongoose.Schema({
  message_id: { type: Number, required: true, unique: true },
  content: { type: String, required: true, maxlength: 1000 },
  created_at: { type: Date, default: Date.now },
  opened: { type: Boolean, default: false },
  unique_id: { type: String, required: true, unique: true },
  ip_created: { type: String, required: true },
  opened_at: { type: Date, default: null } // Add this field to store the timestamp when the message was last opened
});

const reportSchema = new mongoose.Schema({
  message_id: { type: Number, required: true },
  report_count: { type: Number, default: 1 },
  reported_by_ips: [{ type: String }]
});

const seriousReportSchema = new Schema({
  message_id: { type: Number, required: true },
  report_count: { type: Number, default: 10 },
  ip_created: { type: String, required: true }
});

const Message = mongoose.model('Message', messageSchema);
const Report = mongoose.model('Report', reportSchema);
const SeriousReport = mongoose.model('SeriousReport', seriousReportSchema);

module.exports = { Message, Report, SeriousReport };
