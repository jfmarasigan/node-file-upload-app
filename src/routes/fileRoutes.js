import { Router } from 'express';
import { upload as multer } from '../middleware/upload.js';
import { totalFileSizeValidation } from '../middleware/totalFileSizeValidation.js';

import * as fileController from '../controllers/fileController.js';

const router = Router();

router.post('/upload', totalFileSizeValidation, multer.array('files'), fileController.upload);
router.get('/', fileController.list);
router.delete('/:id', fileController.remove);

export default router;
