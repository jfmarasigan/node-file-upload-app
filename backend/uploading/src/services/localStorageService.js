import fs from 'fs/promises';
import path from 'path';

export async function saveLocal(file, fileLocation) {
  await fs.mkdir(fileLocation, { recursive: true });

  const fullPath = path.join(fileLocation, file.originalname);

  await fs.writeFile(fullPath, file.buffer);

  return {
    storageType: 'LOCAL',
    storageName: file.originalname,
    storagePath: fullPath
  };
}

export async function deleteLocal(meta) {
  await fs.unlink(meta.storagePath);
}
