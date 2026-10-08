/**
 * Database Connection Module
 * Connects to MongoDB using Mongoose with friendly error handling.
 */
const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/logmonitor';

  try {
    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[DB] Connected to MongoDB at: ${conn.connection.host}:${conn.connection.port}/${conn.connection.name}`);
    return conn;
  } catch (error) {
    console.error('\n' + '='.repeat(70));
    console.error('[DATABASE ERROR] Failed to connect to MongoDB!');
    console.error(`Target URI: ${uri}`);
    console.error(`Reason: ${error.message}`);
    console.error('='.repeat(70));
    console.error('How to resolve this:');
    console.error(' 1. If using local MongoDB:');
    console.error('    - Windows: Run "net start MongoDB" in admin PowerShell, or check Services.msc');
    console.error('    - Mac:     Run "brew services start mongodb/brew/mongodb-community"');
    console.error('    - Linux:   Run "sudo systemctl start mongod"');
    console.error(' 2. If using MongoDB Atlas cloud:');
    console.error('    - Create a free cluster at https://www.mongodb.com/cloud/atlas');
    console.error('    - Put the connection string into your .env file:');
    console.error('      MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/logmonitor');
    console.error('='.repeat(70) + '\n');
    process.exit(1);
  }
}

module.exports = { connectDB };
