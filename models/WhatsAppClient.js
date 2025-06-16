const mongoose = require("mongoose");

const whatsAppClientSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  qr: { type: String, default: null },
  isAuthenticated: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  sessionStatus: { 
    type: String, 
    enum: ['ACTIVE', 'LOGGED_OUT', 'DISCONNECTED'],
    default: 'ACTIVE' 
  },
  lastActive: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt and lastActive fields before saving
whatsAppClientSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  if (this.isActive) {
    this.lastActive = new Date();
  }
  next();
});

module.exports = mongoose.model("WhatsAppClient", whatsAppClientSchema);