import * as fileService from '../services/fileService.js';

export async function upload(req, res) {
  const result = await fileService.uploadFiles(req.files, req.body.metadata);
  res.json(result);
}

export async function list(req, res) {
  res.json(await fileService.listFiles());
}

export async function remove(req, res) {
  await fileService.deleteById(req.params.id);
  res.sendStatus(204);
}
