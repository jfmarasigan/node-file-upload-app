import { BaseRepository } from '../baseRepository.js';

/**
 * Repository for FILE_METADATA table operations
 */
export class FileRepository extends BaseRepository {
  /**
   * Get all files from FILE_METADATA
   * @returns {Promise<Array>} Array of file metadata records
   */
  async findAll() {
    return await this.executeQuery('SELECT * FROM FILE_METADATA');
  }

  /**
   * Find a file by ID
   * @param {string|number} fileId - File ID
   * @returns {Promise<object|null>} File metadata record or null if not found
   */
  async findById(fileId) {
    const rows = await this.executeQuery(
      'SELECT * FROM FILE_METADATA WHERE FILE_ID = :id',
      { id: fileId }
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Delete a file by ID
   * @param {string|number} fileId - File ID
   * @param {object} connection - Optional connection for transaction
   * @returns {Promise<void>}
   */
  async deleteById(fileId, connection = null) {
    if (connection) {
      await this.executeQueryInTransaction(
        'DELETE FROM FILE_METADATA WHERE FILE_ID = :id',
        { id: fileId },
        {},
        connection
      );
    } else {
      await this.withTransaction(async (conn) => {
        await this.executeQueryInTransaction(
          'DELETE FROM FILE_METADATA WHERE FILE_ID = :id',
          { id: fileId },
          {},
          conn
        );
      });
    }
  }
}

