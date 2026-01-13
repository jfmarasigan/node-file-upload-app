import oracledb from 'oracledb';
import { env } from '../config/env.js';

oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;

let pool;

export async function initPool() {
  console.log("Initializing Oracle pool with connect string: ", env.DB_CONNECT_STRING);
  pool = await oracledb.createPool({
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    connectString: env.DB_CONNECT_STRING
  });
}

export async function getConnection() {
  if (!pool) throw new Error('Oracle pool not initialized');
  return pool.getConnection();
}

export async function closePool() {
  if (pool) {
    await pool.close(10); // 10 seconds to wait for connections to close
    pool = null;
  }
}