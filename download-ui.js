export function downloadType(record) {
  const name=(record.filename||record.title||'').toLowerCase(),mime=record.mime||'';
  if(/\.pdf$/.test(name)||mime==='application/pdf')return 'pdf';
  if(/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif|heic)$/.test(name)||mime.startsWith('image/'))return 'image';
  if(/\.(mp4|webm|mkv|mov|avi)$/.test(name)||mime.startsWith('video/'))return 'video';
  if(/\.(mp3|wav|ogg|flac|m4a|aac)$/.test(name)||mime.startsWith('audio/'))return 'audio';
  if(/\.(zip|rar|7z|gz|tar)$/.test(name))return 'archive';
  if(/\.(xlsx?|ods|csv)$/.test(name)||/spreadsheetml|vnd\.ms-excel|opendocument.spreadsheet/.test(mime))return 'sheet';
  if(/\.(docx?|odt|txt|rtf|md)$/.test(name)||mime.startsWith('text/'))return 'document';
  return 'file';
}
export const downloadFields=['fileExists','mime','filename','title','state','fileSize'];
export function mergeDownloadDetails(rows,updates) {
  const byId=new Map(updates.map(row=>[row.id,row]));let changed=false;
  const merged=rows.map(row=>{const update=byId.get(row.id);if(!update)return row;if(downloadFields.some(key=>row[key]!==update[key])){changed=true;return {...row,...update};}return row;});
  return {rows:merged,changed};
}
