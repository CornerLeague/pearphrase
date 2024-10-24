'use strict';

// migrations/20231020_add_summaryText_to_UserUrls.js
module.exports = {
  up: async (queryInterface, Sequelize) => {
      // Add the new 'summaryText' column to the UserUrls table
      await queryInterface.addColumn('UserUrls', 'summaryText', {
          type: Sequelize.TEXT,  // This will store the summarized text
          allowNull: true,       // Allow it to be nullable at first
      });
  },

  down: async (queryInterface, Sequelize) => {
      // Remove the 'summaryText' column if we ever need to rollback
      await queryInterface.removeColumn('UserUrls', 'summaryText');
  }
};


