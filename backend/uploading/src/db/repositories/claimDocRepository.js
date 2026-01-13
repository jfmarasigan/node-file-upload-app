import oracledb from 'oracledb';
import { BaseRepository } from '../baseRepository.js';

/**
 * Repository for QUICK_CLAIMS stored procedure operations
 */
export class ClaimRepository extends BaseRepository {
  
  /**
   * Get claim file path parts by claim ID
   * @param {string|number} claimId - Claim ID
   * @returns {Promise<object|null>} Claim file path parts or null if not found
   */
  async getClaimFilePathParts(claimId) {
    const rows = await this.executeQuery(
      `SELECT get_claim_number(:claimId) as claim_number, line_cd 
         FROM gicl_claims 
        WHERE claim_id = :claimId`,
      { claimId: claimId }
    );
    return rows.length > 0 ? { claimNumber: rows[0].CLAIM_NUMBER, lineCd: rows[0].LINE_CD } : { claimNumber: null, lineCd: null };
  }
  
  /**
   * Save claim required documents using the stored procedure
   * @param {object} params - Procedure parameters
   * @param {string|number} params.claimId - Claim ID
   * @param {string} params.clmDocCd - Claim document code
   * @param {Date|string} params.docSbmttdDt - Document submitted date
   * @param {Date|string} params.docCmpltdDt - Document completed date
   * @param {string} params.remarks - Remarks
   * @param {string} params.frwdBy - Forwarded by
   * @param {string} params.frwdFr - Forwarded from
   * @param {string} params.userId - User ID
   * @param {string} params.fileName - File name
   * @param {string} params.fileExt - File extension
   * @param {string} params.pathOrigin - Path origin
   * @param {object} connection - Optional connection for transaction
   * @returns {Promise<object>} Procedure result with status in outBinds
   */
  async saveClaimRequiredDocs(params, connection = null) {
    const binds = {
      userId: params.userId || null,
      claimId: params.claimId || null,
      clmDocCd: params.clmDocCd || null,
      docSbmttdDt: params.docSbmttdDt || null,
      docCmpltdDt: params.docCmpltdDt || null,
      frwdBy: params.frwdBy || null,
      frwdFr: params.frwdFr || null,
      remarks: params.remarks || null,
      fileName: params.fileName || null,
      fileExt: params.fileExt || null,
      pathOrigin: params.pathOrigin || null
    };

    // TO DO: Add saving to gicl_reqd_docs_atch table
    const procedure = `CALL SAVE_CLM_REQD_DOC(
      :claimId,
      :clmDocCd,
      :docSbmttdDt,
      :docCmpltdDt,
      :remarks,
      :frwdBy,
      :frwdFr,
      :userId,
      :fileName,
      :fileExt,
      :pathOrigin)`;

    if (connection) {
      return await this.executeProcedureInTransaction(procedure, binds, {}, connection);
    } else {
      return await this.executeProcedure(procedure, binds);
    }
  }

  /**
   * Get all files from GICL_CLAIM_REQUIRED_DOCS
   * @returns {Promise<Array>} Array of claim required documents records
   */
  async findAll() {
    return await this.executeQuery('SELECT * FROM GICL_CLAIM_REQUIRED_DOCS');
  }

  /**
   * Find a file by Claim ID and Claim Document Code  
   * @param {string|number} claimId - Claim ID
   * @param {string} clmDocCd - Claim Document Code
   * @returns {Promise<object|null>} Claim required documents record or null if not found
   */
  async findByClaimIdAndClmDocCd(claimId, clmDocCd) {
    const rows = await this.executeQuery(
      `SELECT * FROM GICL_CLAIM_REQUIRED_DOCS WHERE CLAIM_ID = :claimId AND CLM_DOC_CD = :clmDocCd`,
      { claimId: claimId, clmDocCd: clmDocCd }
    );
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Delete a claim required documents by Claim ID and Claim Document Code
   * @param {string|number} claimId - Claim ID
   * @param {string} clmDocCd - Claim Document Code
   * @param {object} connection - Optional connection for transaction
   * @returns {Promise<void>}
   */
  async deleteByClaimIdAndClmDocCd(claimId, clmDocCd, connection = null) {
    if (connection) {
      await this.executeQueryInTransaction(
        'DELETE FROM GICL_REQD_DOCS WHERE CLAIM_ID = :claimId AND CLM_DOC_CD = :clmDocCd',
        { claimId: claimId, clmDocCd: clmDocCd },
        {},
        connection
      );
    } else {
      await this.withTransaction(async (conn) => {
        await this.executeQueryInTransaction(
          'DELETE FROM GICL_REQD_DOCS WHERE CLAIM_ID = :claimId AND CLM_DOC_CD = :clmDocCd',
          { claimId: claimId, clmDocCd: clmDocCd },
          {},
          conn
        );
      });
    }
  }
}

