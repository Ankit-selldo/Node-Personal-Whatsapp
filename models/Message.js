const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true,
    index: true 
  },
  chatId: { 
    type: String, 
    required: true,
    index: true 
  },
  sender: { 
    type: String, 
    required: true 
  },
  message: { 
    type: String, 
    required: true,
    default: "(Media Message)" // Default value for media messages
  },
  messageId: { 
    type: String,
    sparse: true // Index only non-null values
  },
  timestamp: { 
    type: String, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true 
  },
  status: { 
    type: String, 
    enum: ['sent', 'delivered', 'read', 'failed'],
    default: 'sent'
  },
  metadata: {
    type: {
      type: String,
      enum: ['chat', 'image', 'video', 'document', 'audio', 'sticker', 'location', 'contact', 'text'],
      default: 'text'
    },
    hasMedia: {
      type: Boolean,
      default: false
    },
    messageType: {
      type: String,
      default: 'text'
    },
    additional: mongoose.Schema.Types.Mixed
  }
});

// Compound index for faster queries
messageSchema.index({ userId: 1, createdAt: -1 });
messageSchema.index({ chatId: 1, createdAt: -1 });

// Pre-save middleware to ensure message field has a value
messageSchema.pre('save', function(next) {
  if (!this.message && this.metadata && this.metadata.hasMedia) {
    this.message = "(Media Message)";
  }
  next();
});

module.exports = mongoose.model("Message", messageSchema);