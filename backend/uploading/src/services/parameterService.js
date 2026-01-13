import { ParameterRepository } from '../db/repositories/parameterRepository.js';

const parameterRepository = new ParameterRepository();

export async function getFileLocationParameter(paramName) {
  try {
    const result = await parameterRepository.getFileLocationParameter(paramName);
    return result;
  } catch (error) {
    console.error('Error getting parameter:', error);
    throw error;
  }
}

export async function getParameterValue(paramName) {
  try {
    const result = await parameterRepository.getParameterValue(paramName);
    return result;
  } catch (error) {
    console.error('Error getting parameter value:', error);
    throw error;
  }
}

export async function getParamValueNumeric(paramName) {
  try {
    const result = await parameterRepository.getParameterValueNumeric(paramName);
    return result;
  } catch (error) {
    console.error('Error getting parameter value:', error);
    throw error;
  }
}