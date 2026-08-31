import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATE_FILE = path.join(__dirname, '..', 'data', 'state.json');

const defaultState = {
  subscribers: [], // list of chat IDs
  alerts: [],      // [{ id, chatId, symbol, targetPrice, direction, createdPrice }]
  cooldowns: {},   // { key: timestamp }
  virtualPositions: [],  // open virtual/paper trades
  positionHistory: [],   // closed virtual trades with results
  userSettings: {},      // { chatId: { accountBalance, riskPercent } }
  settings: {
    signalsEnabled: true,
    volumeAlerts: true,
    rsiAlerts: true,
    emaAlerts: true,
    fundingAlerts: true
  }
};

export function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const data = fs.readFileSync(STATE_FILE, 'utf-8');
      return { ...defaultState, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Error loading state:', err.message);
  }
  saveState(defaultState);
  return { ...defaultState };
}

export function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving state:', err.message);
  }
}
