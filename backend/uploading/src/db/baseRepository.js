import { getConnection } from './oracle.js';

/**
 * Base repository class that provides common database operations
 * and connection management. All specific repositories should extend this class.
 */
export class BaseRepository {
  /**
   * Execute a query and return results
   * @param {string} sql - SQL query string
   * @param {object} binds - Query parameters
   * @param {object} options - Query options
   * @returns {Promise<object>} Query result with rows
   */
  async executeQuery(sql, binds = {}, options = {}) {
    const conn = await getConnection();
    try {
      const result = await conn.execute(sql, binds, options);
      return result.rows || [];
    } finally {
      await conn.close();
    }
  }

  /**
   * Execute a stored procedure
   * @param {string} procedure - Stored procedure call string
   * @param {object} binds - Procedure parameters
   * @param {object} options - Procedure options
   * @returns {Promise<object>} Procedure result with outBinds
   */
  async executeProcedure(procedure, binds = {}, options = {}) {
    const conn = await getConnection();
    try {
      const result = await conn.execute(procedure, binds, options);
      return result;
    } finally {
      await conn.close();
    }
  }

  /**
   * Execute operations within a transaction
   * @param {Function} callback - Function that receives a connection and performs operations
   * @returns {Promise<any>} Result from the callback
   */
  async withTransaction(callback) {
    const conn = await getConnection();
    try {
      const result = await callback(conn);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      await conn.close();
    }
  }

  /**
   * Execute a query within a transaction (for operations that need to be committed together)
   * @param {string} sql - SQL query string
   * @param {object} binds - Query parameters
   * @param {object} options - Query options
   * @param {object} connection - Existing connection (from withTransaction)
   * @returns {Promise<object>} Query result
   */
  async executeQueryInTransaction(sql, binds = {}, options = {}, connection) {
    if (!connection) {
      throw new Error('Connection must be provided for transaction operations');
    }
    const result = await connection.execute(sql, binds, options);
    return result.rows || [];
  }

  /**
   * Execute a stored procedure within a transaction
   * @param {string} procedure - Stored procedure call string
   * @param {object} binds - Procedure parameters
   * @param {object} options - Procedure options
   * @param {object} connection - Existing connection (from withTransaction)
   * @returns {Promise<object>} Procedure result
   */
  async executeProcedureInTransaction(procedure, binds = {}, options = {}, connection) {
    if (!connection) {
      throw new Error('Connection must be provided for transaction operations');
    }
    return await connection.execute(procedure, binds, options);
  }
}

