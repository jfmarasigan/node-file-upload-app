import { getFileLocationParameter } from './parameterService.js';
import { saveLocal, deleteLocal } from './localStorageService.js';
import { saveS3, deleteS3 } from './s3StorageService.js';

export async function saveFile(pathOrigin, fileLocation, file) {
  if (pathOrigin === 'S3') {
    return saveS3(file, fileLocation);
  } else {
    return saveLocal(file, fileLocation);
  }
}

export async function deleteFile(meta) {
  const paramValue = await getFileLocationParameter('STORAGE_TYPE');
  if (paramValue?.pathOrigin === 'S3') {
    return deleteS3(meta);
  } else {
    return deleteLocal(meta);
  }
}
