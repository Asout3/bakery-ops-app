import dotenv from 'dotenv';
import { startArchiveScheduler } from './services/archiveService.js';

dotenv.config();

startArchiveScheduler();

console.log('[INFO] Worker started: archive scheduler loop is active');
