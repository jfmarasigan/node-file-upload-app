import express from 'express';
import fileRoutes from './routes/fileRoutes.js';

export const app = express();
app.use(express.json());
app.use('/files', fileRoutes);
