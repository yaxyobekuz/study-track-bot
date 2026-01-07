const mongoose = require("mongoose");
const { config } = require("./index");

const connectDB = async () => {
  try {
    const db = await mongoose.connect(config.mongodbUri);
    console.log(`✅ MongoDB connected: ${db.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
