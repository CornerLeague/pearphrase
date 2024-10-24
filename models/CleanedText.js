const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Define the CleanedText model
const CleanedText = sequelize.define('CleanedText', {
  url: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  cleanedText: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
}, {
  timestamps: true, // Automatically adds createdAt and updatedAt fields
});

module.exports = CleanedText;
