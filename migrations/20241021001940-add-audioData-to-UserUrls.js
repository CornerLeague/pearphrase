'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
      // Add the new 'audioData' column to the UserUrls table
      await queryInterface.addColumn('UserUrls', 'audioData', {
          type: Sequelize.BLOB('long'), // Storing audio data as binary (BLOB)
          allowNull: true,              // This column is optional (nullable)
      });
  },

  down: async (queryInterface, Sequelize) => {
      // Remove the 'audioData' column if we ever need to rollback
      await queryInterface.removeColumn('UserUrls', 'audioData');
  }
};
