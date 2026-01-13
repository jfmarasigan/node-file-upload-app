export const env = {
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_CONNECT_STRING: `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE}`,
  AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME
};
