import { ClaimRepository } from '../db/repositories/claimDocRepository.js';
import { saveFile, deleteFile } from './storageService.js';
import { getFileLocationParameter } from './parameterService.js';
import path from 'path';

const claimRepository = new ClaimRepository();

export async function uploadFiles(files, metadata) {
  const results = [];

  await claimRepository.withTransaction(async (conn) => {
    for (const file of files) {
      if (metadata) {
        const filesMetadata = JSON.parse(metadata);
        const fileMeta = filesMetadata.find(fm => fm.fileName === file.originalname);

        // retrieve parameter value
        const { fileLocation, pathOrigin } = await getFileLocationParameter('MEDIA_PATH_CLM');

        // construct subfolder path
        const claimFilePathParts = await claimRepository.getClaimFilePathParts(fileMeta.claimId);
        const subfolderPath = path.join(
          claimFilePathParts.lineCd, 
          claimFilePathParts.claimNumber, 
          "REQD_DOCS",
          fileMeta.clmDocCd, 
          file.originalname
        );

        // construct upload file path
        const uploadFilePath = path.join(fileLocation, subfolderPath);

        // save file to storage
        const storage = await saveFile(pathOrigin, uploadFilePath, file);

        const r = await claimRepository.saveClaimRequiredDocs(
          {
            userId: fileMeta ? fileMeta.userId : null,
            claimId: fileMeta ? fileMeta.claimId : null,
            clmDocCd: fileMeta ? fileMeta.clmDocCd : null,
            docSbmttdDt: fileMeta ? fileMeta.docSbmttdDt : null,
            docCmpltdDt: fileMeta ? fileMeta.docCmpltdDt : null,
            frwdBy: fileMeta ? fileMeta.frwdBy : null,
            frwdFr: fileMeta ? fileMeta.frwdFr : null,
            remarks: fileMeta ? fileMeta.remarks : null,
            fileName: `${uploadFilePath}/${file.originalname}`,
            fileExt: file.originalname.split('.').pop(),
            pathOrigin: pathOrigin
          },
          conn
        );

        results.push({ 
          fileDocCd: fileMeta ? fileMeta.clmDocCd : null, 
          status: 'success', 
          ...storage 
        });
      }
    }
  });

  return results;
}

export async function listFiles() {
  return await claimRepository.findAll();
}

export async function deleteClaimRequiredDocument(claimId, clmDocCd) {
  // check if claim required document exists
  const claimRequiredDoc = await claimRepository.findByClaimIdAndClmDocCd(claimId, clmDocCd);
  if (!claimRequiredDoc) {
    throw new Error('Claim required document not found');
  }
  // delete file from storage
  await deleteFile(claimRequiredDoc);
  // delete claim required document from database
  await claimRepository.deleteByClaimIdAndClmDocCd(claimId, clmDocCd);
}
