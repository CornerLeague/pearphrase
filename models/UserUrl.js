const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Ensure this path is correct
const User = require('./User'); // Import the User model

// Define the UserUrl model
const UserUrl = sequelize.define('UserUrl', {
  url: {
      type: DataTypes.STRING,
      allowNull: false,
  },
  cleanedText: {
      type: DataTypes.TEXT,
      allowNull: true,
  },
  audioData: {
      type: DataTypes.BLOB('long'), // Store the audio file as binary data (Blob)
      allowNull: true,
  },
  summaryText: {
    type: DataTypes.TEXT,  // Store the summarized text
    allowNull: true,
  },
  summaryAudioFile: {
      type: DataTypes.BLOB('long'), // Store the summary audio as binary data (Blob)
      allowNull: true,
  },
  userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
  },
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt fields
});

module.exports = UserUrl;

