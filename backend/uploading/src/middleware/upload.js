import multer from 'multer';
import { getParamValueNumeric } from '../services/parameterService.js';

const megabyte = 1024 * 1024;
const DEFAULT_FILE_SIZE_LIMIT = 20 * megabyte;
const PARAM_MAX_FILE_SIZE_MB = 'ATTACH_FILE_SIZE';

// Cache for file size limit with TTL (Time To Live)
let cachedFileSizeLimit = null;
let cacheTimestamp = null;
const CACHE_TTL = 15 * 60 * 1000;

/**
 * Get file size limit from database with caching
 * @returns {Promise<number>} File size limit in bytes
 */
async function getFileSizeLimit() {
  const now = Date.now();
  
  // Return cached value if still valid
  const isCacheStillValid = cachedFileSizeLimit !== null && cacheTimestamp !== null && (now - cacheTimestamp) < CACHE_TTL;
  if (isCacheStillValid) {
    return cachedFileSizeLimit;
  }

  try {
    const limitMB = await getParamValueNumeric(PARAM_MAX_FILE_SIZE_MB);
    
    if (limitMB !== null && limitMB !== undefined) {
      const limitBytes = parseFloat(limitMB) * megabyte;
      
      // Validate the limit is a positive number
      if (!isNaN(limitBytes) && limitBytes > 0) {
        cachedFileSizeLimit = limitBytes;
        cacheTimestamp = now;
        return cachedFileSizeLimit;
      }
    }
    
    // Fallback to default if parameter not found or invalid
    console.warn(`Parameter ${PARAM_MAX_FILE_SIZE_MB} not found or invalid, using default limit: ${DEFAULT_FILE_SIZE_LIMIT / megabyte} MB`);
    cachedFileSizeLimit = DEFAULT_FILE_SIZE_LIMIT;
    cacheTimestamp = now;
    return cachedFileSizeLimit;
  } catch (error) {
    console.error('Error retrieving file size limit from database:', error);
    // Use default limit on error
    if (cachedFileSizeLimit === null) {
      cachedFileSizeLimit = DEFAULT_FILE_SIZE_LIMIT;
      cacheTimestamp = now;
    }
    return cachedFileSizeLimit;
  }
}

/**
 * Create multer middleware instance with dynamic file size limit
 * @returns {Promise<object>} Multer instance
 */
async function createMulterInstance() {
  const fileSizeLimit = await getFileSizeLimit();
  
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: fileSizeLimit }
  });
}

/**
 * Creates a middleware function that uses multer with dynamic file size limit
 * This maintains backward compatibility with existing route usage: multer.array('files')
 */
export const upload = {
  array(fieldName = 'files') {
    return async (req, res, next) => {
      try {
        const multerInstance = await createMulterInstance();
        multerInstance.array(fieldName)(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  },
  
  single(fieldName = 'file') {
    return async (req, res, next) => {
      try {
        const multerInstance = await createMulterInstance();
        multerInstance.single(fieldName)(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  },
  
  fields(fields) {
    return async (req, res, next) => {
      try {
        const multerInstance = await createMulterInstance();
        multerInstance.fields(fields)(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  },
  
  none() {
    return async (req, res, next) => {
      try {
        const multerInstance = await createMulterInstance();
        multerInstance.none()(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  },
  
  any() {
    return async (req, res, next) => {
      try {
        const multerInstance = await createMulterInstance();
        multerInstance.any()(req, res, next);
      } catch (error) {
        next(error);
      }
    };
  }
};
