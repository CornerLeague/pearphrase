'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Add the new 'summaryAudioFile' column to the UserUrls table
    await queryInterface.addColumn('UserUrls', 'summaryAudioFile', {
      type: Sequelize.BLOB('long'), // Storing audio data as binary (BLOB)
      allowNull: true,              // This column is optional (nullable)
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Remove the 'summaryAudioFile' column if we ever need to rollback
    await queryInterface.removeColumn('UserUrls', 'summaryAudioFile');
  }
};

