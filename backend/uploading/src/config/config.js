import { ParameterRepository } from '../db/repositories/parameterRepository.js';

const parameterRepository = new ParameterRepository();

let settings = {};

const initSettings = async () => {
  try {
    settings = await parameterRepository.getInitalSettings();
    console.log("✅ Settings initialized");
  } catch (err) {
    console.error("❌ Failed to load settings", err);
  }
};

const getSettings = () => settings;

export { initSettings, getSettings };