import {metaGet} from './db.js';

export async function backupHeader() {
  return `{"format":"history-vault","version":1,"exportedAt":${JSON.stringify(new Date().toISOString())},"blacklist":${JSON.stringify(await metaGet('blacklist', []))},"records":[`;
}
