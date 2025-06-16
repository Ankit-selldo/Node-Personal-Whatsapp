const mongoose = require("mongoose");

const whatsAppSessionSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  data: { type: Object, required: true },
  state: { type: Object },
  multidevice: { type: Boolean, default: true },
  lastUpdate: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

// Update lastUpdate timestamp before saving
whatsAppSessionSchema.pre('save', function(next) {
  this.lastUpdate = new Date();
  next();
});

module.exports = mongoose.model("WhatsAppSession", whatsAppSessionSchema);