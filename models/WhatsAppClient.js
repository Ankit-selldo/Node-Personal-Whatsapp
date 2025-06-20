const mongoose = require("mongoose");

const whatsAppClientSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  qr: { type: String, default: null },
  isAuthenticated: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Update the updatedAt field before saving
whatsAppClientSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("WhatsAppClient", whatsAppClientSchema);
