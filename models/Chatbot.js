import mongoose from 'mongoose';
const { Schema } = mongoose;

// CHATBOT CUSTOMIZATION SCHEMA

const chatbotCustomizationSchema = new Schema({
    admin: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    headerColor: {
      type: String,
      default: '#334758' // Default blue color
    },
    backgroundColor: {
      type: String,
      default: '#EEEEEE' // Default light gray
    },
    welcomeMessage: {
      type: String,
      default: '👋 Want to chat about Hubly? I\'m an AI chatbot here to help you find your way.'
    },
    promptMessages: [{
      type: String,
      trim: true
    }],
    introductionForm: {
      enabled: {
        type: Boolean,
        default: true
      },
      fields: [{
        name: {
          type: String,
          enum: ['name', 'email', 'phone'],
          required: true
        },
        required: {
          type: Boolean,
          default: true
        },
        label: {
          type: String
        }
      }],
      submitButtonText: {
        type: String,
        default: 'Thank You!'
      }
    },
    missedChatTimer: {
      hours: {
        type: Number,
        default: 0,
        min: 0,
        max: 23
      },
      minutes: {
        type: Number,
        default: 10,
        min: 0,
        max: 59
      },
      seconds: {
        type: Number,
        default: 0,
        min: 0,
        max: 59
      }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  }, {
    timestamps: true
  });
  
  // Ensure only one active configuration per admin
  chatbotCustomizationSchema.index({ admin: 1 }, { unique: true });
  
  // Create and export the ChatbotCustomization model
  const ChatbotCustomization = mongoose.model('ChatbotCustomization', chatbotCustomizationSchema);
  export default ChatbotCustomization;
  