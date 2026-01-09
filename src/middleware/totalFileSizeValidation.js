import { getParamValueNumeric } from '../services/parameterService.js';

const PARAM_MAX_PATH_SIZE_MB = 'ATTACH_PATH_SIZE';

export const totalFileSizeValidation = async (req, res, next) => {
  const MAX_FILE_SIZE_MB = await getParamValueNumeric(PARAM_MAX_PATH_SIZE_MB);
  if (!MAX_FILE_SIZE_MB) {
    return res.status(400).json({ error: 'Max file size parameter not found' });
  } else if (req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  } else {
    const totalSize = req.files.reduce((acc, file) => acc + file.size, 0);
    if (totalSize > parseFloat(MAX_FILE_SIZE_MB)) {
      return res.status(400).json({ error: 'Total file size exceeds the max file size parameter' });
    } else {
      next();
    }
  }
};