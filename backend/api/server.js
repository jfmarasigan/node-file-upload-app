import express from 'express';
import cors from 'cors';
import oracledb from 'oracledb';
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import jwt from 'jsonwebtoken';
import { generateSchema, validateJsonPayload } from './jsonSchemaUtils.js';

const app = express();

// Load database configuration
let dbConfig;
try {
  dbConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'database.json'), 'utf8'));
  console.log('Database configuration loaded successfully');
  console.log(`Database type: ${dbConfig.type}`);
  
  // Validate database type
  if (!['oracle', 'mysql'].includes(dbConfig.type)) {
    console.error('Invalid database type in configuration. Must be "oracle" or "mysql"');
    process.exit(1);
  }
} catch (error) {
  console.error('Error loading database configuration:', error);
  process.exit(1);
}

// Initialize MySQL connection pool
let mysqlPool;

function initMySQLPool() {
  if (!mysqlPool && dbConfig.type === 'mysql') {
    mysqlPool = mysql.createPool({
      host: dbConfig.host,
      port: parseInt(dbConfig.port),
      user: dbConfig.username,
      password: dbConfig.password,
      database: dbConfig.database,
      namedPlaceholders: true,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      maxIdle: 10,
      idleTimeout: 60000,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30000,
      charset: 'utf8mb4_0900_ai_ci'
    });
    console.log('MySQL connection pool initialized');
    
    // Add error handling for the pool
    mysqlPool.on('error', (err) => {
      console.error('MySQL Pool Error:', err);
    });
  }
  return mysqlPool;
}

// Call this during server startup
if (dbConfig.type === 'mysql') {
  initMySQLPool();
}

// Database connection functions
async function getConnection() {
  try {
    console.log(`Getting connection for ${dbConfig.type} database...`);
    if (dbConfig.type === 'oracle') {
      return await oracledb.getConnection({
        user: dbConfig.username,
        password: dbConfig.password,
        connectString: `${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`
      });
    } else if (dbConfig.type === 'mysql') {
      // Get connection from pool
      return await mysqlPool.getConnection();
    }
  } catch (error) {
    console.error(`Error connecting to ${dbConfig.type} database:`, error);
    throw error;
  }
}

// Execute query function that supports both Oracle and MySQL
async function executeQuery(sql, params = {}, options = {}) {
  let connection;
  try {
    connection = await getConnection();
    
    if (dbConfig.type === 'oracle') {
      const result = await connection.execute(sql, params, options);
      return result;
    } else if (dbConfig.type === 'mysql') {
      // Set autoCommit if needed
      if (options.autoCommit !== undefined) {
        await connection.execute('SET autocommit=' + (options.autoCommit ? '1' : '0'));
      }

      const [rows] = await connection.execute(sql, params);

      // Commit if needed
      if (options.autoCommit === false) {
        await connection.commit();
      }

      return { rows };
    }
  } finally {
    if (connection) {
      try {
        if (dbConfig.type === 'oracle') {
          await connection.close();
        } else if (dbConfig.type === 'mysql') {
          // Release MySQL connection back to the pool
          connection.release();
        }
      } catch (err) {
        console.error('Error handling connection:', err);
      }
    }
  }
}

// Execute stored procedure function that supports both Oracle and MySQL
async function executeProcedure(originalProcedureBody, procedureBody, params = {}, options = {}) {
  let connection;
  try {
    connection = await getConnection();

    if (dbConfig.type === 'oracle') {
      // Oracle procedure execution
      const sql = `BEGIN ${procedureBody}; END;`;
      return await connection.execute(sql, params, options);
    } else if (dbConfig.type === 'mysql') {
      try {
        await connection.beginTransaction();

        const paramNames = Object.keys(params);
        const inParams = [];
        const outParams = {};
        let mysqlSql = procedureBody.trim();

        // Find all output parameters in the original procedure
        const outputParamRegex = /@(\w+)/g;
        const outputParams = [];
        let outputMatch;
        
        while ((outputMatch = outputParamRegex.exec(originalProcedureBody)) !== null) {
          const paramName = outputMatch[1];
          outputParams.push(paramName);
        }

        // For MySQL, we need to handle output parameters differently
        // We'll use a different approach for procedures with output parameters
        if (outputParams.length > 0) {
          console.log('Found output parameters:', outputParams);
          
          // For each output parameter, we need to set it to NULL before the procedure call
          for (const paramName of outputParams) {
            await connection.execute(`SET @${paramName} = NULL`);
          }
          
          // Now execute the procedure
          // Single pass parameter replacement
          const allParamRegex = /(\{(\w+)\}|:(\w+))/g;
          const paramPositions = [];
          let match;

          // First collect all parameter positions
          while ((match = allParamRegex.exec(mysqlSql)) !== null) {
            const fullMatch = match[0];
            const isPathParam = fullMatch.startsWith('{');
            const paramName = isPathParam ? fullMatch.slice(1, -1) : fullMatch.slice(1);
            
            if (params[paramName] !== undefined) {
              paramPositions.push({
                start: match.index,
                end: match.index + fullMatch.length,
                paramName,
                value: params[paramName]
              });
            }
          }

          // Replace parameters from end to start to maintain correct positions
          paramPositions.sort((a, b) => b.start - a.start);
          for (const pos of paramPositions) {
            mysqlSql = mysqlSql.substring(0, pos.start) + '?' + mysqlSql.substring(pos.end);
            inParams.unshift(pos.value);
          }

          console.log('Executing MySQL statement:', mysqlSql);
          console.log('With parameters:', inParams);
          
          // Execute the DML statement directly
          await connection.execute(mysqlSql, inParams);
          
          // After procedure execution, fetch the output parameter values
          for (const paramName of outputParams) {
            try {
              const [rows] = await connection.query(`SELECT @${paramName} as value`);
              if (rows && rows.length > 0) {
                outParams[paramName] = rows[0].value;
                console.log(`Captured output parameter ${paramName}:`, outParams[paramName]);
              }
            } catch (err) {
              console.error(`Error fetching output parameter ${paramName}:`, err);
            }
          }
        } else {
          // No output parameters, proceed with normal execution
          // Single pass parameter replacement
          const allParamRegex = /(\{(\w+)\}|:(\w+))/g;
          const paramPositions = [];
          let match;

          // First collect all parameter positions
          while ((match = allParamRegex.exec(mysqlSql)) !== null) {
            const fullMatch = match[0];
            const isPathParam = fullMatch.startsWith('{');
            const paramName = isPathParam ? fullMatch.slice(1, -1) : fullMatch.slice(1);
            
            if (params[paramName] !== undefined) {
              paramPositions.push({
                start: match.index,
                end: match.index + fullMatch.length,
                paramName,
                value: params[paramName]
              });
            }
          }

          // Replace parameters from end to start to maintain correct positions
          paramPositions.sort((a, b) => b.start - a.start);
          for (const pos of paramPositions) {
            mysqlSql = mysqlSql.substring(0, pos.start) + '?' + mysqlSql.substring(pos.end);
            inParams.unshift(pos.value);
          }

          console.log('Executing MySQL statement:', mysqlSql);
          console.log('With parameters:', inParams);
          
          // Execute the DML statement directly
          await connection.execute(mysqlSql, inParams);
        }

        await connection.commit();
        return { outBinds: outParams };
      } catch (error) {
        console.error('Error in MySQL procedure execution, rolling back transaction:', error);
        await connection.rollback();
        throw error;
      }
    }
  } finally {
    if (connection) {
      try {
        if (dbConfig.type === 'oracle') {
          await connection.close();
        } else if (dbConfig.type === 'mysql') {
          // Release MySQL connection back to the pool
          connection.release();
        }
      } catch (err) {
        console.error('Error handling connection:', err);
      }
    }
  }
}

// Update CORS options
const corsOptions = {
  origin: [ 'http://192.168.1.36:8081', 
            'http://192.168.1.36:8083',
            'http://192.168.30.14:8081',
            'http://192.168.30.22:8081',
            'http://192.168.30.22:8083',
            'http://192.168.30.22:3000',
            'http://192.168.30.22:3011',
            'http://localhost:5173', 
            'http://127.0.0.1:5173', 
            'http://localhost:8081', 
            'http://127.0.0.1:8081',  
            'http://127.0.0.1:8083', 
            'http://localhost:8083',  
            'http://localhost:3000', 
            'http://localhost:8080', 
            'http://localhost:3011',
            'http://localhost:3012',
            'http://localhost:3013',
            'http://192.168.30.14:8083' ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Accept', 'Authorization'],
  credentials: true,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware before other middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Set default content type to JSON
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.use(express.json());

// Add a health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Test database connection endpoint
app.post('/api/test-connection', async (req, res) => {
  let connection;
  try {
    connection = await getConnection();
    console.log('Connection established successfully');
    
    // Try a simple query to verify the connection
    console.log('Executing test query...');
    let result;
    
    if (dbConfig.type === 'oracle') {
      result = await connection.execute('SELECT SYSDATE FROM DUAL');
      console.log('Test query executed successfully:', result.rows[0][0]);
      
      res.json({
        success: true,
        message: 'Successfully connected to Oracle database',
        timestamp: result.rows[0][0]
      });
    } else if (dbConfig.type === 'mysql') {
      const [rows] = await connection.execute('SELECT NOW() as timestamp');
      console.log('Test query executed successfully:', rows[0].timestamp);
      
      res.json({
        success: true,
        message: 'Successfully connected to MySQL database',
        timestamp: rows[0].timestamp
      });
    }
  } catch (error) {
    console.error('Connection test failed. Full error:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to database',
      details: error instanceof Error ? error.stack : undefined
    });
  } finally {
    if (connection) {
      try {
        if (dbConfig.type === 'oracle') {
          await connection.close();
        } else if (dbConfig.type === 'mysql') {
          connection.release();
        }
        console.log('Connection closed successfully');
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
});

// Get all endpoints
app.get('/api/endpoints', (req, res) => {
  try {
    const endpointsPath = path.join(process.cwd(), 'endpoints.json');
    console.log('Reading endpoints from:', endpointsPath);
    
    let endpoints = [];
    
    if (fs.existsSync(endpointsPath)) {
      try {
        const fileContent = fs.readFileSync(endpointsPath, 'utf8');
        endpoints = JSON.parse(fileContent);
      } catch (readError) {
        console.error('Error reading endpoints file:', readError);
        fs.writeFileSync(endpointsPath, '[]', 'utf8');
        endpoints = [];
      }
    } else {
      fs.writeFileSync(endpointsPath, '[]', 'utf8');
      console.log('Created new endpoints.json file at:', endpointsPath);
    }
    
    const endpointsWithDefaults = endpoints.map(ep => ({
        ...ep,
        pathParams: ep.pathParams || [],
        queryParams: ep.queryParams || []
    }));

    // Send the potentially defaulted data
    res.json(endpointsWithDefaults);
  } catch (error) {
    console.error('Error in /api/endpoints GET:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load endpoints'
    });
  }
});

// Save endpoints
app.post('/api/endpoints', (req, res) => {
  try {
    const endpointsPath = path.join(process.cwd(), 'endpoints.json');
    console.log('Saving endpoints to:', endpointsPath);
    
    // Sanitize and include pathParams and queryParams with all constraints
    function sanitizeParams(params) {
      return (params || []).map(param => ({
        name: param.name,
        type: param.type,
        required: param.required,
        ...(param.stringConstraints && { stringConstraints: param.stringConstraints }),
        ...(param.numberConstraints && { numberConstraints: param.numberConstraints }),
        ...(param.dateConstraints && { dateConstraints: param.dateConstraints })
      }));
    }

    const sanitizedEndpoints = req.body.map(endpoint => {
      // Generate schema if payload and payloadParams exist
      let jsonSchema = null;
      
      if (endpoint.payloadParams && endpoint.payloadParams.length > 0) {
        try {
          jsonSchema = generateSchema(endpoint.payloadParams);
          if (jsonSchema) {
            console.log(`Generated schema for endpoint ${endpoint.name}:`, jsonSchema);
          }
        } catch (schemaError) {
          console.error(`Error generating schema for endpoint ${endpoint.name}:`, schemaError);
          // Don't block endpoint saving if schema generation fails
        }
      }

      return {
        id: endpoint.id,
        name: endpoint.name,
        method: endpoint.method,
        url: endpoint.url,
        requireToken: Boolean(endpoint.requireToken),
        sqlQuery: endpoint.sqlQuery,
        sqlProcedure: endpoint.sqlProcedure,
        payload: endpoint.payload,
        pathParams: sanitizeParams(endpoint.pathParams),
        queryParams: sanitizeParams(endpoint.queryParams),
        payloadParams: sanitizeParams(endpoint.payloadParams),
        status: endpoint.status,
        lastUsed: endpoint.lastUsed,
        ...(jsonSchema && { jsonSchema }) // Only include schema if it was generated
      };
    });
    
    // Write to file with proper formatting
    const fileContent = JSON.stringify(sanitizedEndpoints, null, 2);
    
    // Check if file exists and is writable
    try {
      if (fs.existsSync(endpointsPath)) {
        console.log('File exists, checking permissions...');
        fs.accessSync(endpointsPath, fs.constants.W_OK);
        console.log('File is writable');
      } else {
        console.log('File does not exist, will create new file');
      }
    } catch (accessError) {
      console.error('File access error:', accessError);
      throw new Error(`File access error: ${accessError.message}`);
    }
    
    // Try to write the file
    try {
      fs.writeFileSync(endpointsPath, fileContent, 'utf8');
      console.log('Successfully saved endpoints to file');
      
      // Verify the file was written correctly
      const writtenContent = fs.readFileSync(endpointsPath, 'utf8');
      
      res.json(sanitizedEndpoints);
    } catch (writeError) {
      console.error('File write error:', writeError);
      throw new Error(`File write error: ${writeError.message}`);
    }
  } catch (error) {
    console.error('Error saving endpoints:', error);
    res.status(500).json({
      success: false,
      error: `Failed to save endpoints: ${error.message}`
    });
  }
});

// Get endpoint by name
app.get('/api/endpoints/:name', (req, res) => {
  try {
    const endpointsPath = path.join(process.cwd(), 'endpoints.json');
    const endpoints = JSON.parse(fs.readFileSync(endpointsPath, 'utf8'));
    const endpoint = endpoints.find(e => e.name === req.params.name);
    
    if (!endpoint) {
      return res.status(404).json({
        success: false,
        error: 'Endpoint not found'
      });
    }
    
    // Remove sensitive information before sending
    const { host, port, username, password, database, ...sanitizedEndpoint } = endpoint;
    res.json(sanitizedEndpoint);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to load endpoint'
    });
  }
});

// Add this helper function after the other parameter extraction helpers
function extractDollarParam(sql) {
  if (!sql) return null;
  // Keep the exact case as it appears in the SQL
  const dollarParamMatch = sql.match(/\$(\w+)/);
  return dollarParamMatch ? dollarParamMatch[1] : null;
}

// Helper function to extract input (:param) and output (@param) parameter names
// Returns an object: { pathParams: string[], queryParams: string[], outputParams: string[] }
function extractParamDetails(sql) {
  if (!sql) return { pathParams: [], queryParams: [], outputParams: [] };
  
  const pathParamRegex = /\{(\w+)\}/g;
  const queryParamRegex = /:([\w_]+)/g;
  const outputParamRegex = /@([\w_]+)/g;
  const dollarParamRegex = /\$(\w+)/g;
  
  // Get all matches
  const pathMatches = [...(sql.matchAll(pathParamRegex) || [])];
  const queryMatches = [...(sql.matchAll(queryParamRegex) || [])];
  const outputMatches = [...(sql.matchAll(outputParamRegex) || [])];
  const dollarParam = sql.match(dollarParamRegex)?.[1];

  // Get unique parameter names, excluding the dollar parameter
  const pathParams = [...new Set(pathMatches.map(match => match[1]))];
  const queryParams = [...new Set(queryMatches.map(match => match[1]))].filter(p => p !== dollarParam);
  const outputParams = [...new Set(outputMatches.map(match => match[1]))];

  return { 
    pathParams,
    queryParams: queryParams.filter(p => !pathParams.includes(p)),
    outputParams: outputParams.filter(p => !queryParams.includes(p) && !pathParams.includes(p))
  };
}

// Helper function to determine Oracle DB type based on parameter configuration
function getOracleType(paramName, paramConfig) {
  if (!paramConfig) {
    return oracledb.STRING; // Default to STRING if no config found
  }

  switch (paramConfig.type) {
    case 'number':
      return oracledb.NUMBER;
    case 'date':
      return oracledb.DATE;
    case 'string':
    default:
      return oracledb.STRING;
  }
}

import { parse } from 'date-fns';

function validateDateFormat(value, format) {
  try {
    // Convert Oracle SQL date format to date-fns format
    const fnsFormat = format
      .replace(/YYYY/g, 'yyyy')
      .replace(/YY/g, 'yy')
      .replace(/MM/g, 'MM')
      .replace(/DD/g, 'dd')
      .replace(/HH24/g, 'HH')
      .replace(/HH/g, 'hh')
      .replace(/MI/g, 'mm')
      .replace(/SS/g, 'ss')
      .replace(/AM|PM/g, 'a');

    const parsedDate = parse(value, fnsFormat, new Date());
    if (isNaN(parsedDate.getTime())) {
      throw new Error('Invalid date');
    }
    return true;
  } catch (error) {
    throw new Error(`Invalid date format. Expected format: ${format}`);
  }
}

function validateStringConstraints(value, constraints) {
  if (!constraints || !value) return true;

  if (constraints.maxLength && value.length > constraints.maxLength) {
    throw new Error(`Value exceeds maximum length of ${constraints.maxLength} characters`);
  }

  if (constraints.allowedValues) {
    const allowedList = constraints.allowedValues
      .split(',')
      .map(v => v.trim())
      .filter(v => v.length > 0);
    if (allowedList.length > 0 && !allowedList.includes(value)) {
      throw new Error(`Value must be one of: ${allowedList.join(', ')}`);
    }
  }

  return true;
}

function validateNumberConstraints(value, constraints) {
  if (!constraints) return true;

  const numValue = parseFloat(value);
  const { minimum, maximum, precision } = constraints;
  
  if (minimum !== undefined && numValue < minimum) {
    throw new Error(`Value must be greater than or equal to ${minimum}`);
  }
  
  if (maximum !== undefined && numValue > maximum) {
    throw new Error(`Value must be less than or equal to ${maximum}`);
  }

  if (precision !== undefined) {
    if (precision === 0) {
      // Integer validation
      if (!Number.isInteger(numValue)) {
        throw new Error('Value must be a whole number');
      }
    } else {
      // Decimal validation
      const decimalPlaces = value.toString().split('.')[1]?.length || 0;
      if (decimalPlaces > precision) {
        throw new Error(`Value cannot have more than ${precision} decimal places`);
      }
    }
  }

  return true;
}

function convertAndValidateValue(paramType, value, paramName, paramConfig) {
    if (value === null || value === undefined || String(value).trim() === '') {
        if (paramConfig?.required) {
            throw new Error(`Required ${paramType} parameter '${paramName}' must be provided.`);
        }
        return null;
    }

    const type = paramConfig?.type || 'string';
    const stringValue = String(value).trim();

    switch (type) {
        case 'string':
          if (paramConfig?.stringConstraints) {
              try {
                  validateStringConstraints(stringValue, paramConfig.stringConstraints);
              } catch (error) {
                  throw new Error(`Invalid value for ${paramType} parameter '${paramName}': ${error.message}`);
              }
          }
          return stringValue;
        case 'number':
          if (!/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(stringValue)) {
            throw new Error(`Invalid number value for ${paramType} parameter '${paramName}': ${value}`);
          }
          const numValue = parseFloat(stringValue);
          if (isNaN(numValue)) {
            throw new Error(`Invalid number value for ${paramType} parameter '${paramName}': ${value}`);
          }
          if (paramConfig?.numberConstraints) {
            try {
                validateNumberConstraints(value, paramConfig.numberConstraints);
            } catch (error) {
                throw new Error(`Invalid value for ${paramType} parameter '${paramName}': ${error.message}`);
            }
          }
          return numValue;
        case 'date':
          const dateFormat = paramConfig?.dateConstraints?.dateFormat || 'YYYY-MM-DD';
          try {
              validateDateFormat(value, dateFormat);
              return value;
          } catch (error) {
              throw new Error(`Invalid date format for ${paramType} parameter '${paramName}': ${error.message}`);
          }
        default:
            return stringValue;
    }
}

// Helper function to convert a URL pattern with {params} to a regex and capture group names
function convertUrlPatternToRegex(pattern) {
  if (!pattern) return { regex: null, paramNames: [] };
  
  const paramNames = [];
  let regexString = pattern;
  let optionalTrailingSegment = '';

  // Check if pattern ends with /{param}
  const endParamMatch = regexString.match(/\/{(\w+)}$/);
  if (endParamMatch) {
      const paramName = endParamMatch[1];
      paramNames.push(paramName);
      regexString = regexString.substring(0, endParamMatch.index);
      optionalTrailingSegment = `(?:\/(?<${paramName}>[^/]+))?`;
      console.log(`Pattern ends with /{${paramName}}. Base: "${regexString}", OptionalSegment: "${optionalTrailingSegment}"`);
  }

  regexString = regexString.replace(/\{(\w+)\}/g, (match, paramName) => {
    if (!paramNames.includes(paramName)) {
        paramNames.push(paramName);
    }
    const index = paramNames.indexOf(paramName);
    return `__CAPTUREGROUP_${index}__`; 
  });

  regexString = regexString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  paramNames.forEach((name, index) => {
      if (!endParamMatch || name !== endParamMatch[1]) {
          const placeholderRegex = new RegExp(`__CAPTUREGROUP_${index}__`, 'g');
          regexString = regexString.replace(placeholderRegex, `(?<${name}>[^/]+)`);
      }
  });

  regexString = `^${regexString}${optionalTrailingSegment}\/?$`;

  try {
    const regex = new RegExp(regexString);
    console.log(`Final Regex for pattern "${pattern}": ${regex}`);
    return { regex, paramNames };
  } catch (e) {
    console.error(`Error creating regex for pattern "${pattern}":`, e);
    return { regex: null, paramNames: [] };
  }
}

// Add JWT validation middleware
async function validateToken(req, res, next, endpoint) {
  let connection;
  try {
    if (!endpoint.requireToken) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ 
        success: false, 
        error: 'No authorization header provided' 
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'No token provided' 
      });
    }

    console.log('Token received:', token);

    // Verify whether the token is valid JWT format
    let decoded;
    try {
      decoded = jwt.decode(token, { complete: true });
    } catch (error) {
      console.error('Error decoding token:', error);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token format' 
      });
    }

    if (!decoded || !decoded.header || !decoded.payload) {
      console.error('Token decode failed, invalid structure');
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token structure' 
      });
    }

    const keyId = decoded.header.kid;
    if (!keyId) {
      console.error('No keyId in token header');
      return res.status(401).json({ 
        success: false, 
        error: 'Token missing keyId' 
      });
    }

    console.log('Looking up key for keyId:', keyId);
    
    connection = await getConnection();
    
    let keyResult;
    
    if (dbConfig.type === 'oracle') {
      keyResult = await connection.execute(
        'SELECT b.token_key FROM giis_token_key b WHERE b.key_id = :keyId',
        { keyId }
      );
    } else if (dbConfig.type === 'mysql') {
      const [rows] = await connection.execute(
        'SELECT b.token_key FROM giis_token_key b WHERE b.key_id = ?',
        [keyId]
      );
      keyResult = { rows };
    }

    if (!keyResult?.rows?.[0]?.[0]) {
      console.error('KeyId not found in database:', keyId);
      throw new Error('Invalid token');
    }

    const tokenKey = keyResult.rows[0][0];
    const secretKey = Buffer.from(tokenKey, 'base64');
    
    const verifiedToken = jwt.verify(token, secretKey);
    const jwtId = verifiedToken.jti;

    if (!jwtId) {
      console.error('Token does not contain jwtId');
      throw new Error('Invalid token');
    }

    let userResult;
    
    if (dbConfig.type === 'oracle') {
      userResult = await connection.execute(
        'SELECT a.user_id FROM giis_auth_session a WHERE a.jwt_id = :jwtId',
        { jwtId }
      );
    } else if (dbConfig.type === 'mysql') {
      const [rows] = await connection.execute(
        'SELECT a.user_id FROM giis_auth_session a WHERE a.jwt_id = ?',
        [jwtId]
      );
      userResult = { rows };
    }

    if (!userResult.rows || !userResult.rows[0]) {
      console.error('JwtId not found in database:', jwtId);
      throw new Error('Invalid token');
    }

    const userId = userResult.rows[0][0];

    if (req.method === 'GET') {
      req.query.appUser = userId;
    } else {
      req.body.appUser = userId;
    }

    next();

  } catch (error) {
    console.error('Token validation error:', error);
    
    let errorMessage;
    if (error.name === 'TokenExpiredError') {
      errorMessage = 'Token has expired';
    } else if (error.name === 'JsonWebTokenError') {
      errorMessage = 'Invalid token';
    } else {
      errorMessage = error.message;
    }
    
    return res.status(401).json({ 
      success: false, 
      error: errorMessage 
    });
  } finally {
    if (connection) {
      try {
        if (dbConfig.type === 'oracle') {
          await connection.close();
        } else if (dbConfig.type === 'mysql') {
          connection.release();
        }
      } catch (err) {
        console.error('Error closing connection:', err);
      }
    }
  }
}

// Execute named endpoint
app.all('/api/:path(*)', async (req, res) => {
  let connection;
  try {
    const endpointsPath = path.join(process.cwd(), 'endpoints.json');
    let endpoints = [];
    try {
      const fileContent = fs.readFileSync(endpointsPath, 'utf8');
      endpoints = JSON.parse(fileContent);
    } catch (error) {
      console.error('Error reading endpoints file:', error);
      return res.status(500).json({ success: false, error: 'Failed to read endpoints configuration' });
    }

    const fullRequestPath = req.path;
    console.log(`Incoming full request path: ${fullRequestPath}`);
    
    let matchedEndpoint = null;
    let pathParams = {};

    for (const endpoint of endpoints) {
        if (endpoint.method !== req.method) {
            continue;
        }

        if (!endpoint.url || !endpoint.url.startsWith('/api/')) {
            console.log(`Skipping endpoint ${endpoint.name}: URL "${endpoint.url}" does not start with /api/`);
            continue;
        }
        
        console.log(`Checking endpoint: ${endpoint.name} (URL: ${endpoint.url}, Method: ${endpoint.method}) against Path: ${fullRequestPath}, Method: ${req.method}`);
        
        const { regex, paramNames } = convertUrlPatternToRegex(endpoint.url);
        
        if (regex) {
            console.log(`  Generated Regex: ${regex}`);
            const match = fullRequestPath.match(regex);
            if (match) {
                console.log(`  Regex Matched!`);
                matchedEndpoint = endpoint;
                if (match.groups) {
                    pathParams = { ...match.groups }; 
                    console.log(`  Extracted path parameters:`, pathParams);
                } else {
                    console.log(`  Regex matched, but no named groups found.`);
                }
                break;
            } else {
                console.log(`  Regex did NOT match.`);
            }
        } else {
            console.log(`  Could not generate valid Regex for URL pattern.`);
        }
    }

    const endpoint = matchedEndpoint;
    if (!endpoint) {
      return res.status(404).json({ success: false, error: 'Endpoint not found for the given full path and method', requestedPath: fullRequestPath });
    }

    // Add token validation middleware
    await new Promise((resolve, reject) => {
      validateToken(req, res, resolve, endpoint);
    });

    const isGetRequest = req.method === 'GET';
    const hasProcedure = endpoint.sqlProcedure && endpoint.sqlProcedure.trim() !== '';
    const hasQuery = !!endpoint.sqlQuery && endpoint.sqlQuery.trim() !== '';
    const isProcedureOnly = hasProcedure && !hasQuery;
    const isQueryOnly = !hasProcedure && hasQuery;
    const isProcedureThenQuery = hasProcedure && hasQuery;

    let validatedProcParams = {};
    let validatedQueryParams = {};
    let executionProcedureBody = '';
    let sqlToExecuteQuery = '';
    let originalProcedureBody = '';

    // Validate procedure parameters first if needed
    if (isProcedureOnly || isProcedureThenQuery) {
      // Validate payload parameters if they exist
      if (endpoint.jsonSchema) {
        console.log("Validating payload parameters...");
        const validationErrors = validateJsonPayload(endpoint.jsonSchema, req.body);
        
        if (validationErrors.length > 0) {
          return res.status(400).json({
            success: false,
            errors: validationErrors
          });
        }
      }

      // Include both query params and body for non-GET requests
      const procBindSource = isGetRequest 
        ? { ...pathParams, ...req.query }
        : { ...pathParams, ...req.query, ...req.body };
      
      originalProcedureBody = endpoint.sqlProcedure.trim()
        .replace(/^BEGIN\s*|\s*;?\s*END;?$/gi, '')
        .trim()
        .replace(/;$/, '');
      
      executionProcedureBody = originalProcedureBody;

      // Check for dollar parameter first
      const dollarParam = extractDollarParam(originalProcedureBody);
      if (dollarParam) {
        console.log(`Found dollar parameter: ${dollarParam}`);
        // Use exact case from SQL for binding
        const paramValue = typeof procBindSource === 'string' 
          ? procBindSource 
          : JSON.stringify(procBindSource);

        // Basic SQL injection prevention
        const sanitizedValue = paramValue.replace(/'/g, "''");
        
        // Use exact case for parameter name
        if (dbConfig.type === 'oracle') {
          validatedProcParams[dollarParam] = {
            dir: oracledb.BIND_IN,
            type: oracledb.STRING,
            val: sanitizedValue
          };
        } else {
          validatedProcParams[dollarParam] = sanitizedValue;
        }
        
        console.log(`Bound dollar parameter ${dollarParam}:`, validatedProcParams[dollarParam]);

        // Keep original case in the SQL
        executionProcedureBody = executionProcedureBody.replace(
          new RegExp(`\\$${dollarParam}\\b`, 'g'),
          `:${dollarParam}`
        );
      }

      // Process regular parameters
      const procParamDetails = extractParamDetails(originalProcedureBody);
      const pathConfigs = endpoint.pathParams || [];
      const queryConfigs = endpoint.queryParams || [];

      // Validate path parameters
      procParamDetails.pathParams.forEach(param => {
        const value = procBindSource[param];
        const paramConfig = pathConfigs.find(p => p.name === param);
        
        if (value !== undefined) {
          const regex = new RegExp(`\\{${param}\\}`, 'g');
          executionProcedureBody = executionProcedureBody.replace(regex, `:${param}`);
          validatedProcParams[param] = convertAndValidateValue("path", value, param, paramConfig);
        } else if (paramConfig?.required) {
            throw new Error(`Required path parameter '${param}' must be provided.`);
        }
      });

      // Validate query parameters
      procParamDetails.queryParams.forEach(param => {
        const value = procBindSource[param];
        const paramConfig = queryConfigs.find(p => p.name === param);
        validatedProcParams[param] = convertAndValidateValue("query", value, param, paramConfig);
      });

      // Setup output parameters
      if (dbConfig.type === 'oracle') {
        procParamDetails.outputParams.forEach(param => {
          const regex = new RegExp(`@${param}`, 'g');
          executionProcedureBody = executionProcedureBody.replace(regex, `:${param}`);
          
          // Find parameter configuration from all parameter types
          const paramConfig = [...(endpoint.pathParams || []), ...(endpoint.queryParams || [])]
            .find(p => p.name === param);
          
          validatedProcParams[param] = {
            dir: oracledb.BIND_OUT,
            type: getOracleType(param, paramConfig),
            maxSize: getOracleType(param, paramConfig) === oracledb.STRING ? 4000 : undefined
          };
          console.log(`Bind OUT parameter: ${param}, Config:`, validatedProcParams[param]);
        });
      }
    }

    // Validate query parameters if needed
    if (isQueryOnly || isProcedureThenQuery) {
      console.log("Validating query parameters...");
      const queryBindSource = isGetRequest ? { ...pathParams, ...req.query } : { ...pathParams, ...req.body };
      
      sqlToExecuteQuery = endpoint.sqlQuery;
      const queryParamDetails = extractParamDetails(sqlToExecuteQuery);
      const pathConfigs = endpoint.pathParams || [];
      const queryConfigs = endpoint.queryParams || [];

      // Validate path parameters and prepare SQL
      queryParamDetails.pathParams.forEach(param => {
        const value = queryBindSource[param];
        const paramConfig = pathConfigs.find(p => p.name === param);
        const regex = new RegExp(`\\{${param}\\}`, 'g');
        sqlToExecuteQuery = sqlToExecuteQuery.replace(regex, `:${param}`);
        validatedQueryParams[param] = convertAndValidateValue("path", value, param, paramConfig);
      });

      // Validate query parameters and prepare bindings
      queryParamDetails.queryParams.forEach(param => {
        const value = queryBindSource[param];
        const paramConfig = queryConfigs.find(p => p.name === param);
        validatedQueryParams[param] = convertAndValidateValue("query", value, param, paramConfig);
      });

      console.log('Prepared SQL:', sqlToExecuteQuery);
      console.log('Validated parameters:', validatedQueryParams);
    }

    // Now establish database connection and execute
    console.log("All parameters validated. Connecting to database...");

    let procedureResult = null;
    let queryResult = null;
    
    // Execute procedure if needed
    if (isProcedureOnly || isProcedureThenQuery) {
      console.log('Executing procedure:', executionProcedureBody);
      procedureResult = await executeProcedure(originalProcedureBody, executionProcedureBody, validatedProcParams, { 
        autoCommit: !isGetRequest 
      });
      console.log('Procedure executed successfully:', procedureResult);
    }

    // Execute query if needed
    if (isQueryOnly || (isProcedureThenQuery && procedureResult)) {
      // Prepare SQL and parameters for query execution
      let finalSqlToExecute = sqlToExecuteQuery;
      let finalQueryParams = { ...validatedQueryParams };
      
      // If we have procedure output params, use them directly
      if (procedureResult?.outBinds) {
        console.log('Using procedure output parameters:', procedureResult.outBinds);
        // Replace @param with the actual output values in the SQL, handling string values properly
        let modifiedSql = sqlToExecuteQuery;
        for (const [key, value] of Object.entries(procedureResult.outBinds)) {
          const paramRegex = new RegExp(`@${key}\\b`, 'g');
          if (typeof value === 'string') {
            // For string values that might be used in function calls, wrap in quotes
            const quotedValue = `'${value}'`;
            modifiedSql = modifiedSql.replace(paramRegex, quotedValue);
            console.log(`Replaced @${key} with quoted value: ${quotedValue}`);
          } else {
            modifiedSql = modifiedSql.replace(paramRegex, value);
            console.log(`Replaced @${key} with value: ${value}`);
          }
        }
        finalSqlToExecute = modifiedSql;
        console.log('Modified SQL with output values:', finalSqlToExecute);
      }

      // Prepare query parameters based on database type
      if (dbConfig.type === 'oracle') {
        // Oracle needs named parameters
        const oracleBindParams = {};
        
        for (const [key, value] of Object.entries(finalQueryParams)) {
          // Skip parameters that were handled as output parameters
          if (procedureResult?.outBinds && key in procedureResult.outBinds) continue;

          // Find parameter configuration
          const paramConfig = [...(endpoint.pathParams || []), ...(endpoint.queryParams || [])]
            .find(p => p.name === key);

          if (value === null) {
            oracleBindParams[key] = { 
              val: null, 
              type: paramConfig?.type === 'number'
                ? oracledb.NUMBER 
                : paramConfig?.type === 'date'
                ? oracledb.DATE
                : oracledb.STRING 
            };
            continue;
          }

          switch (paramConfig?.type) {
            case 'number':
              oracleBindParams[key] = { 
                val: paramConfig?.type === 'number' ? Number(value) : String(value), 
                type: paramConfig?.type === 'number' ? oracledb.NUMBER : oracledb.STRING 
              };
              break;
            case 'date':
              const dateFormat = paramConfig?.dateConstraints?.dateFormat || 'YYYY-MM-DD';
              const sqlString = `TO_DATE (:${key}, '${dateFormat}')`;
              oracleBindParams[key] = { 
                val: value,
                type: oracledb.STRING
              };
              finalSqlToExecute = finalSqlToExecute.replace(
                new RegExp(`:${key}\\b`, 'g'), 
                sqlString
              );
              break;
            default: // string and others
              oracleBindParams[key] = { 
                val: String(value), 
                type: oracledb.STRING 
              };
          }
        }
        
        console.log('Final SQL to execute:', finalSqlToExecute);
        console.log('Final bind parameters:', oracleBindParams);
        
        // Execute the Oracle query
        queryResult = await executeQuery(finalSqlToExecute, oracleBindParams, { 
          outFormat: oracledb.OUT_FORMAT_OBJECT,
          autoCommit: !isGetRequest && isQueryOnly 
        });
      } else if (dbConfig.type === 'mysql') {
        // MySQL parameter handling - maintain consistency with Oracle's approach
        let mysqlSql = finalSqlToExecute;
        const mysqlParams = {};
        
        // Check if we have output parameters from the procedure
        if (procedureResult?.outBinds && Object.keys(procedureResult.outBinds).length > 0) {
          console.log('Using procedure output parameters:', procedureResult.outBinds);
          
          // Replace @param with the actual output values in the SQL
          for (const [key, value] of Object.entries(procedureResult.outBinds)) {
            const paramRegex = new RegExp(`@${key}\\b`, 'g');
            if (typeof value === 'string') {
              // For string values, wrap in quotes
              mysqlSql = mysqlSql.replace(paramRegex, `'${value}'`);
              console.log(`Replaced @${key} with quoted value: '${value}'`);
            } else {
              // For non-string values, use as is
              mysqlSql = mysqlSql.replace(paramRegex, value);
              console.log(`Replaced @${key} with value: ${value}`);
            }
          }
        }
        
        // Handle query parameters (:param)
        const queryParamRegex = /:(\w+)\b/g;
        let match;
        
        // First collect all unique parameter names
        const uniqueParams = new Set();
        while ((match = queryParamRegex.exec(mysqlSql)) !== null) {
          const paramName = match[1];
          uniqueParams.add(paramName);
        }

        // For each unique parameter, prepare the value
        for (const paramName of uniqueParams) {
          const value = finalQueryParams[paramName];
          const paramConfig = [...(endpoint.pathParams || []), ...(endpoint.queryParams || [])]
            .find(p => p.name === paramName);

          // Convert value based on type
          let processedValue;
          if (value === null) {
            processedValue = null;
          } else if (paramConfig?.type === 'number') {
            processedValue = Number(value);
          } else if (paramConfig?.type === 'date') {
            processedValue = value;
          } else {
            processedValue = String(value);
          }

          mysqlParams[paramName] = processedValue;
        }

        console.log('MySQL SQL to execute:', mysqlSql);
        console.log('MySQL parameters:', mysqlParams);

        // Execute the MySQL query with named parameters
        connection = await getConnection();
        const [rows] = await connection.execute(mysqlSql, mysqlParams);
        queryResult = { rows };
      }
    }

    res.json({
      success: true,
      data: queryResult?.rows || []
    });

  } catch (error) {
    let statusCode = error.status || 500;
    if (error.message.includes('must be provided') || 
        error.message.includes('not found from procedure') ||
        error.message.includes('Invalid')
    ) {
        statusCode = 400;
        console.error('Validation failed:', error.message);
    } else {
      console.error('Error during endpoint execution:', error);
    }
    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to execute endpoint',
    });
  } finally {
    if (connection) {
      try {
        if (dbConfig.type === 'oracle') {
          await connection.close();
        } else if (dbConfig.type === 'mysql') {
          connection.release();
        }
        console.log('Connection released successfully');
      } catch (err) {
        console.error('Error releasing connection:', err);
      }
    }
  }
});

// Add graceful shutdown for MySQL pool
process.on('SIGINT', async () => {
  if (dbConfig.type === 'mysql' && mysqlPool) {
    console.log('Closing MySQL connection pool...');
    await mysqlPool.end();
  }
  process.exit(0);
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});