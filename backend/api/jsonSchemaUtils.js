import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { parse } from 'date-fns';

// Initialize AJV with formats
const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

ajv.addKeyword({ 
  keyword: 'precision',
  type: 'number',
  errors: true,
  validate: function precisionValidator(schemaPrecision, data) {
    if (typeof data !== 'number') return true;
    const parts = data.toString().split('.');
    const valid = !(parts.length === 2 && parts[1].length > schemaPrecision);

    if (!valid) {
      let message;
      if (schemaPrecision === 0) {
        message = "must be a whole number.";
      } else {
        message = `must not have more than ${schemaPrecision} decimal places.`;
      }

      precisionValidator.errors = [{
        keyword: 'precision',
        message,
        params: { precision: schemaPrecision }
      }];
    }

    return valid;
  }
});

ajv.addKeyword({
  keyword: 'customDateFormat',
  type: 'string',
  errors: true,
  validate: function dateFormatValidator(schemaDateFormat, data) {
    if (typeof data !== 'string') return true;
    let valid = true;

    try {
      const fnsFormat = schemaDateFormat
        .replace(/YYYY/g, 'yyyy')
        .replace(/YY/g, 'yy')
        .replace(/MM/g, 'MM')
        .replace(/DD/g, 'dd')
        .replace(/HH24/g, 'HH')
        .replace(/HH/g, 'hh')
        .replace(/MI/g, 'mm')
        .replace(/SS/g, 'ss')
        .replace(/AM|PM/g, 'a');

      const parsedDate = parse(data, fnsFormat, new Date());

      if (isNaN(parsedDate.getTime())) {
        valid = false;
      }
    } catch (e) {
      valid = false;
    }

    if (!valid) {
      dateFormatValidator.errors = [{
        keyword: 'customDateFormat',
        message: `must match date format ${schemaDateFormat}.`,
        params: { format: schemaDateFormat }
      }];
    }

    return valid;
  }
});

/**
 * Generates a JSON Schema from payload and payloadParams
 * @param {Array} payloadParams - The payload parameters
 * @returns {Object} The generated JSON Schema
 */
export function generateSchema(payloadParams) {
  try {
    if (!payloadParams || payloadParams.length === 0) {
      return null;
    }

    const schema = {
      $schema: "http://json-schema.org/draft-07/schema#",
      type: "object",
      properties: {},
      required: []
    };
  
    for (const param of payloadParams) {
      const path = param.name.split(".");
      addPathToSchema(schema, path, param);
    }
  
    return schema;
  } catch (error) {
    console.error('Error generating schema:', error);
    return null;
  }
}

function addPathToSchema(schema, pathParts, param) {
  const currentPart = pathParts[0];
  const isArray = currentPart.endsWith('[]');
  const key = isArray ? currentPart.slice(0, -2) : currentPart;

  if (!schema.properties) schema.properties = {};

  if (pathParts.length === 1) {
    // Final leaf node
    schema.properties[key] = buildSchemaForParam(param);

    if (param.required) {
      if (!schema.required) schema.required = [];
      if (!schema.required.includes(key)) {
        schema.required.push(key);
      }
    }
  } else {
    if (!schema.properties[key]) {
      schema.properties[key] = isArray
        ? { type: "array", items: { type: "object", properties: {}, required: [] } }
        : { type: "object", properties: {}, required: [] };
    } else {
      // 🛡 Ensure 'items' and 'properties' exist if array
      if (isArray) {
        if (!schema.properties[key].items) {
          schema.properties[key].items = { type: "object", properties: {}, required: [] };
        } else if (!schema.properties[key].items.properties) {
          schema.properties[key].items.properties = {};
          schema.properties[key].items.required = [];
        }
      } else {
        // 🛡 Ensure properties exist for object
        if (!schema.properties[key].properties) {
          schema.properties[key].properties = {};
          schema.properties[key].required = [];
        }
      }
    }

    const nextSchema = isArray ? schema.properties[key].items : schema.properties[key];
    addPathToSchema(nextSchema, pathParts.slice(1), param);
  }
}

function buildSchemaForParam(param) {
  const type = getType(param.type);
  const schemaProperty = { type };

  if (param.type === 'number') {
    addNumberConstraints(schemaProperty, param.numberConstraints);
  } else if (param.type === 'string') {
    addStringConstraints(schemaProperty, param.stringConstraints);
  } else if (param.type === 'date') {
    addDateConstraints(schemaProperty, param.dateConstraints);
  }

  return schemaProperty;
}

function getType(type) {
  const mapping = {
    string: "string",
    number: "number",
    integer: "integer",
    boolean: "boolean",
    object: "object",
    array: "array",
    date: "string" // always map "date" as "string"
  };
  return mapping[type.toLowerCase()] || "string";
}

function addNumberConstraints(schemaProperty, constraints) {
  if (constraints) {
    if (constraints.minimum !== undefined) {
      schemaProperty.minimum = constraints.minimum;
    }
    if (constraints.maximum !== undefined) {
      schemaProperty.maximum = constraints.maximum;
    }
    if (constraints.precision !== undefined) {
      schemaProperty.precision = constraints.precision;
    }
  }
}

function addStringConstraints(schemaProperty, constraints) {
  if (constraints) {
    if (constraints.maxLength !== undefined) {
      schemaProperty.maxLength = constraints.maxLength;
    }
    if (constraints.allowedValues) {
      schemaProperty.enum = constraints.allowedValues.split(",").map(v => v.trim());
    }
  }
}

function addDateConstraints(schemaProperty, constraints) {
  if (constraints && constraints.dateFormat) {
    schemaProperty.customDateFormat = constraints.dateFormat;
    delete schemaProperty.format;
  }
}

/**
 * Validate a payload against a generated schema
 * @param {Object} schema - JSON Schema
 * @param {Object} payload - Payload to validate
 * @returns {Array} List of user-friendly error messages
 */
export function validateJsonPayload(schema, payload) {
  const validate = ajv.compile(schema);
  const valid = validate(payload);

  if (valid) {
    return []; // No errors
  }

  const errors = [];

  for (const err of validate.errors) {
    const path = formatInstancePath(err.instancePath);
    let message = path ? `${path}: value ` : 'Value ';
    console.log(`${path}: ${err.message}`);

    switch (err.keyword) {
      case 'required':
        message = `${path ? path + '.' : ''}${err.params.missingProperty}: value cannot be null or empty.`;
        break;
      case 'type':
        message += `must be a ${err.params.type}.`;
        break;
      case 'enum':
        message += `must be one of [${err.params.allowedValues.join(', ')}].`;
        break;
      case 'minimum':
        message += `must be greater than or equal to ${err.params.limit}.`;
        break;
      case 'maximum':
        message += `must be less than or equal to ${err.params.limit}.`;
        break;
      case 'maxLength':
        message += `must not be longer than ${err.params.limit} characters.`;
        break;
      case 'customDateFormat':
      case 'precision':
        message += `${err.message}`;
        break;
      default:
        message = `${path}: ${err.message}.`;
        break;
    }

    errors.push(message);
  }

  return errors;
}

/**
 * Helper: Get field schema by path parts
 */
function getFieldSchema(schema, pathParts) {
  let current = schema;

  for (const part of pathParts) {
    if (!current) return null;

    // Dive into arrays
    if (current.type === 'array' && current.items) {
      current = current.items;
    }

    // Skip array indexes (like '0', '1', etc)
    if (!isNaN(part)) {
      continue;
    }

    if (current.properties && current.properties[part]) {
      current = current.properties[part];
    } else {
      return null;
    }
  }

  // Dive again into items if final node is still array
  while (current && current.type === 'array' && current.items) {
    current = current.items;
  }

  return current;
}

// Utility to count decimals
function countDecimals(value) {
  if (Math.floor(value) === value) return 0;
  const str = value.toString();
  return str.includes('.') ? str.split('.')[1].length : 0;
}

function formatInstancePath(instancePath) {
  if (!instancePath) return '';
  const parts = instancePath.split('/').filter(Boolean); // Remove empty parts from leading slash
  let formatted = '';

  for (const part of parts) {
    if (/^\d+$/.test(part)) { // It's a number
      formatted += `[${part}]`;
    } else {
      if (formatted.length > 0) {
        formatted += '.';
      }
      formatted += part;
    }
  }

  return formatted;
}

/**
 * Helper: Convert instancePath to parts for getFieldSchema
 */
function getPathParts(instancePath) {
  return instancePath.split('/').filter(Boolean);
}
