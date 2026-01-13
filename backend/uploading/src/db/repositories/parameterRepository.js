import { BaseRepository } from '../baseRepository.js';

/**
 * Repository for GIIS_PARAMETERS table operations
 */
export class ParameterRepository extends BaseRepository {
  /**
   * Get parameter value by parameter name
   * @param {string} paramName - Parameter name
   * @returns {Promise<object|null>} Parameter object with fileLocation and pathOrigin, or null if not found
   */
  async getFileLocationParameter(paramName) {
    const rows = await this.executeQuery(
      'SELECT PARAM_VALUE_V, PATH_ORIGIN FROM GIIS_PARAMETERS WHERE PARAM_NAME = :key',
      { key: paramName }
    );

    if (rows.length === 0) {
      return null;
    }

    return {
      fileLocation: rows[0].PARAM_VALUE_V,
      pathOrigin: rows[0].PATH_ORIGIN
    };
  }

  /**
   * Get initial settings from GIIS_PARAMETERS table
   * @returns {Promise<object|null>} Initial settings object with aws id, key, and region, or null if not found
   */
  async getInitalSettings() {
    const rows = await this.executeQuery(
      `SELECT id, key, region
     	  FROM TABLE (giis_parameters_pkg.get_aws_s3_credentials)
       WHERE rownum = 1`,
      {}
    );

    if (rows.length === 0) {
      return null;
    }

    return {
      id: rows[0].ID,
      key: rows[0].KEY,
      region: rows[0].REGION
    };
  }

  /**
   * Get a simple parameter value by parameter name
   * @param {string} paramName - Parameter name
   * @returns {Promise<string|null>} Parameter value as string, or null if not found
   */
  async getParameterValue(paramName) {
    const rows = await this.executeQuery(
      'SELECT PARAM_VALUE_V FROM GIIS_PARAMETERS WHERE PARAM_NAME = :key',
      { key: paramName }
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].PARAM_VALUE_V;
  }

  /**
   * Get a numeric parameter value by parameter name
   * @param {string} paramName - Parameter name
   * @returns {Promise<number|null>} Parameter value as number, or null if not found
   */
  async getParameterValueNumeric(paramName) {
    const rows = await this.executeQuery(
      'SELECT PARAM_VALUE_N FROM GIIS_PARAMETERS WHERE PARAM_NAME = :key',
      { key: paramName }
    );

    if (rows.length === 0) {
      return null;
    }

    return rows[0].PARAM_VALUE_N;
  }
}
