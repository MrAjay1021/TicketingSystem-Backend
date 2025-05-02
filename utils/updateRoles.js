import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.js';

// Load environment variables from .env
dotenv.config();

const updateRoles = async () => {
  try {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }
    // Connect to MongoDB
    await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Update users with role 'customer' to 'admin'
    const result = await User.updateMany(
      { role: 'customer' },
      { $set: { role: 'admin' } }
    );

    console.log(`Modified ${result.modifiedCount} user(s) from 'customer' to 'admin'`);
    process.exit(0);
  } catch (error) {
    console.error('Error updating roles:', error);
    process.exit(1);
  }
};

updateRoles();